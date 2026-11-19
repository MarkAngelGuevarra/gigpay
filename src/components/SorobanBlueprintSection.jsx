import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { GIGPAY_ESCROW_CONTRACT_ID, EXPLORER_BASE_URL, isStaticTestnetSnapshotEnabled } from '../lib/stellar';
import onchainData from '../data/onchainEscrows.json';

// Real releases from the on-chain index (scripts/index_escrows.mjs): the three most recent
// escrows where both sides are outside wallets. Each row links to its release transaction.
const RECENT_RELEASES = (onchainData.escrows || [])
  .filter((e) => e.released && e.releaseTxHash && e.walletKind === 'Outside wallet')
  .slice(-3)
  .reverse()
  .map((e) => ({
    id: e.onChainTaskId,
    hash: `${e.releaseTxHash.slice(0, 6)}…${e.releaseTxHash.slice(-4)}`,
    amount: `${e.amount} XLM`,
    url: EXPLORER_BASE_URL ? `${EXPLORER_BASE_URL}/tx/${e.releaseTxHash}` : '',
  }));

const SpotlightCard = ({ children }) => {
  const cardRef = useRef(null);

  const handlePointerMove = (e) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
    el.style.setProperty('--spot-opacity', '1');
  };

  const handlePointerLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty('--spot-opacity', '0');
  };

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="group relative flex flex-col justify-between bg-[#0c0c0f] p-7 sm:p-8"
      style={{ '--mx': '50%', '--my': '50%', '--spot-opacity': '0' }}
    >
      {/* Pointer-only cyan radial illumination (completely still when pointer is idle) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: 'var(--spot-opacity)',
          background: 'radial-gradient(360px circle at var(--mx) var(--my), rgba(0, 240, 255, 0.11), transparent 72%)',
        }}
      />
      <div className="relative z-10 flex h-full flex-col justify-between gap-8">{children}</div>
    </div>
  );
};

const SorobanBlueprintSection = ({ onOpenLedger }) => {
  const sectionRef = useRef(null);
  const reducedMotion = Boolean(useReducedMotion());

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'center center'],
  });
  const finalityRuleScale = useTransform(scrollYProgress, [0.25, 0.85], [0, 1]);

  const contractExplorerUrl = EXPLORER_BASE_URL
    ? `${EXPLORER_BASE_URL}/contract/${GIGPAY_ESCROW_CONTRACT_ID}`
    : null;
  const shortContract = `${GIGPAY_ESCROW_CONTRACT_ID.slice(0, 6)}…${GIGPAY_ESCROW_CONTRACT_ID.slice(-4)}`;

  return (
    <section
      ref={sectionRef}
      aria-label="Stellar Soroban open escrow architecture"
      className="flex min-h-[85dvh] items-center border-t border-zinc-800/80 bg-[#09090b] py-24 sm:py-28"
    >
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="m-0 text-3xl font-semibold tracking-tight text-balance text-zinc-50 sm:text-5xl">
            Built on open escrow, not blind trust.
          </h2>
          <p className="mx-auto mt-3 mb-0 max-w-[50ch] text-[15px] leading-relaxed text-zinc-400 sm:text-base">
            Funds sit inside an inspectable Stellar Soroban contract rather than a company bank account.
          </p>
        </div>

        {/* Seamless 3-column orthographic hairline grid */}
        <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-800 md:grid-cols-3">
          {/* Panel 1: Non-custodial contract */}
          <SpotlightCard>
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/90">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#00f0ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="11" width="14" height="10" rx="2.5" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
              </div>
              <h3 className="mt-6 mb-0 text-lg font-semibold tracking-tight text-zinc-50">
                Client-signed release only
              </h3>
              <p className="mt-2.5 mb-0 text-[15px] leading-relaxed text-zinc-400">
                The Soroban contract fixes the recipient address at funding time and releases strictly on client signature.
              </p>
            </div>

            <div className="flex flex-col gap-3 border-t border-zinc-800/80 pt-5">
              <div className="font-mono text-[13px] text-zinc-300">{shortContract}</div>
              {contractExplorerUrl && (
                <a
                  href={contractExplorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#00f0ff] no-underline transition-colors hover:text-cyan-300"
                >
                  Inspect on Stellar Expert
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          </SpotlightCard>

          {/* Panel 2: Five-second finality */}
          <SpotlightCard>
            <div>
              <div className="text-5xl font-bold tracking-[-0.04em] text-zinc-50 tabular-nums leading-none">
                ~5s
              </div>
              <div className="mt-4 h-[2px] w-full overflow-hidden rounded-full bg-zinc-800">
                <motion.div
                  style={{
                    scaleX: reducedMotion ? 1 : finalityRuleScale,
                    transformOrigin: 'left center',
                  }}
                  className="h-full w-full bg-[#00f0ff]"
                />
              </div>
              <h3 className="mt-6 mb-0 text-lg font-semibold tracking-tight text-zinc-50">
                Direct wallet finality
              </h3>
              <p className="mt-2.5 mb-0 text-[15px] leading-relaxed text-zinc-400">
                No five-day wire clearing or hidden FX markups. Approved milestones land straight in the freelancer wallet.
              </p>
            </div>

            <div className="border-t border-zinc-800/80 pt-5 text-[13px] text-zinc-400">
              Stellar Testnet Soroban ledger
            </div>
          </SpotlightCard>

          {/* Panel 3: Public verification ledger */}
          <SpotlightCard>
            <div>
              <div className="flex flex-col gap-2">
                {(isStaticTestnetSnapshotEnabled() ? RECENT_RELEASES : []).map((row) => {
                  const rowClass =
                    'flex items-center justify-between rounded-lg border border-zinc-800/90 bg-zinc-950/70 px-3 py-2 text-[12.5px] no-underline transition-colors duration-200 group-hover:border-zinc-700';
                  const content = (
                    <>
                      <span className="inline-flex items-center gap-2 font-mono text-zinc-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#00f0ff]" />
                        #{row.id} · {row.hash}
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium text-zinc-200 tabular-nums">
                        {row.amount}
                        {row.url && <ExternalLink size={12} className="text-zinc-500" />}
                      </span>
                    </>
                  );
                  return row.url ? (
                    <a
                      key={row.id}
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Escrow ${row.id} release transaction on Stellar Expert`}
                      className={`${rowClass} hover:border-zinc-600`}
                    >
                      {content}
                    </a>
                  ) : (
                    <div key={row.id} className={rowClass}>
                      {content}
                    </div>
                  );
                })}
                <div className="text-[12px] text-zinc-500">
                  Latest releases between outside wallets (Stellar Testnet)
                </div>
              </div>
              <h3 className="mt-6 mb-0 text-lg font-semibold tracking-tight text-zinc-50">
                Open verification ledger
              </h3>
              <p className="mt-2.5 mb-0 text-[15px] leading-relaxed text-zinc-400">
                Audit every funded and released escrow on-chain, with team and automated test wallets labeled transparently.
              </p>
            </div>

            <div className="border-t border-zinc-800/80 pt-5">
              <button
                type="button"
                onClick={onOpenLedger}
                className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-medium text-[#00f0ff] transition-colors hover:text-cyan-300"
              >
                Open public ledger
                <ArrowRight size={13} />
              </button>
            </div>
          </SpotlightCard>
        </div>
      </div>
    </section>
  );
};

export default SorobanBlueprintSection;
