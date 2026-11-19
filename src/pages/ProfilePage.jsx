import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { Save, User, AlertTriangle } from 'lucide-react';

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
    role: '',
  });

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    setFetchError(null);
    const isSim = !!(user.is_simulation_mode || user.user_metadata?.is_simulation_mode || !isUuid(user.id));
    if (isSim) {
      setProfile({
        display_name: user.user_metadata?.display_name || (user.email?.includes?.('client') ? 'Demo Client' : 'Demo Freelancer'),
        bio: 'Demo account (simulation only, nothing on-chain).',
        company_name: '',
        portfolio_url: '',
        role: user.user_metadata?.role || 'client',
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
          role: data.role || '',
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
    setProfile((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
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
          portfolio_url: profile.portfolio_url,
        })
        .eq('id', user.id);

      if (error) throw error;
      addToast('Profile updated successfully.', 'success');
    } catch (error) {
      console.error('Error updating profile:', error);
      addToast(error.message || 'Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center text-[14px] text-[var(--text-muted)]">
        Loading profile…
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="animate-fade-in mx-auto max-w-xl py-8">
        <div
          className="gp-card border-[var(--signal-danger-border)] p-7 text-center"
          role="alert"
        >
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--signal-danger-bg)] text-[var(--signal-danger)]">
            <AlertTriangle size={20} />
          </div>
          <h2 className="m-0 text-lg font-semibold text-[var(--text-primary)]">Profile Unavailable</h2>
          <p className="mt-2 mb-5 text-[14px] text-[var(--text-muted)]">{fetchError}</p>
          <button type="button" className="gp-btn gp-btn-primary" onClick={fetchProfile}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isClient = profile.role === 'client';

  return (
    <div className="animate-fade-in mx-auto max-w-xl py-4 sm:py-8">
      <div className="gp-card p-6 sm:p-8">
        <div className="mb-7 flex items-center gap-4 border-b border-[var(--border-subtle)] pb-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--bg-subtle)] text-[var(--text-primary)] ring-1 ring-[var(--border-subtle)]">
            <User size={22} />
          </div>
          <div>
            <h1 className="m-0 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              Your Profile
            </h1>
            <p className="mt-0.5 mb-0 text-[13px] capitalize text-[var(--text-muted)]">
              {profile.role || 'Member'} account
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-5">
          <div className="gp-field">
            <label htmlFor="profile-display-name" className="gp-label">
              Display Name
            </label>
            <input
              id="profile-display-name"
              type="text"
              name="display_name"
              value={profile.display_name}
              onChange={handleChange}
              placeholder="Maria Santos"
              className="gp-input"
            />
            {!isClient && (
              <p className="gp-hint">
                Displayed on your branded GigPay Pay QR card when clients scan to lock funds.
              </p>
            )}
          </div>

          <div className="gp-field">
            <label htmlFor="profile-bio" className="gp-label">
              Short Bio
            </label>
            <textarea
              id="profile-bio"
              name="bio"
              value={profile.bio}
              onChange={handleChange}
              placeholder="Tell clients or freelancers a little about your work…"
              rows={4}
              className="gp-textarea resize-y"
            />
          </div>

          {isClient ? (
            <div className="gp-field">
              <label htmlFor="profile-company-name" className="gp-label">
                Company Name
              </label>
              <input
                id="profile-company-name"
                type="text"
                name="company_name"
                value={profile.company_name}
                onChange={handleChange}
                placeholder="Company or studio (optional)"
                className="gp-input"
              />
            </div>
          ) : (
            <div className="gp-field">
              <label htmlFor="profile-portfolio-url" className="gp-label">
                Portfolio URL
              </label>
              <input
                id="profile-portfolio-url"
                type="url"
                name="portfolio_url"
                value={profile.portfolio_url}
                onChange={handleChange}
                placeholder="https://myportfolio.com"
                className="gp-input"
              />
            </div>
          )}

          <div className="pt-2">
            <button type="submit" className="gp-btn gp-btn-primary gp-btn-lg" disabled={saving}>
              <Save size={16} />
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfilePage;
