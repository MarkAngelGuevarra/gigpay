import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { Eye, EyeOff } from 'lucide-react';

const AuthPage = () => {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  
  const [isLogin, setIsLogin] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !(params.get('mode') === 'signup' || params.get('signup') === '1');
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('client');
  const [isLoading, setIsLoading] = useState(false);

  const processSubmit = async () => {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    if (!cleanEmail) {
      addToast("Please enter a valid email address.", "error");
      return;
    }

    if (!cleanPassword) {
      addToast("Please enter your password.", "error");
      return;
    }

    if (!isLogin && cleanPassword !== confirmPassword.trim()) {
      addToast("Passwords do not match.", "error");
      return;
    }

    setIsLoading(true);
    
    try {
      if (isLogin) {
        const data = await signIn(cleanEmail, cleanPassword);
        addToast("Logged in successfully!", "success");
        const userRole = data.user?.user_metadata?.role || 'client';
        navigate(userRole === 'client' ? '/client' : '/freelancer');
      } else {
        const data = await signUp(cleanEmail, cleanPassword, { role });
        if (data?.session || data?.user) {
          addToast("Pilot account created! Redirecting to your dashboard...", "success");
          navigate(role === 'client' ? '/client' : '/freelancer');
        } else {
          addToast("Account created successfully! You can now sign in.", "success");
          setIsLogin(true);
          setPassword('');
          setConfirmPassword('');
        }
      }
    } catch (error) {
      console.error("Auth error:", error);
      let errorMsg = error?.message || error?.error_description;
      if (!errorMsg || errorMsg === '{}' || (typeof errorMsg === 'object' && Object.keys(errorMsg).length === 0)) {
        errorMsg = "Invalid email or password. New tester? Click '🚀 Sign Up (New Tester)' at the top first!";
      }
      if (typeof errorMsg === 'string' && errorMsg.includes('Invalid login credentials')) {
        errorMsg = "Account not found yet! Click the '🚀 Sign Up (New Tester)' tab above to register your email first.";
      }
      if (typeof errorMsg === 'string' && errorMsg.includes('Email not confirmed')) {
        addToast("Please check your email and click the confirmation link before logging in.", "error");
      } else {
        addToast(String(errorMsg), "error");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    processSubmit();
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <img 
            src="/logo.png" 
            alt="GigPay Emblem" 
            style={{ 
              width: '52px', 
              height: '52px', 
              borderRadius: '12px', 
              boxShadow: '0 0 20px rgba(0, 242, 254, 0.4)', 
              border: '1px solid rgba(0, 242, 254, 0.3)' 
            }} 
          />
        </div>

        {/* Prominent Top Mode Switcher Tabs for Pilot Testers */}
        <div style={{
          display: 'flex',
          gap: '0.4rem',
          background: 'rgba(0, 0, 0, 0.35)',
          padding: '0.35rem',
          borderRadius: '0.65rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          marginBottom: '1.25rem'
        }}>
          <button
            type="button"
            onClick={() => setIsLogin(false)}
            style={{
              flex: 1.2,
              padding: '0.6rem 0.5rem',
              borderRadius: '0.45rem',
              border: !isLogin ? '1px solid rgba(0, 242, 254, 0.6)' : '1px solid transparent',
              background: !isLogin ? 'rgba(0, 242, 254, 0.16)' : 'transparent',
              color: !isLogin ? '#00f2fe' : 'var(--text-muted)',
              fontWeight: !isLogin ? 700 : 500,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            🚀 Sign Up (New Tester)
          </button>
          <button
            type="button"
            onClick={() => setIsLogin(true)}
            style={{
              flex: 0.8,
              padding: '0.6rem 0.5rem',
              borderRadius: '0.45rem',
              border: isLogin ? '1px solid rgba(0, 242, 254, 0.6)' : '1px solid transparent',
              background: isLogin ? 'rgba(0, 242, 254, 0.16)' : 'transparent',
              color: isLogin ? '#00f2fe' : 'var(--text-muted)',
              fontWeight: isLogin ? 700 : 500,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Sign In
          </button>
        </div>

        <h2 style={{ textAlign: 'center', marginBottom: '0.35rem', fontSize: '1.35rem' }}>
          {isLogin ? 'Welcome Back' : 'Create Pilot Tester Account'}
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
          {isLogin
            ? 'New to GigPay? Click "🚀 Sign Up (New Tester)" above to register your email.'
            : 'Register with your email to log your verified Week 4 pilot session.'}
        </p>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" 
              style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: 'white' }} 
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Password</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                style={{ 
                  width: '100%', 
                  padding: '0.75rem 2.8rem 0.75rem 0.75rem', 
                  borderRadius: '0.5rem', 
                  border: '1px solid var(--border)', 
                  background: 'rgba(0,0,0,0.2)', 
                  color: 'white' 
                }} 
                required
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  background: 'none',
                  border: 'none',
                  color: showPassword ? 'var(--primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.25rem',
                  transition: 'color 0.2s'
                }}
                title={showPassword ? "Hide password" : "Show password"}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {!isLogin && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Confirm Password</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••" 
                  style={{ 
                    width: '100%', 
                    padding: '0.75rem 2.8rem 0.75rem 0.75rem', 
                    borderRadius: '0.5rem', 
                    border: '1px solid var(--border)', 
                    background: 'rgba(0,0,0,0.2)', 
                    color: 'white' 
                  }} 
                  required
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    background: 'none',
                    border: 'none',
                    color: showPassword ? 'var(--primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.25rem',
                    transition: 'color 0.2s'
                  }}
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}
          
          {!isLogin && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>I am a...</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setRole('client')}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: role === 'client' ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: role === 'client' ? 'rgba(0, 240, 255, 0.1)' : 'rgba(0,0,0,0.2)',
                    color: role === 'client' ? 'var(--accent)' : 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontWeight: role === 'client' ? 'bold' : 'normal'
                  }}
                >
                  Client (Hiring)
                </button>
                <button
                  type="button"
                  onClick={() => setRole('freelancer')}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: role === 'freelancer' ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: role === 'freelancer' ? 'rgba(0, 240, 255, 0.1)' : 'rgba(0,0,0,0.2)',
                    color: role === 'freelancer' ? 'var(--accent)' : 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontWeight: role === 'freelancer' ? 'bold' : 'normal'
                  }}
                >
                  Freelancer (Working)
                </button>
              </div>
            </div>
          )}

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ marginTop: '1rem', opacity: isLoading ? 0.5 : 1 }}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button 
            onClick={() => {
              setIsLogin(!isLogin);
            }} 
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </div>

        {/* Grant Reviewer Quick-Fill */}
        <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ fontSize: '0.72rem', color: '#00f2fe', textAlign: 'center', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
            🔍 Grant Reviewer Quick-Fill (Shared Demo)
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '0.75rem' }}>
            Pilot Testers: Use <strong>🚀 Sign Up (New Tester)</strong> above with your own email!
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setEmail('client@gigpay.tech');
                setPassword('password123');
              }}
              style={{
                flex: 1,
                padding: '0.6rem 0.5rem',
                borderRadius: '0.5rem',
                border: '1px solid rgba(0, 242, 254, 0.3)',
                background: 'rgba(0, 242, 254, 0.06)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s',
                color: 'white'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0, 242, 254, 0.15)';
                e.currentTarget.style.borderColor = 'var(--primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0, 242, 254, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(0, 242, 254, 0.3)';
              }}
            >
              <div style={{ fontWeight: 'bold', fontSize: '0.82rem', color: '#00f2fe' }}>👤 Demo Client</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>client@gigpay.tech</div>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setEmail('freelancer@gigpay.tech');
                setPassword('password123');
              }}
              style={{
                flex: 1,
                padding: '0.6rem 0.5rem',
                borderRadius: '0.5rem',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                background: 'rgba(139, 92, 246, 0.06)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s',
                color: 'white'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)';
                e.currentTarget.style.borderColor = 'var(--secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)';
              }}
            >
              <div style={{ fontWeight: 'bold', fontSize: '0.82rem', color: '#c084fc' }}>🛠️ Demo Freelancer</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>freelancer@gigpay.tech</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
