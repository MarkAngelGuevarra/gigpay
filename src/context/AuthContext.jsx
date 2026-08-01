import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { connectWallet as connectFreighter } from '../lib/stellar';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [publicKey, setPublicKey] = useState(null);

  useEffect(() => {
    let mounted = true;
    // Safety timeout in case network delays Supabase response on Vercel
    const timeoutId = setTimeout(() => {
      if (mounted) setIsLoading(false);
    }, 2500);

    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setIsLoading(false);
    }).catch((err) => {
      console.error("Supabase session fetch error:", err);
      if (mounted) setIsLoading(false);
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email, password, metadata) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata, // e.g., { role: 'client' | 'freelancer', display_name: 'John Doe' }
      }
    });
    if (error) throw error;
    return data;
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setPublicKey(null);
  };

  const connectWallet = async () => {
    const res = await connectFreighter();
    if (res.error) throw new Error(res.error);
    setPublicKey(res.publicKey);
    return res.publicKey;
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signUp, signIn, signOut, publicKey, connectWallet }}>
      {children}
    </AuthContext.Provider>
  );
};
