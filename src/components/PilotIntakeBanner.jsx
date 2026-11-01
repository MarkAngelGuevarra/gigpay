import React, { useEffect } from 'react';
import { ExternalLink, Clock, CheckCircle2, Sparkles, AlertCircle } from 'lucide-react';
import { usePilotFeedbackState, PILOT_FORM_URL } from '../hooks/usePilotFeedbackState';

export default function PilotIntakeBanner() {
  const {
    state,
    shouldShowBanner,
    isCompleted,
    isFormOpened,
    markBannerViewed,
    snoozePrompt,
    openFormLink,
    markCompleted
  } = usePilotFeedbackState();

  useEffect(() => {
    if (shouldShowBanner) {
      markBannerViewed('banner_viewed');
    }
  }, [shouldShowBanner, markBannerViewed]);

  if (!shouldShowBanner || isCompleted) {
    return null;
  }

  return (
    <aside
      aria-label="Pilot Program Intake Banner"
      className="pilot-intake-banner animate-fade-in"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9998,
        width: '100%',
        boxSizing: 'border-box',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        background: 'linear-gradient(180deg, rgba(13, 21, 39, 0.96) 0%, rgba(9, 13, 22, 0.94) 100%)',
        borderBottom: '1.5px solid rgba(0, 242, 254, 0.35)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.45), 0 0 16px rgba(0, 242, 254, 0.15)',
        padding: '0.65rem 1.25rem',
        color: 'var(--text-main, #f8fafc)',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        {/* Banner Headline & Copy */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            flex: '1 1 320px',
            minWidth: 0
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: isFormOpened ? 'rgba(0, 245, 160, 0.15)' : 'rgba(0, 242, 254, 0.15)',
              border: `1px solid ${isFormOpened ? 'rgba(0, 245, 160, 0.4)' : 'rgba(0, 242, 254, 0.4)'}`,
              color: isFormOpened ? 'var(--accent, #00f5a0)' : 'var(--primary, #00f2fe)',
              padding: '0.2rem 0.55rem',
              borderRadius: '9999px',
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap',
              boxShadow: isFormOpened ? '0 0 10px rgba(0, 245, 160, 0.2)' : '0 0 10px rgba(0, 242, 254, 0.2)'
            }}
          >
            {isFormOpened ? (
              <>
                <CheckCircle2 size={12} />
                <span>Form Opened</span>
              </>
            ) : (
              <>
                <Sparkles size={12} />
                <span>Pilot Cohort</span>
              </>
            )}
          </div>

          <div style={{ fontSize: 'clamp(0.8rem, 1.5vw, 0.88rem)', lineHeight: 1.4 }}>
            {isFormOpened ? (
              <span>
                <strong>Form opened in new tab!</strong> Once you finish submitting your feedback, click{' '}
                <span style={{ color: 'var(--accent, #00f5a0)', fontWeight: 600 }}>"✓ I've Completed It"</span> to verify your tester rewards.
              </span>
            ) : (
              <span>
                <strong>Official Pilot Feedback:</strong> Help us shape zero-fee Stellar Soroban escrows! Complete the 60s tester intake form to qualify for early reward pools.
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap',
            flexShrink: 0
          }}
        >
          {/* Primary CTA: Open Form */}
          <a
            href={PILOT_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => openFormLink('banner_link_clicked')}
            className="btn btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.85rem',
              fontSize: '0.82rem',
              fontWeight: 600,
              textDecoration: 'none',
              borderRadius: '0.5rem',
              whiteSpace: 'nowrap',
              boxShadow: '0 0 12px rgba(0, 242, 254, 0.3)'
            }}
          >
            <span>Complete 60s Form</span>
            <ExternalLink size={13} />
          </a>

          {/* Self-Attestation Button */}
          <button
            type="button"
            onClick={markCompleted}
            className="btn btn-outline"
            title="Confirm you have submitted the Google Form"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.8rem',
              fontSize: '0.82rem',
              fontWeight: 600,
              borderColor: 'rgba(0, 245, 160, 0.5)',
              background: 'rgba(0, 245, 160, 0.08)',
              color: 'var(--accent, #00f5a0)',
              borderRadius: '0.5rem',
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            <CheckCircle2 size={13} />
            <span>✓ I've Completed It</span>
          </button>

          {/* Snooze Button */}
          <button
            type="button"
            onClick={() => snoozePrompt(24)}
            className="btn btn-outline"
            title="Snooze this reminder for 24 hours"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.4rem 0.65rem',
              fontSize: '0.78rem',
              fontWeight: 500,
              borderColor: 'rgba(255, 255, 255, 0.15)',
              background: 'rgba(255, 255, 255, 0.04)',
              color: 'var(--text-muted, #94a3b8)',
              borderRadius: '0.5rem',
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            <Clock size={12} />
            <span>Remind me in 24h</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
