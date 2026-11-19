import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { BrandLockup } from '../components/BrandMark';
import LandingShaderCanvas from '../components/LandingShaderCanvas';
import EscrowPhoneShowcase from '../components/EscrowPhoneShowcase';
import ZeroFeeSliceSection from '../components/ZeroFeeSliceSection';
import SorobanBlueprintSection from '../components/SorobanBlueprintSection';
import KineticLogoCanvas from '../components/KineticLogoCanvas';
import VerificationLedgerModal from '../components/VerificationLedgerModal';
import '../styles/landing.css';

const LandingPage = () => {
  const { user, activeRole, isSimulationMode, switchRole } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [selectedRole, setSelectedRole] = useState('freelancer');
  const [showLedger, setShowLedger] = useState(false);
  const reducedMotion = Boolean(useReducedMotion());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const signedInDashboardPath = activeRole === 'freelancer' ? '/freelancer' : '/client';
  const roleCtaTo = user
    ? (selectedRole === 'freelancer' ? '/freelancer' : '/client')
    : `/auth?mode=signup&role=${selectedRole}`;

  return (
    <div className="gp-landing" data-surface="dark">
      {/* Borderless top navigation bar bleeding over y = 0 WebGL stage */}
      <header
        className={`fixed inset-x-0 top-0 z-50 h-16 border-b transition-[background-color,border-color,backdrop-filter] duration-200 ${
          scrolled
            ? 'border-zinc-800 bg-[#09090b]/85 backdrop-blur-md'
            : 'border-transparent bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-full max-w-[1120px] items-center justify-between gap-6 px-4 sm:px-6">
          <Link to="/" aria-label="GigPay home" className="no-underline">
            <BrandLockup size={28} variant="dark" />
          </Link>

          <nav className="flex items-center gap-5 sm:gap-6" aria-label="Landing navigation">
            <a
              href="#how-it-works"
              className="hidden text-[13px] font-medium text-zinc-400 no-underline transition-colors hover:text-zinc-50 sm:inline-block"
            >
              How it works
            </a>
            <a
              href="#zero-fees"
              className="hidden text-[13px] font-medium text-zinc-400 no-underline transition-colors hover:text-zinc-50 sm:inline-block"
            >
              Zero fees
            </a>
            <button
              type="button"
              onClick={() => setShowLedger(true)}
              className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-zinc-400 transition-colors hover:text-zinc-50"
            >
              Public ledger
            </button>
            {user && !isSimulationMode ? (
              <Link to={signedInDashboardPath} className="gp-btn gp-btn-primary">
                Dashboard
              </Link>
            ) : (
              <Link to="/auth" className="gp-btn gp-btn-primary">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* Section 1: Full-Viewport WebGL Hero (Restrained Twinkling Kinetic QR Matrix + Quiet Horizon) */}
        <section
          className="gp-hero-stage relative flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 pt-24 pb-20 sm:px-6"
          aria-label="GigPay milestone escrow overview"
        >
          <LandingShaderCanvas />

          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none relative z-10 flex max-w-[920px] flex-col items-center gap-5 text-center"
          >
            <h1 className="gp-hero-title">
              Locked before work.
              <br />
              Paid on approval.
            </h1>

            <p className="m-0 max-w-[46ch] text-[15px] leading-relaxed text-zinc-300 [text-shadow:0_2px_18px_rgba(9,9,11,0.95)] sm:text-base">
              Scan a QR, lock milestone funds on Stellar Testnet, and release 100% straight to the freelancer in five seconds.
            </p>

            <div className="pointer-events-auto mt-2 flex flex-wrap items-center justify-center gap-3">
              {user && !isSimulationMode ? (
                <Link to={signedInDashboardPath} className="gp-btn gp-btn-primary gp-btn-lg">
                  Open {activeRole === 'freelancer' ? 'Freelancer' : 'Client'} Workspace
                  <ArrowRight size={17} />
                </Link>
              ) : (
                <Link to="/auth?mode=signup&role=freelancer" className="gp-btn gp-btn-primary gp-btn-lg">
                  Start an escrow
                  <ArrowRight size={17} />
                </Link>
              )}
            </div>
          </motion.div>

          {/* Static scroll cue (reacts cleanly on hover without looping) */}
          <a
            href="#how-it-works"
            aria-label="Scroll to see how GigPay works"
            className="group absolute bottom-7 z-10 flex flex-col items-center gap-2 text-[12px] font-medium tracking-wide text-zinc-400 no-underline transition-colors hover:text-zinc-200"
          >
            <span>Scroll to explore</span>
            <span className="block h-5 w-px bg-[#00f0ff]/75 transition-[height,background-color] duration-200 group-hover:h-7 group-hover:bg-[#00f0ff]" />
          </a>
        </section>

        {/* Section 2: Scroll-Scrubbed Orthographic 9:19.5 Phone Reveal Choreography */}
        <EscrowPhoneShowcase />

        {/* Section 3: Zero-Control Scroll-Scrubbed "20% Slice" Commission Comparison */}
        <ZeroFeeSliceSection />

        {/* Section 4: Pointer-Illuminated Stellar Soroban Open Escrow Blueprint */}
        <SorobanBlueprintSection onOpenLedger={() => setShowLedger(true)} />

        {/* Section 5: Centered Closing Role CTA + Twinkling Kinetic Particle Brand Logo Finale */}
        <section className="relative flex min-h-[82dvh] flex-col justify-between border-t border-zinc-800/80 bg-[#09090b] pt-20 sm:min-h-[88dvh] sm:pt-32">
          <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 text-center sm:px-6">
            <h2 className="m-0 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-5xl sm:leading-[1.08]">
              Try a milestone escrow in under two minutes
            </h2>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-zinc-400 sm:text-base">
              Choose your role to start on Stellar Testnet with a built-in practice wallet or Varial extension.
            </p>

            {user && !isSimulationMode ? (
              <div className="mt-8">
                <Link to={signedInDashboardPath} className="gp-btn gp-btn-primary gp-btn-lg">
                  Go to {activeRole === 'freelancer' ? 'Freelancer' : 'Client'} Workspace
                  <ArrowRight size={17} />
                </Link>
              </div>
            ) : (
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <div className="gp-segmented" role="tablist" aria-label="Choose starting role">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectedRole === 'freelancer'}
                    className="gp-segmented-btn"
                    onClick={() => setSelectedRole('freelancer')}
                  >
                    Freelancer
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectedRole === 'client'}
                    className="gp-segmented-btn"
                    onClick={() => setSelectedRole('client')}
                  >
                    Client
                  </button>
                </div>

                <Link
                  to={roleCtaTo}
                  onClick={user ? () => switchRole(selectedRole) : undefined}
                  className="gp-btn gp-btn-primary gp-btn-lg"
                >
                  Continue as {selectedRole === 'freelancer' ? 'Freelancer' : 'Client'}
                  <ArrowRight size={17} />
                </Link>
              </div>
            )}
          </div>

          {/* Interactive Twinkling Kinetic Particle Verified Payout Seal + GigPay Wordmark */}
          <div className="mx-auto mt-8 w-full max-w-[1120px] px-4 sm:mt-16 sm:px-6">
            <KineticLogoCanvas />
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-zinc-800/80 px-4 pt-7 pb-10 text-[13px] text-zinc-400 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLockup size={22} variant="dark" />
          <span>Stellar Testnet pilot · Practice XLM only (no cash value or fiat withdrawal).</span>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <button
            type="button"
            onClick={() => setShowLedger(true)}
            className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-zinc-400 transition-colors hover:text-zinc-50"
          >
            Public ledger
          </button>
          <a
            href="https://github.com/MarkAngelGuevarra/gigpay/blob/main/PRIVACY.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-medium text-zinc-400 no-underline transition-colors hover:text-zinc-50"
          >
            Privacy
          </a>
          <a
            href="https://github.com/MarkAngelGuevarra/gigpay"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-medium text-zinc-400 no-underline transition-colors hover:text-zinc-50"
          >
            GitHub
          </a>
        </div>
      </footer>

      {showLedger && <VerificationLedgerModal isOpen={showLedger} onClose={() => setShowLedger(false)} />}
    </div>
  );
};

export default LandingPage;
