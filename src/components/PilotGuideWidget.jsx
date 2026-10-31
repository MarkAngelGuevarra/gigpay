import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Wallet,
  Lock,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
  ShieldAlert,
  Landmark,
  FileCheck,
  Compass,
  Check,
  UserCheck,
  Briefcase,
  Play
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const STORAGE_KEY = 'gigpay_guide_state_v1';

function setNativeValue(element, value) {
  if (!element) return;
  const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function waitForElement(selectorOrFn, timeout = 1200) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const check = () => {
      try {
        const el = typeof selectorOrFn === 'function' ? selectorOrFn() : document.querySelector(selectorOrFn);
        if (el) {
          resolve(el);
          return;
        }
      } catch (e) {
        // ignore DOM query selector errors
      }
      if (Date.now() - startTime >= timeout) {
        resolve(null);
        return;
      }
      setTimeout(check, 40);
    };
    check();
  });
}

const CLIENT_STEPS = [
  {
    step: 1,
    title: 'Connect Testnet Wallet',
    badge: 'Step 1 of 4 • Wallet Setup',
    icon: Wallet,
    description: 'Connect your Freighter Wallet or use the built-in instant Stellar Testnet wallet to sign Soroban smart contract operations.',
    actionLabel: 'Connect Testnet Wallet',
    actionType: 'connect_wallet',
    tip: 'No browser extension needed on mobile: our fallback wallet is auto-provisioned!'
  },
  {
    step: 2,
    title: 'Lock Milestone Escrow',
    badge: 'Step 2 of 4 • Fund Contract',
    icon: Lock,
    description: 'Fund a milestone in the Stellar Soroban escrow contract (CAUU2O...7RD3). 0% platform fee means 100% of funds go to work.',
    actionLabel: '⚡ Fill Sample Task (2 XLM)',
    actionType: 'fill_sample_task',
    tip: 'Clicking pre-fills a 2 XLM sample milestone and scrolls smoothly to the escrow form.'
  },
  {
    step: 3,
    title: 'Review Work or Dispute',
    badge: 'Step 3 of 4 • Deliverable Review',
    icon: ShieldAlert,
    description: 'Review submitted work (GitHub PR, Loom, docs). If deliverables need revision, raise a dispute to freeze escrow funds instantly.',
    actionLabel: 'Switch to Freelancer Mode ↗',
    actionType: 'switch_to_freelancer',
    tip: 'Switching persona allows you to accept the task and submit proof of work.'
  },
  {
    step: 4,
    title: 'Authorize Release',
    badge: 'Step 4 of 4 • Final Settlement',
    icon: CheckCircle2,
    description: 'Authorize final milestone settlement. Type CONFIRM in all-caps to verify approval before irreversible on-chain release.',
    actionLabel: 'Authorize Escrow Release',
    actionType: 'scroll_escrows',
    tip: 'The two-stage authorization strictly rejects mismatched or lowercase inputs.'
  }
];

const FREELANCER_STEPS = [
  {
    step: 1,
    title: 'Switch to Freelancer Role',
    badge: 'Step 1 of 5 • Role Persona',
    icon: UserCheck,
    description: 'Switch persona to Freelancer to discover open jobs, accept escrow contracts, and submit verified deliverables.',
    actionLabel: '1-Click Switch to Freelancer',
    actionType: 'switch_to_freelancer_role',
    tip: 'Seamlessly toggle between Client and Freelancer with full state preservation.'
  },
  {
    step: 2,
    title: 'Discover Available Tasks',
    badge: 'Step 2 of 5 • Job Discovery',
    icon: Briefcase,
    description: 'Browse client-funded milestones. Smart contracts hold funds in escrow so you are guaranteed payment upon approval.',
    actionLabel: 'Scroll to Available Tasks',
    actionType: 'scroll_available',
    tip: 'All listed tasks are 100% funded and locked in Soroban contract CAUU2O...7RD3.'
  },
  {
    step: 3,
    title: 'Accept Escrow Contract',
    badge: 'Step 3 of 5 • Contract Binding',
    icon: FileCheck,
    description: 'Accept an open task to lock the agreement. The escrow state transitions cleanly from Available to In Progress.',
    actionLabel: 'Scroll to Accept Job',
    actionType: 'scroll_accept',
    tip: 'Accepting work binds your public key to the contract as the sole payout beneficiary.'
  },
  {
    step: 4,
    title: 'Submit Proof of Work',
    badge: 'Step 4 of 5 • Deliverable Proof',
    icon: Sparkles,
    description: 'Attach GitHub PRs, Loom videos, or document links. Non-dev testers can use the 1-click sample filler to test instantly.',
    actionLabel: '⚡ Auto-Fill Sample Deliverables',
    actionType: 'autofill_proof',
    tip: 'Pre-fills Google Doc and Loom walkthrough links so you can test submission in seconds.'
  },
  {
    step: 5,
    title: 'Instant Payout & Bank Off-Ramp',
    badge: 'Step 5 of 5 • Fiat Off-Ramp',
    icon: Landmark,
    description: 'Once client approves the milestone, convert XLM into local fiat (UnionBank, GCash, DBS, Revolut) via the simulated off-ramp.',
    actionLabel: '🏦 Open Bank Off-Ramp',
    actionType: 'open_bank_modal',
    tip: 'Simulates instant off-ramp settlement with zero FX markup.'
  }
];

export default function PilotGuideWidget() {
  const location = useLocation();
  const navigate = useNavigate();
  const { publicKey, connectTesterWallet, connectWallet, switchRole, user } = useAuth();
  const { addToast } = useToast();

  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          clientStep: typeof parsed.clientStep === 'number' ? Math.max(1, Math.min(4, parsed.clientStep)) : 1,
          freelancerStep: typeof parsed.freelancerStep === 'number' ? Math.max(1, Math.min(5, parsed.freelancerStep)) : 1,
          activeTour: parsed.activeTour === 'freelancer' ? 'freelancer' : 'client',
          isMinimized: Boolean(parsed.isMinimized),
          isDismissed: Boolean(parsed.isDismissed)
        };
      }
    } catch (e) {
      console.warn('Could not read pilot guide state from localStorage:', e);
    }
    return {
      clientStep: 1,
      freelancerStep: 1,
      activeTour: 'client',
      isMinimized: false,
      isDismissed: false
    };
  });

  // Automatically adapt active tour based on current route
  useEffect(() => {
    if (location.pathname.startsWith('/freelancer')) {
      setState(prev => {
        if (prev.activeTour !== 'freelancer') {
          return { ...prev, activeTour: 'freelancer' };
        }
        return prev;
      });
    } else if (location.pathname.startsWith('/client')) {
      setState(prev => {
        if (prev.activeTour !== 'client') {
          return { ...prev, activeTour: 'client' };
        }
        return prev;
      });
    }
  }, [location.pathname]);

  // Persist state changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Could not write pilot guide state to localStorage:', e);
    }
  }, [state]);

  const isClient = state.activeTour === 'client';
  const steps = isClient ? CLIENT_STEPS : FREELANCER_STEPS;
  const currentStep = isClient ? state.clientStep : state.freelancerStep;
  const totalSteps = steps.length;
  const activeStepData = steps[currentStep - 1] || steps[0];
  const StepIcon = activeStepData.icon;

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setState(prev => ({
        ...prev,
        [isClient ? 'clientStep' : 'freelancerStep']: currentStep + 1
      }));
    } else {
      addToast(`🎉 Congratulations! You have completed the ${isClient ? 'Client' : 'Freelancer'} Tour!`, 'success');
      setState(prev => ({ ...prev, isMinimized: true }));
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setState(prev => ({
        ...prev,
        [isClient ? 'clientStep' : 'freelancerStep']: currentStep - 1
      }));
    }
  };

  const handleRestart = () => {
    setState(prev => ({
      ...prev,
      [isClient ? 'clientStep' : 'freelancerStep']: 1
    }));
    addToast(`Restarted ${isClient ? 'Client' : 'Freelancer'} Tour at Step 1`, 'info');
  };

  const handleSelectTour = (tour) => {
    if (typeof switchRole === 'function') {
      switchRole(tour);
    }
    setState(prev => ({ ...prev, activeTour: tour }));
    if (tour === 'client' && location.pathname !== '/client') {
      navigate('/client');
    } else if (tour === 'freelancer' && location.pathname !== '/freelancer') {
      navigate('/freelancer');
    }
  };

  const handleExecuteAction = async (actionType) => {
    switch (actionType) {
      case 'connect_wallet': {
        try {
          if (!user && typeof switchRole === 'function') {
            switchRole('client');
          }
          if (typeof connectTesterWallet === 'function') {
            await connectTesterWallet();
            addToast('Stellar Testnet wallet connected successfully!', 'success');
          } else if (typeof connectWallet === 'function') {
            await connectWallet();
            addToast('Freighter wallet connected!', 'success');
          }
        } catch (err) {
          addToast('Wallet connection notice: ' + (err?.message || err), 'warning');
        }
        break;
      }

      case 'fill_sample_task': {
        if (!user && typeof switchRole === 'function') {
          switchRole('client');
        }
        if (location.pathname !== '/client') {
          navigate('/client');
        }
        
        // Exclude the guide widget itself to avoid recursive self-clicks
        const sampleBtn = await waitForElement(() => {
          return Array.from(document.querySelectorAll('button')).find(b =>
            !b.closest('.pilot-guide-widget') && b.textContent.includes('Fill Sample Task')
          );
        }, 1200);

        if (sampleBtn) {
          sampleBtn.click();
        } else {
          const titleInput = await waitForElement(() => {
            return document.querySelector('input[placeholder*="Logo Design"]') ||
                   document.querySelector('input[placeholder*="Title"]') ||
                   Array.from(document.querySelectorAll('input[type="text"]')).find(i => !i.closest('.pilot-guide-widget'));
          }, 800);

          const amountInput = document.querySelector('input[placeholder="e.g. 5"]') ||
                              Array.from(document.querySelectorAll('input[type="number"]')).find(i => !i.closest('.pilot-guide-widget'));

          if (titleInput) setNativeValue(titleInput, 'UI/UX Prototype & Soroban Integration');
          if (amountInput) setNativeValue(amountInput, '2');
          addToast('Sample 2 XLM milestone loaded! Click "Lock Funds in Escrow".', 'success');
        }

        const form = document.querySelector('form');
        if (form) {
          form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        break;
      }

      case 'switch_to_freelancer': {
        if (typeof switchRole === 'function') {
          switchRole('freelancer');
        }
        navigate('/freelancer');
        addToast('Switched to Freelancer Mode! Discover tasks and submit deliverables.', 'info');
        setState(prev => ({ ...prev, activeTour: 'freelancer' }));
        break;
      }

      case 'scroll_escrows': {
        if (!user && typeof switchRole === 'function') {
          switchRole('client');
        }
        if (location.pathname !== '/client') {
          navigate('/client');
        }
        const approveBtn = await waitForElement(() => {
          return Array.from(document.querySelectorAll('button')).find(b =>
            !b.closest('.pilot-guide-widget') && b.textContent.includes('Approve & Release') && !b.disabled
          );
        }, 1200);

        if (approveBtn) {
          approveBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          approveBtn.click();
          addToast('Milestone Release Modal opened: type CONFIRM to release.', 'info');
        } else {
          const panels = document.querySelectorAll('.glass-panel');
          if (panels && panels.length > 1) {
            panels[1].scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          addToast('Accept a task in Freelancer mode first to unlock release.', 'info');
        }
        break;
      }

      case 'switch_to_freelancer_role': {
        if (typeof switchRole === 'function') {
          switchRole('freelancer');
        }
        if (location.pathname !== '/freelancer') {
          navigate('/freelancer');
        }
        addToast('Freelancer Role active! Discover funded tasks below.', 'success');
        break;
      }

      case 'scroll_available': {
        if (location.pathname !== '/freelancer') {
          navigate('/freelancer');
        }
        const targetHeading = await waitForElement(() => {
          return Array.from(document.querySelectorAll('h3')).find(h =>
            !h.closest('.pilot-guide-widget') && h.textContent.includes('Available')
          );
        }, 1200);

        if (targetHeading) {
          targetHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        break;
      }

      case 'scroll_accept': {
        if (location.pathname !== '/freelancer') {
          navigate('/freelancer');
        }
        const acceptBtn = await waitForElement(() => {
          return Array.from(document.querySelectorAll('button')).find(b =>
            !b.closest('.pilot-guide-widget') && b.textContent.includes('Accept Work')
          );
        }, 1200);

        if (acceptBtn) {
          acceptBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          acceptBtn.style.boxShadow = '0 0 20px #00f2fe';
          setTimeout(() => { if (acceptBtn) acceptBtn.style.boxShadow = ''; }, 2500);
          addToast('Click "Accept Work" to lock agreement in Soroban escrow!', 'info');
        } else {
          addToast('No open available tasks right now. Create one in Client Mode first!', 'info');
        }
        break;
      }

      case 'autofill_proof': {
        if (location.pathname !== '/freelancer') {
          navigate('/freelancer');
        }
        
        // Check if proof form is already open before toggling
        let autoFillBtn = Array.from(document.querySelectorAll('button')).find(b =>
          !b.closest('.pilot-guide-widget') && b.textContent.includes('1-Click Auto-Fill Sample')
        );

        if (!autoFillBtn) {
          const expandBtn = await waitForElement(() => {
            return Array.from(document.querySelectorAll('button')).find(b =>
              !b.closest('.pilot-guide-widget') && (b.textContent.includes('Attach Proof') || b.textContent.includes('Update Proof'))
            );
          }, 1200);

          if (expandBtn) {
            expandBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            expandBtn.click();
            autoFillBtn = await waitForElement(() => {
              return Array.from(document.querySelectorAll('button')).find(b =>
                !b.closest('.pilot-guide-widget') && b.textContent.includes('1-Click Auto-Fill Sample')
              );
            }, 600);
          }
        }

        if (autoFillBtn) {
          autoFillBtn.click();
        } else {
          const docInput = document.querySelector('input[placeholder*="docs.google.com"]');
          const notesInput = document.querySelector('textarea[placeholder*="description of work"]');
          if (docInput) setNativeValue(docInput, 'https://docs.google.com/document/d/gigpay-pilot-sample-deliverable');
          if (notesInput) setNativeValue(notesInput, 'Completed milestone deliverables. Tested and verified for client escrow release.');
          if (docInput || notesInput) {
            addToast('Sample deliverables auto-filled for quick testing!', 'info');
          } else {
            addToast('Accept an active task first to attach proof of work deliverables.', 'warning');
          }
        }
        break;
      }

      case 'open_bank_modal': {
        if (location.pathname !== '/freelancer') {
          navigate('/freelancer');
        }
        const withdrawBtn = await waitForElement(() => {
          return Array.from(document.querySelectorAll('button')).find(b =>
            !b.closest('.pilot-guide-widget') && b.textContent.includes('Withdraw to Bank')
          );
        }, 1200);

        if (withdrawBtn) {
          withdrawBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          withdrawBtn.style.boxShadow = '0 0 20px #00f2fe';
          setTimeout(() => { if (withdrawBtn) withdrawBtn.style.boxShadow = ''; }, 2500);
          if (withdrawBtn.disabled) {
            addToast('Connect wallet to unlock Withdraw to Bank off-ramp.', 'warning');
          } else {
            withdrawBtn.click();
            addToast('Opening simulated Bank Off-Ramp modal...', 'info');
          }
        } else {
          addToast('Withdraw to Bank button is available on the Freelancer Portal.', 'info');
        }
        break;
      }

      default:
        break;
    }
  };

  // Re-open pill if dismissed
  if (state.isDismissed) {
    return (
      <>
        <style>{`
          @keyframes pilotPillGlow {
            0%, 100% { box-shadow: 0 0 10px rgba(0, 242, 254, 0.4); }
            50% { box-shadow: 0 0 20px rgba(0, 242, 254, 0.8); }
          }
        `}</style>
        <button
          type="button"
          onClick={() => setState(prev => ({ ...prev, isDismissed: false, isMinimized: false }))}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            cursor: 'pointer',
            background: 'rgba(13, 21, 39, 0.94)',
            border: '1px solid rgba(0, 242, 254, 0.45)',
            borderRadius: '999px',
            padding: '0.55rem 0.95rem',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.6), 0 0 16px rgba(0, 242, 254, 0.35)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            color: '#00f2fe',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            fontSize: '0.8rem',
            fontWeight: 700,
            animation: 'pilotPillGlow 3s infinite',
            maxWidth: 'calc(100vw - 32px)',
            boxSizing: 'border-box'
          }}
          title="Open Pilot Guide"
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#00f2fe',
              boxShadow: '0 0 8px #00f2fe'
            }}
          />
          <span>🚀 Pilot Guide</span>
        </button>
      </>
    );
  }

  // Minimized Sleek Pill
  if (state.isMinimized) {
    return (
      <>
        <style>{`
          @keyframes pilotGlowPulse {
            0%, 100% {
              box-shadow: 0 0 0 0 rgba(0, 242, 254, 0.6);
              transform: scale(1);
            }
            50% {
              box-shadow: 0 0 0 8px rgba(0, 242, 254, 0);
              transform: scale(1.02);
            }
          }
        `}</style>
        <div
          onClick={() => setState(prev => ({ ...prev, isMinimized: false }))}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            cursor: 'pointer',
            background: 'rgba(13, 21, 39, 0.94)',
            border: '1px solid rgba(0, 242, 254, 0.45)',
            borderRadius: '999px',
            padding: '0.65rem 1.15rem',
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.65), 0 0 20px rgba(0, 242, 254, 0.35)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            fontSize: '0.84rem',
            fontWeight: 600,
            maxWidth: 'calc(100vw - 32px)',
            boxSizing: 'border-box',
            transition: 'all 0.25s ease',
            userSelect: 'none'
          }}
          role="button"
          tabIndex={0}
          title="Expand Pilot Guide"
        >
          <span
            style={{
              display: 'inline-block',
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              background: '#00f2fe',
              boxShadow: '0 0 10px #00f2fe',
              animation: 'pilotGlowPulse 2.4s infinite'
            }}
          />
          <span style={{ color: '#f8fafc', fontWeight: 600 }}>
            🚀 Pilot Guide (Step {currentStep}/{totalSteps}) ▾
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setState(prev => ({ ...prev, isDismissed: true }));
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '0 0 0 0.25rem',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Dismiss Guide"
          >
            <X size={14} />
          </button>
        </div>
      </>
    );
  }

  // Expanded Floating Card
  return (
    <>
      <style>{`
        @keyframes pilotWidgetSlideUp {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes pilotPulseIndicator {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(0, 242, 254, 0.6);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(0, 242, 254, 0);
          }
        }
        @media (max-width: 480px) {
          .pilot-guide-widget {
            bottom: 16px !important;
            right: 16px !important;
            max-width: calc(100vw - 32px) !important;
          }
        }
      `}</style>
      <div
        className="pilot-guide-widget"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          width: 'min(380px, calc(100vw - 32px))',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
          background: 'rgba(13, 21, 39, 0.94)',
          border: '1px solid rgba(0, 242, 254, 0.35)',
          borderRadius: '16px',
          padding: '1.25rem',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.7), 0 0 25px rgba(0, 242, 254, 0.2)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          color: '#f8fafc',
          boxSizing: 'border-box',
          animation: 'pilotWidgetSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          fontFamily: "'Inter', sans-serif"
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#00f2fe',
                boxShadow: '0 0 10px #00f2fe',
                animation: 'pilotPulseIndicator 2.2s infinite'
              }}
            />
            <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#ffffff', letterSpacing: '-0.2px' }}>
              🚀 Pilot Guide
            </span>
            <span
              style={{
                background: isClient ? 'rgba(59, 130, 246, 0.2)' : 'rgba(139, 92, 246, 0.2)',
                color: isClient ? '#60a5fa' : '#c084fc',
                border: '1px solid ' + (isClient ? 'rgba(59, 130, 246, 0.4)' : 'rgba(139, 92, 246, 0.4)'),
                padding: '0.15rem 0.5rem',
                borderRadius: '999px',
                fontSize: '0.7rem',
                fontWeight: 700
              }}
            >
              {isClient ? 'Client Mode' : 'Freelancer'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, isMinimized: true }))}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                borderRadius: '6px',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '0.3rem',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.2s'
              }}
              title="Minimize to Pill"
            >
              <ChevronDown size={15} />
            </button>
            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, isDismissed: true }))}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                borderRadius: '6px',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '0.3rem',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.2s'
              }}
              title="Close Guide"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Role Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '0.4rem',
            background: 'rgba(0, 0, 0, 0.35)',
            padding: '0.25rem',
            borderRadius: '8px',
            marginBottom: '0.9rem'
          }}
        >
          <button
            type="button"
            onClick={() => handleSelectTour('client')}
            style={{
              flex: 1,
              padding: '0.4rem 0.5rem',
              borderRadius: '6px',
              border: isClient ? '1px solid rgba(0, 242, 254, 0.5)' : '1px solid transparent',
              background: isClient ? 'rgba(0, 242, 254, 0.15)' : 'transparent',
              color: isClient ? '#00f2fe' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem'
            }}
          >
            👤 Client Tour (4)
          </button>
          <button
            type="button"
            onClick={() => handleSelectTour('freelancer')}
            style={{
              flex: 1,
              padding: '0.4rem 0.5rem',
              borderRadius: '6px',
              border: !isClient ? '1px solid rgba(192, 132, 252, 0.5)' : '1px solid transparent',
              background: !isClient ? 'rgba(192, 132, 252, 0.15)' : 'transparent',
              color: !isClient ? '#c084fc' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem'
            }}
          >
            💼 Freelancer (5)
          </button>
        </div>

        {/* Step Progress Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.85rem' }}>
          {steps.map((s, idx) => {
            const isCompleted = s.step < currentStep;
            const isCurrent = s.step === currentStep;
            return (
              <button
                key={s.step}
                type="button"
                onClick={() => {
                  setState(prev => ({
                    ...prev,
                    [isClient ? 'clientStep' : 'freelancerStep']: s.step
                  }));
                }}
                style={{
                  flex: 1,
                  height: '6px',
                  borderRadius: '999px',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  background: isCurrent
                    ? '#00f2fe'
                    : isCompleted
                    ? '#10b981'
                    : 'rgba(255, 255, 255, 0.15)',
                  boxShadow: isCurrent ? '0 0 8px #00f2fe' : 'none',
                  transition: 'all 0.25s ease'
                }}
                title={`Jump to Step ${s.step}: ${s.title}`}
              />
            );
          })}
        </div>

        {/* Current Step Card */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.28)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '0.9rem',
            marginBottom: '0.9rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.4rem' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'rgba(0, 242, 254, 0.15)',
                color: '#00f2fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(0, 242, 254, 0.3)'
              }}
            >
              <StepIcon size={15} />
            </div>
            <div>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>
                {activeStepData.badge}
              </span>
              <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#ffffff', fontWeight: 700 }}>
                {activeStepData.title}
              </h4>
            </div>
          </div>

          <p style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.45, margin: '0 0 0.75rem 0' }}>
            {activeStepData.description}
          </p>

          {/* Wallet status pill if Step 1 of client */}
          {isClient && currentStep === 1 && publicKey && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.74rem',
                color: '#34d399',
                background: 'rgba(16, 185, 129, 0.12)',
                padding: '0.3rem 0.55rem',
                borderRadius: '6px',
                marginBottom: '0.7rem',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}
            >
              <CheckCircle2 size={13} />
              <span>Wallet Active: <code>{publicKey.slice(0, 5)}...{publicKey.slice(-4)}</code></span>
            </div>
          )}

          {/* Action Trigger Button */}
          <button
            type="button"
            onClick={() => handleExecuteAction(activeStepData.actionType)}
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '0.55rem 0.85rem',
              fontSize: '0.82rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              marginBottom: '0.6rem'
            }}
          >
            <Play size={14} /> {activeStepData.actionLabel}
          </button>

          {/* Pro Tip */}
          <div
            style={{
              fontSize: '0.73rem',
              color: '#94a3b8',
              lineHeight: 1.35,
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '0.4rem 0.55rem',
              borderRadius: '6px',
              borderLeft: '3px solid #00f2fe'
            }}
          >
            💡 <strong style={{ color: '#e2e8f0' }}>Tip:</strong> {activeStepData.tip}
          </div>
        </div>

        {/* Footer Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={handleRestart}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.3rem 0.4rem',
              transition: 'color 0.2s'
            }}
            title="Restart Tour from Step 1"
          >
            <RotateCcw size={12} /> Restart
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentStep === 1}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: currentStep === 1 ? '#64748b' : '#f8fafc',
                cursor: currentStep === 1 ? 'not-allowed' : 'pointer',
                borderRadius: '6px',
                padding: '0.38rem 0.65rem',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontWeight: 600
              }}
            >
              <ArrowLeft size={12} /> Back
            </button>

            <button
              type="button"
              onClick={handleNext}
              style={{
                background: currentStep === totalSteps
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)',
                border: 'none',
                color: '#070a12',
                cursor: 'pointer',
                borderRadius: '6px',
                padding: '0.38rem 0.75rem',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontWeight: 700,
                boxShadow: '0 0 12px rgba(0, 242, 254, 0.35)'
              }}
            >
              {currentStep === totalSteps ? 'Finish Tour 🎉' : <>Next <ArrowRight size={12} /></>}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
