import React, { useState, useEffect, useRef } from 'react';
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
  X,
  ExternalLink,
  ShieldAlert,
  Landmark,
  FileCheck,
  Compass,
  Check,
  UserCheck,
  Briefcase,
  Play,
  HelpCircle,
  Eye,
  Smartphone
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTasks } from '../context/TaskContext';

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

function spotlightElement(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const prevTransition = el.style.transition;
  const prevBoxShadow = el.style.boxShadow;
  const prevOutline = el.style.outline;
  
  el.style.transition = 'all 0.3s ease';
  el.style.boxShadow = '0 0 25px #00f2fe, 0 0 10px rgba(0, 242, 254, 0.8)';
  el.style.outline = '2px solid #00f2fe';
  
  setTimeout(() => {
    el.style.boxShadow = prevBoxShadow;
    el.style.outline = prevOutline;
    el.style.transition = prevTransition;
  }, 2600);
}

const CLIENT_STEPS = [
  {
    step: 1,
    title: 'Connect Testnet Wallet',
    badge: 'Step 1 of 4 • Wallet Setup',
    icon: Wallet,
    teacherVoice: '👋 Welcome! I am your Live Pilot Coach. First, let\'s get your wallet ready. On mobile, you do NOT need any extension—our instant Testnet wallet is already funded with 10,000 XLM for you!',
    description: 'Connect your Freighter Wallet or use the built-in instant Stellar Testnet wallet to sign Soroban smart contract operations.',
    actionLabel: 'Connect Testnet Wallet',
    actionType: 'connect_wallet',
    tip: 'No browser extension needed on mobile: our fallback wallet is auto-provisioned!'
  },
  {
    step: 2,
    title: 'Lock Milestone Escrow',
    badge: 'Step 2 of 4 • Fund Escrow',
    icon: Lock,
    teacherVoice: 'Now, let\'s create an escrow task! Tap below to 1-click auto-fill sample milestone data (2 XLM) and highlight the "Lock Funds in Escrow" button.',
    description: 'Deposit native XLM into the Soroban escrow contract (Protocol 22). Funds are locked safely until you review and approve deliverables.',
    actionLabel: '⚡ Fill Sample Task (2 XLM)',
    actionType: 'fill_sample_task',
    tip: 'Smart contract CAUU2O...7RD3 holds the funds. Self-dealing protection blocks matching client and freelancer addresses.'
  },
  {
    step: 3,
    title: 'Review Work or Dispute',
    badge: 'Step 3 of 4 • Review & Quality',
    icon: FileCheck,
    teacherVoice: 'Once the freelancer submits proof, review their deliverables! You can safely test both the release flow and dispute freeze mechanism.',
    description: 'Inspect attached GitHub PRs, live demo URLs, or Google Docs. If specs are not met, the dispute button freezes escrow payout on-chain.',
    actionLabel: '1-Click Switch to Freelancer',
    actionType: 'switch_to_freelancer',
    tip: 'Disputed tasks permanently block release until resolved by both parties.'
  },
  {
    step: 4,
    title: 'Authorize Release',
    badge: 'Step 4 of 4 • On-Chain Settlement',
    icon: CheckCircle2,
    teacherVoice: 'Deliverables verified! Tap below to open the release authorization modal, type CONFIRM, and trigger the Soroban approve_task method on Stellar Testnet.',
    description: 'Releases the locked XLM directly to the freelancer\'s wallet and mints a public immutable verification proof on StellarExpert.',
    actionLabel: 'Approve & Release Milestone',
    actionType: 'scroll_escrows',
    tip: 'Evaluation invariant: SOW Table 7 requires typing uppercase CONFIRM to prevent accidental releases.'
  }
];

const FREELANCER_STEPS = [
  {
    step: 1,
    title: 'Switch to Freelancer Role',
    badge: 'Step 1 of 5 • Dual Persona',
    icon: UserCheck,
    teacherVoice: 'Switch your view to the Freelancer Portal. GigPay supports testing both sides of the marketplace from a single device!',
    description: 'Toggle between Client and Freelancer roles instantly using the top switch button or direct link.',
    actionLabel: '1-Click Switch to Freelancer',
    actionType: 'switch_to_freelancer_role',
    tip: 'Both Client and Freelancer flows can be tested on mobile in 1 browser session.'
  },
  {
    step: 2,
    title: 'Discover Available Tasks',
    badge: 'Step 2 of 5 • Browse Escrows',
    icon: Briefcase,
    teacherVoice: 'Browse the "Available Funded Tasks" feed. Every milestone is already funded by clients and safely locked in the smart contract before you begin work.',
    description: 'Review task milestones, XLM reward amounts, and client details. Funds are guaranteed by the escrow contract.',
    actionLabel: 'Scroll to Available Tasks',
    actionType: 'scroll_available',
    tip: 'All listed tasks are 100% funded and locked in Soroban contract CAUU2O...7RD3.'
  },
  {
    step: 3,
    title: 'Accept Escrow Contract',
    badge: 'Step 3 of 5 • Lock Agreement',
    icon: Check,
    teacherVoice: 'Found a task you like? Tap "Accept Work" to lock your wallet address as the exclusive beneficiary on the Soroban smart contract.',
    description: 'Accepting binds your public key to the contract milestone, moving the task to "In Progress".',
    actionLabel: 'Accept Open Task',
    actionType: 'scroll_accept',
    tip: 'Once accepted, no other freelancer can claim this escrow milestone.'
  },
  {
    step: 4,
    title: 'Submit Proof of Work',
    badge: 'Step 4 of 5 • Deliverable Proof',
    icon: Sparkles,
    teacherVoice: 'Submit proof of your completed work! For fast pilot testing, tap below to auto-fill sample Google Docs and Loom demo links in 1 click.',
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
    teacherVoice: 'The client released your escrow payment! Your earnings updated on the blockchain. Now tap below to test the simulated 0%-fee bank off-ramp to GCash or UnionBank!',
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
  const { tasks } = useTasks();

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

  // Track state across lifecycle to trigger reactive auto-advance popups
  const isMountedRef = useRef(false);
  const prevTasksCountRef = useRef(tasks?.length || 0);
  const prevTasksRef = useRef(tasks || []);
  const prevWalletRef = useRef(publicKey);

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

  // Reactive Step Advancement: Automatically detects when a user followed the instruction on the page,
  // pops up the next instruction, and removes itself once followed
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      prevTasksCountRef.current = tasks?.length || 0;
      prevTasksRef.current = tasks || [];
      prevWalletRef.current = publicKey;
      return;
    }

    const currentTasks = tasks || [];
    const prevTasks = prevTasksRef.current || [];

    // Client Step 1 -> Step 2: Auto-advance upon wallet connection
    if (isClient && state.clientStep === 1 && publicKey && !prevWalletRef.current) {
      setState(prev => ({ ...prev, clientStep: 2, isMinimized: false }));
      addToast('🎉 Testnet Wallet Connected! Next: Lock Milestone Escrow.', 'success');
    }

    // Client Step 2 -> Step 3: Auto-advance when client funds/creates task escrow
    if (isClient && state.clientStep === 2 && currentTasks.length > prevTasksCountRef.current) {
      setState(prev => ({ ...prev, clientStep: 3, isMinimized: false }));
      addToast('🎉 Task funded in Soroban escrow! Step 3: Switch to Freelancer to accept.', 'success');
    }

    // Freelancer Step 3 -> Step 4: Auto-advance when task is accepted (In Progress)
    if (!isClient && state.freelancerStep === 3) {
      const newlyAccepted = currentTasks.some(t =>
        t.status === 'In Progress' &&
        prevTasks.find(pt => pt.id === t.id)?.status === 'Available'
      );
      if (newlyAccepted) {
        setState(prev => ({ ...prev, freelancerStep: 4, isMinimized: false }));
        addToast('🎉 Contract agreement locked! Step 4: Submit Proof of Work.', 'success');
      }
    }

    // Freelancer Step 4 -> Step 5: Auto-advance when proof of work is submitted
    if (!isClient && state.freelancerStep === 4) {
      const newlySubmitted = currentTasks.some(t =>
        t.proof_attached &&
        !prevTasks.find(pt => pt.id === t.id)?.proof_attached
      );
      if (newlySubmitted) {
        setState(prev => ({ ...prev, freelancerStep: 5, isMinimized: false }));
        addToast('🎉 Deliverables submitted! Step 5: Instant Payout & Bank Off-Ramp.', 'success');
      }
    }

    // Client Step 4: Acknowledge payout release
    if (isClient && state.clientStep === 4) {
      const newlyCompleted = currentTasks.some(t =>
        t.status === 'Completed' &&
        prevTasks.find(pt => pt.id === t.id)?.status !== 'Completed'
      );
      if (newlyCompleted) {
        addToast('🎉 Payout released on Stellar Testnet! Escrow lifecycle complete.', 'success');
      }
    }

    prevTasksCountRef.current = currentTasks.length;
    prevTasksRef.current = currentTasks;
    prevWalletRef.current = publicKey;
  }, [tasks, publicKey, isClient, state.clientStep, state.freelancerStep]);

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setState(prev => ({
        ...prev,
        [isClient ? 'clientStep' : 'freelancerStep']: currentStep + 1,
        isMinimized: false
      }));
    } else {
      addToast(`🎉 Awesome job! You completed the ${isClient ? 'Client' : 'Freelancer'} onboarding tour!`, 'success');
      setState(prev => ({ ...prev, isMinimized: true }));
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setState(prev => ({
        ...prev,
        [isClient ? 'clientStep' : 'freelancerStep']: currentStep - 1,
        isMinimized: false
      }));
    }
  };

  const handleRestart = () => {
    setState(prev => ({
      ...prev,
      [isClient ? 'clientStep' : 'freelancerStep']: 1,
      isMinimized: false
    }));
    addToast(`Restarted ${isClient ? 'Client' : 'Freelancer'} Tour at Step 1`, 'info');
  };

  const handleSelectTour = (tour) => {
    if (typeof switchRole === 'function') {
      switchRole(tour);
    }
    setState(prev => ({ ...prev, activeTour: tour, isMinimized: false }));
    if (tour === 'client' && location.pathname !== '/client') {
      navigate('/client');
    } else if (tour === 'freelancer' && location.pathname !== '/freelancer') {
      navigate('/freelancer');
    }
  };

  // Execute Action and IMMEDIATELY remove/minimize the modal so the user has an unobstructed mobile view
  const handleExecuteAction = async (actionType) => {
    // Dismiss/minimize modal immediately to keep mobile screen completely clean
    setState(prev => ({ ...prev, isMinimized: true }));

    switch (actionType) {
      case 'connect_wallet': {
        try {
          if (!user && typeof switchRole === 'function') {
            switchRole('client');
          }
          if (typeof connectTesterWallet === 'function') {
            await connectTesterWallet();
            addToast('Stellar Testnet wallet connected with 10,000 XLM!', 'success');
          } else if (typeof connectWallet === 'function') {
            await connectWallet();
            addToast('Freighter wallet connected!', 'success');
          }
          const walletBtn = document.querySelector('.btn-outline');
          if (walletBtn) spotlightElement(walletBtn);
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

        const sampleBtn = await waitForElement(() => {
          return Array.from(document.querySelectorAll('button')).find(b =>
            !b.closest('.pilot-guide-widget') && b.textContent.includes('Fill Sample Task')
          );
        }, 1200);

        if (sampleBtn) {
          sampleBtn.click();
          spotlightElement(sampleBtn);
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
          addToast('Sample 2 XLM milestone loaded! Tap "Lock Funds in Escrow".', 'success');
        }

        const lockBtn = await waitForElement(() => {
          return Array.from(document.querySelectorAll('button')).find(b =>
            !b.closest('.pilot-guide-widget') && b.textContent.includes('Lock Funds in Escrow')
          );
        }, 600);
        if (lockBtn) {
          spotlightElement(lockBtn);
        } else {
          const form = document.querySelector('form');
          if (form) spotlightElement(form);
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
          spotlightElement(approveBtn);
          approveBtn.click();
          addToast('Milestone Release Modal opened: type CONFIRM in all-caps to release.', 'info');
        } else {
          const panels = document.querySelectorAll('.glass-panel');
          if (panels && panels.length > 1) {
            spotlightElement(panels[1]);
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
          spotlightElement(targetHeading);
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
          spotlightElement(acceptBtn);
          addToast('Tap "Accept Work" to lock agreement in Soroban escrow!', 'info');
        } else {
          addToast('No open available tasks right now. Create one in Client Mode first!', 'info');
        }
        break;
      }

      case 'autofill_proof': {
        if (location.pathname !== '/freelancer') {
          navigate('/freelancer');
        }

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
            spotlightElement(expandBtn);
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
          spotlightElement(autoFillBtn);
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
          spotlightElement(withdrawBtn);
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
            bottom: '20px',
            right: '20px',
            zIndex: 9999,
            cursor: 'pointer',
            background: 'rgba(13, 21, 39, 0.94)',
            border: '1.5px solid rgba(0, 242, 254, 0.35)',
            borderRadius: '999px',
            padding: '0.65rem 1.15rem',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8), 0 0 16px rgba(0, 242, 254, 0.4)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            color: '#00f2fe',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.86rem',
            fontWeight: 800,
            animation: 'pilotPillGlow 3s infinite',
            maxWidth: 'calc(100vw - 32px)',
            boxSizing: 'border-box',
            touchAction: 'manipulation',
            minHeight: '44px'
          }}
          title="Open Live Pilot Coach"
        >
          <span
            style={{
              width: '10px',
              height: '10px',
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

  // Minimized Sleek Pill (Zero screen obstruction on mobile phones)
  if (state.isMinimized) {
    return (
      <>
        <style>{`
          @keyframes pilotGlowPulse {
            0%, 100% {
              box-shadow: 0 0 0 0 rgba(0, 242, 254, 0.7);
              transform: scale(1);
            }
            50% {
              box-shadow: 0 0 0 8px rgba(0, 242, 254, 0);
              transform: scale(1.02);
            }
          }
          @keyframes pilotPulseIndicator {
            0%, 100% {
              box-shadow: 0 0 0 0 rgba(0, 242, 254, 0.8);
            }
            50% {
              box-shadow: 0 0 0 10px rgba(0, 242, 254, 0);
            }
          }
          @media (max-width: 600px) {
            .pilot-guide-min-pill {
              bottom: 12px !important;
              right: 12px !important;
              left: auto !important;
              padding: 0.5rem 0.85rem !important;
              font-size: 0.8rem !important;
              min-height: 38px !important;
            }
          }
        `}</style>
        <div
          className="pilot-guide-min-pill"
          onClick={() => setState(prev => ({ ...prev, isMinimized: false }))}
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 9999,
            cursor: 'pointer',
            background: 'rgba(13, 21, 39, 0.94)',
            border: '1.5px solid rgba(0, 242, 254, 0.35)',
            borderRadius: '999px',
            padding: '0.6rem 1.15rem',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.75), 0 0 24px rgba(0, 242, 254, 0.4)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            fontSize: '0.86rem',
            fontWeight: 700,
            maxWidth: 'calc(100vw - 32px)',
            boxSizing: 'border-box',
            transition: 'all 0.25s ease',
            userSelect: 'none',
            touchAction: 'manipulation',
            minHeight: '42px'
          }}
          role="button"
          tabIndex={0}
          title="Open Live Pilot Coach"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#00f2fe',
                boxShadow: '0 0 10px #00f2fe',
                animation: 'pilotGlowPulse 2.4s infinite'
              }}
            />
            <span style={{ color: '#ffffff', fontWeight: 700 }}>
              🚀 Pilot Guide (Step {currentStep}/{totalSteps}) ▾
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setState(prev => ({ ...prev, isDismissed: true }));
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '50%',
              color: '#cbd5e1',
              cursor: 'pointer',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: '0.25rem'
            }}
            title="Dismiss Guide"
          >
            <X size={13} />
          </button>
        </div>
      </>
    );
  }

  // Live Centered Guidance Modal (Pops up with direct instruction, closes/removes on action for zero mobile distraction)
  return (
    <>
      <style>{`
        @keyframes pilotModalFadeIn {
          from {
            opacity: 0;
            backdrop-filter: blur(0px);
          }
          to {
            opacity: 1;
            backdrop-filter: blur(8px);
          }
        }
        @keyframes pilotWidgetSlideUp {
          from {
            opacity: 0;
            transform: translateY(18px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes pilotPulseIndicator {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(0, 242, 254, 0.8);
          }
          50% {
            box-shadow: 0 0 0 10px rgba(0, 242, 254, 0);
          }
        }
        @media (max-width: 600px) {
          .pilot-guide-backdrop {
            padding: 12px !important;
          }
          .pilot-guide-widget {
            width: calc(100vw - 24px) !important;
            max-width: calc(100vw - 24px) !important;
            padding: 1rem 1rem 1.25rem 1rem !important;
            border-radius: 16px !important;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.9), 0 0 25px rgba(0, 242, 254, 0.3) !important;
          }
          .pilot-guide-mobile-handle {
            display: flex !important;
          }
        }
        @media (min-width: 601px) {
          .pilot-guide-mobile-handle {
            display: none !important;
          }
        }
      `}</style>
      <div
        className="pilot-guide-backdrop"
        onClick={() => setState(prev => ({ ...prev, isMinimized: true }))}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(5, 10, 24, 0.78)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          boxSizing: 'border-box',
          animation: 'pilotModalFadeIn 0.25s ease forwards'
        }}
      >
        <div
          className="pilot-guide-widget"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'relative',
            zIndex: 9999,
            width: 'min(420px, calc(100vw - 32px))',
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: 'calc(100vh - 48px)',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            background: 'rgba(13, 21, 39, 0.94)',
            border: '1.5px solid rgba(0, 242, 254, 0.35)',
            borderRadius: '18px',
            padding: '1.35rem',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 35px rgba(0, 242, 254, 0.25)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            color: '#f8fafc',
            boxSizing: 'border-box',
            animation: 'pilotWidgetSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
          }}
        >
          {/* Mobile Drag / Touch Collapse Handle */}
          <div
            className="pilot-guide-mobile-handle"
            onClick={() => setState(prev => ({ ...prev, isMinimized: true }))}
            style={{
              width: '100%',
              justifyContent: 'center',
              alignItems: 'center',
              paddingBottom: '0.65rem',
              cursor: 'pointer'
            }}
          >
            <div
              style={{
                width: '44px',
                height: '4px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.3)'
              }}
            />
          </div>

          {/* Live Personal Teacher Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.85rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              paddingBottom: '0.7rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 10px #10b981',
                  animation: 'pilotPulseIndicator 2.2s infinite'
                }}
              />
              <div>
                <span style={{ fontWeight: 800, fontSize: '0.98rem', color: '#ffffff', letterSpacing: '-0.2px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  🧑‍🏫 Live Pilot Coach
                </span>
                <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 600, display: 'block' }}>
                  ● Step-by-Step Guidance
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span
                style={{
                  background: isClient ? 'rgba(59, 130, 246, 0.22)' : 'rgba(139, 92, 246, 0.22)',
                  color: isClient ? '#60a5fa' : '#c084fc',
                  border: '1px solid ' + (isClient ? 'rgba(59, 130, 246, 0.5)' : 'rgba(139, 92, 246, 0.5)'),
                  padding: '0.2rem 0.55rem',
                  borderRadius: '999px',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}
              >
                {isClient ? 'Client' : 'Freelancer'}
              </span>
              <button
                type="button"
                onClick={() => setState(prev => ({ ...prev, isMinimized: true }))}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  padding: '0.4rem',
                  display: 'flex',
                  alignItems: 'center',
                  minWidth: '32px',
                  minHeight: '32px',
                  justifyContent: 'center'
                }}
                title="Minimize to Pill"
              >
                <ChevronDown size={17} />
              </button>
              <button
                type="button"
                onClick={() => setState(prev => ({ ...prev, isDismissed: true }))}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  padding: '0.4rem',
                  display: 'flex',
                  alignItems: 'center',
                  minWidth: '32px',
                  minHeight: '32px',
                  justifyContent: 'center'
                }}
                title="Close Guide"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Role Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '0.45rem',
              background: 'rgba(0, 0, 0, 0.45)',
              padding: '0.3rem',
              borderRadius: '10px',
              marginBottom: '0.9rem'
            }}
          >
            <button
              type="button"
              onClick={() => handleSelectTour('client')}
              style={{
                flex: 1,
                padding: '0.5rem 0.6rem',
                borderRadius: '8px',
                border: isClient ? '1.5px solid #00f2fe' : '1.5px solid transparent',
                background: isClient ? 'rgba(0, 242, 254, 0.18)' : 'transparent',
                color: isClient ? '#00f2fe' : '#94a3b8',
                fontWeight: 800,
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                minHeight: '38px',
                touchAction: 'manipulation'
              }}
            >
              👤 Client Tour (4)
            </button>
            <button
              type="button"
              onClick={() => handleSelectTour('freelancer')}
              style={{
                flex: 1,
                padding: '0.5rem 0.6rem',
                borderRadius: '8px',
                border: !isClient ? '1.5px solid #c084fc' : '1.5px solid transparent',
                background: !isClient ? 'rgba(192, 132, 252, 0.18)' : 'transparent',
                color: !isClient ? '#c084fc' : '#94a3b8',
                fontWeight: 800,
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                minHeight: '38px',
                touchAction: 'manipulation'
              }}
            >
              💼 Freelancer (5)
            </button>
          </div>

          {/* Step Progress Indicators */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.9rem' }}>
            {steps.map((s) => {
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
                      : 'rgba(255, 255, 255, 0.2)',
                    boxShadow: isCurrent ? '0 0 10px #00f2fe' : 'none',
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
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              padding: '0.95rem',
              marginBottom: '0.9rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.55rem' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  background: 'rgba(0, 242, 254, 0.18)',
                  color: '#00f2fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1.5px solid rgba(0, 242, 254, 0.35)',
                  flexShrink: 0
                }}
              >
                <StepIcon size={18} />
              </div>
              <div>
                <span style={{ fontSize: '0.74rem', color: '#38bdf8', display: 'block', fontWeight: 700, letterSpacing: '0.3px' }}>
                  {activeStepData.badge}
                </span>
                <h4 style={{ margin: 0, fontSize: '1.02rem', color: '#ffffff', fontWeight: 800 }}>
                  {activeStepData.title}
                </h4>
              </div>
            </div>

            {/* Coach Voice Balloon */}
            <div
              style={{
                background: 'rgba(0, 242, 254, 0.08)',
                border: '1px solid rgba(0, 242, 254, 0.25)',
                borderRadius: '8px',
                padding: '0.65rem 0.8rem',
                marginBottom: '0.7rem',
                fontSize: '0.86rem',
                color: '#f1f5f9',
                lineHeight: 1.5,
                fontWeight: 500
              }}
            >
              {activeStepData.teacherVoice}
            </div>

            <p style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.45, margin: '0 0 0.8rem 0' }}>
              {activeStepData.description}
            </p>

            {/* Wallet status checkmark indicator */}
            {isClient && currentStep === 1 && publicKey && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.8rem',
                  color: '#34d399',
                  background: 'rgba(16, 185, 129, 0.15)',
                  padding: '0.45rem 0.7rem',
                  borderRadius: '8px',
                  marginBottom: '0.8rem',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  fontWeight: 600
                }}
              >
                <CheckCircle2 size={15} />
                <span>Wallet Connected: <code>{publicKey.slice(0, 5)}...{publicKey.slice(-4)}</code> (10,000 XLM)</span>
              </div>
            )}

            {/* Primary Action Button (Executes action and immediately removes modal for zero distraction) */}
            <button
              type="button"
              onClick={() => handleExecuteAction(activeStepData.actionType)}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                fontSize: '0.9rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                marginBottom: '0.55rem',
                minHeight: '44px',
                borderRadius: '8px',
                touchAction: 'manipulation',
                boxShadow: '0 4px 15px rgba(0, 242, 254, 0.35)'
              }}
            >
              <Play size={16} /> {activeStepData.actionLabel}
            </button>

            {/* Secondary Dismiss Button: Let user do the step directly on mobile */}
            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, isMinimized: true }))}
              style={{
                width: '100%',
                padding: '0.55rem 0.8rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                color: '#cbd5e1',
                borderRadius: '8px',
                cursor: 'pointer',
                marginBottom: '0.75rem',
                touchAction: 'manipulation'
              }}
            >
              👉 Got It • Remove Modal & Let Me Do It on Screen
            </button>

            {/* Pro Tip */}
            <div
              style={{
                fontSize: '0.76rem',
                color: '#e2e8f0',
                lineHeight: 1.4,
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '0.5rem 0.7rem',
                borderRadius: '8px',
                borderLeft: '3.5px solid #00f2fe'
              }}
            >
              💡 <strong style={{ color: '#00f2fe' }}>Coach Tip:</strong> {activeStepData.tip}
            </div>
          </div>

          {/* Footer Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem' }}>
            <button
              type="button"
              onClick={handleRestart}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#cbd5e1',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.55rem',
                minHeight: '38px',
                touchAction: 'manipulation'
              }}
              title="Restart Tour from Step 1"
            >
              <RotateCcw size={14} /> Restart
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <button
                type="button"
                onClick={handlePrev}
                disabled={currentStep === 1}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: currentStep === 1 ? '#64748b' : '#f8fafc',
                  cursor: currentStep === 1 ? 'not-allowed' : 'pointer',
                  borderRadius: '8px',
                  padding: '0.5rem 0.8rem',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontWeight: 700,
                  minHeight: '38px',
                  touchAction: 'manipulation'
                }}
              >
                <ArrowLeft size={14} /> Back
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
                  borderRadius: '8px',
                  padding: '0.5rem 0.95rem',
                  fontSize: '0.84rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontWeight: 800,
                  boxShadow: '0 0 14px rgba(0, 242, 254, 0.4)',
                  minHeight: '38px',
                  touchAction: 'manipulation'
                }}
              >
                {currentStep === totalSteps ? 'Finish Tour 🎉' : <>Next <ArrowRight size={14} /></>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
