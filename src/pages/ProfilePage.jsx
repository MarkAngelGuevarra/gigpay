import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { Save, User } from 'lucide-react';

const isUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));

const ProfilePage = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [profile, setProfile] = useState({
    display_name: '',
    bio: '',
    company_name: '',
    portfolio_url: '',
    role: ''
  });

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    setFetchError(null);
    const isSim = !!(user.is_simulation_mode || user.user_metadata?.is_simulation_mode || !isUuid(user.id));
    if (isSim) {
      setProfile({
        display_name: user.user_metadata?.display_name || (user.email?.includes?.('client') ? 'Demo client' : 'Demo freelancer'),
        bio: 'Demo account (simulation only, nothing on-chain).',
        company_name: '',
        portfolio_url: '',
        role: user.user_metadata?.role || 'client'
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;
      if (data) {
        setProfile({
          display_name: data.display_name || '',
          bio: data.bio || '',
          company_name: data.company_name || '',
          portfolio_url: data.portfolio_url || '',
          role: data.role || ''
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setFetchError('Failed to load your profile. Check your connection and try again.');
      addToast('Failed to load profile', 'error');
    } finally {
      setLoading(false);
    }
  }, [user, addToast]);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user, fetchProfile]);

  const handleChange = (e) => {
    setProfile(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const isSim = !!(user?.is_simulation_mode || user?.user_metadata?.is_simulation_mode || !isUuid(user?.id));
    if (isSim) {
      addToast('Simulation only: this demo profile is not saved anywhere.', 'info');
      return;
    }

    try {
      setSaving(true);
      
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: profile.display_name,
          bio: profile.bio,
          company_name: profile.company_name,
          portfolio_url: profile.portfolio_url
        })
        .eq('id', user.id);

      if (error) throw error;
      
      addToast('Profile updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating profile:', error);
      addToast(error.message || 'Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem' }}>Loading profile...</div>;

  if (fetchError) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '2rem' }}>
        <div className="glass-panel" role="alert" style={{ textAlign: 'center', padding: '2rem', border: '1px solid #ef4444' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#f87171' }}>Profile Unavailable</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem' }}>{fetchError}</p>
          <button type="button" className="btn btn-primary" onClick={fetchProfile}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isClient = profile.role === 'client';

  return (
    <div className="animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '2rem' }}>
      <div className="glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: 'var(--primary)', padding: '1rem', borderRadius: '50%' }}>
            <User size={32} color="white" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.2rem' }}>Your Profile</h2>
            <p style={{ color: 'var(--text-muted)', margin: 0, textTransform: 'capitalize' }}>
              {profile.role} Account
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="profile-display-name" style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Display Name
            </label>
            <input 
              id="profile-display-name"
              type="text"
              name="display_name"
              value={profile.display_name}
              onChange={handleChange}
              placeholder="John Doe"
              style={{
                width: '100%', padding: '0.75rem 1rem', borderRadius: '0.5rem',
                background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)',
                color: 'white', fontSize: '1rem'
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="profile-bio" style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Short Bio
            </label>
            <textarea 
              id="profile-bio"
              name="bio"
              value={profile.bio}
              onChange={handleChange}
              placeholder="Tell us a little about yourself..."
              rows={4}
              style={{
                width: '100%', padding: '0.75rem 1rem', borderRadius: '0.5rem',
                background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)',
                color: 'white', fontSize: '1rem', resize: 'vertical'
              }}
            />
          </div>

          {isClient ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label htmlFor="profile-company-name" style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                Company Name
              </label>
              <input 
                id="profile-company-name"
                type="text"
                name="company_name"
                value={profile.company_name}
                onChange={handleChange}
                placeholder="Company or school (optional)"
                style={{
                  width: '100%', padding: '0.75rem 1rem', borderRadius: '0.5rem',
                  background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)',
                  color: 'white', fontSize: '1rem'
                }}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label htmlFor="profile-portfolio-url" style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                Portfolio URL
              </label>
              <input 
                id="profile-portfolio-url"
                type="url"
                name="portfolio_url"
                value={profile.portfolio_url}
                onChange={handleChange}
                placeholder="https://myportfolio.com"
                style={{
                  width: '100%', padding: '0.75rem 1rem', borderRadius: '0.5rem',
                  background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)',
                  color: 'white', fontSize: '1rem'
                }}
              />
            </div>
          )}

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={saving}
            style={{ marginTop: '1rem', alignSelf: 'flex-start' }}
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Profile'}
          </button>

        </form>
      </div>
    </div>
  );
};

export default ProfilePage;
