import { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useSpring, useTransform, useReducedMotion } from 'framer-motion';
import QRCode from 'qrcode';

// Precompute authentic Version-1 (21x21) Error-Correction-H QR matrix encoding "GigPay"
const buildGigPayQrModules = () => {
  const qr = QRCode.create('GigPay', { errorCorrectionLevel: 'H' });
  const size = qr.modules.size;
  const cells = [];
  const centerStart = Math.floor(size / 2) - 2;
  const centerEnd = Math.floor(size / 2) + 2;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Reserve central 5x5 pocket (~5.6% area, well within H-level 30% error correction) for Verified Payout Seal
      if (r >= centerStart && r <= centerEnd && c >= centerStart && c <= centerEnd) continue;
      if (qr.modules.get(r, c)) {
        cells.push({ r, c });
      }
    }
  }
  return { size, cells };
};

const GIGPAY_QR = buildGigPayQrModules();

const ScanScreenLayer = ({ progress }) => {
  // Screen contents fade in strictly AFTER "Being paid should be simple." fades out and the phone scales in
  const layerOpacity = useTransform(progress, [0.19, 0.26, 0.47, 0.51], [0, 1, 1, 0]);
  const bracketScale = useTransform(progress, [0.28, 0.34], [1.08, 1]);
  const beamY = useTransform(progress, [0.30, 0.41], [0, 134]);
  const beamOpacity = useTransform(progress, [0.29, 0.32, 0.39, 0.42], [0, 1, 1, 0]);
  const sheetY = useTransform(progress, [0.37, 0.44], [32, 0]);
  const sheetOpacity = useTransform(progress, [0.37, 0.43], [0, 1]);
  const lockFillScale = useTransform(progress, [0.41, 0.46], [0, 1]);

  const qrOriginX = 74;
  const qrOriginY = 149;
  const qrBoxSize = 112;
  const cellSize = qrBoxSize / GIGPAY_QR.size;

  return (
    <motion.div style={{ opacity: layerOpacity }} className="absolute inset-0">
      <svg
        viewBox="0 0 260 564"
        className="h-full w-full"
        role="img"
        aria-label="Scanning a GigPay QR code to lock milestone escrow"
      >
        <defs>
          <linearGradient id="gpScrubBeam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity="0" />
            <stop offset="50%" stopColor="#67e8f9" stopOpacity="0.52" />
            <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Minimalist app header */}
        <text x="22" y="68" fill="#fafafa" fontSize="13.5" fontWeight="600" fontFamily="Geist, sans-serif">
          Scan Pay QR
        </text>
        <text x="238" y="68" textAnchor="end" fill="#71717a" fontSize="10.5" fontFamily="Geist, sans-serif">
          Camera · Gallery
        </text>

        {/* Clean dark viewfinder aperture */}
        <rect x="20" y="92" width="220" height="226" rx="22" fill="#0d0d11" stroke="#27272a" strokeWidth="1" />

        {/* Real scannable "GigPay" QR card with quiet zone and centered Verified Payout Seal */}
        <g>
          <rect x="64" y="139" width="132" height="132" rx="14" fill="#fafafa" />
          <g fill="#09090b" shapeRendering="crispEdges">
            {GIGPAY_QR.cells.map(({ r, c }) => (
              <rect
                key={`${r}-${c}`}
                x={qrOriginX + c * cellSize}
                y={qrOriginY + r * cellSize}
                width={cellSize + 0.15}
                height={cellSize + 0.15}
              />
            ))}
          </g>

          {/* Center Verified Payout Seal badge inside QR */}
          <rect x="117" y="192" width="26" height="26" rx="6.5" fill="#09090b" stroke="#fafafa" strokeWidth="2.4" />
          <path d="M135.2 206.1 A 5.7 5.7 0 1 1 132.7 200.4" stroke="#fafafa" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M126.9 205.2 L129.1 207.3 L135.1 201" stroke="#00f0ff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>

        {/* Scroll-tightening cyan viewfinder brackets */}
        <motion.g
          stroke="#00f0ff"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
          style={{ scale: bracketScale, transformOrigin: '130px 205px' }}
        >
          <path d="M52 147 V126 H73" />
          <path d="M187 126 H208 V147" />
          <path d="M52 263 V284 H73" />
          <path d="M187 284 H208 V263" />
        </motion.g>

        {/* Scroll-scrubbed scan beam (sweeps once top-to-bottom strictly with scroll) */}
        <motion.g style={{ y: beamY, opacity: beamOpacity }}>
          <rect x="56" y="128" width="148" height="22" fill="url(#gpScrubBeam)" />
          <line x1="56" y1="139" x2="204" y2="139" stroke="#67e8f9" strokeWidth="1.8" strokeLinecap="round" />
        </motion.g>

        {/* Scroll-revealed Recipient & Escrow Lock Sheet */}
        <motion.g style={{ y: sheetY, opacity: sheetOpacity }}>
          <rect x="20" y="340" width="220" height="190" rx="20" fill="#131317" stroke="#27272a" strokeWidth="1" />
          <circle cx="48" cy="374" r="15" fill="#1e1e24" stroke="#3f3f46" strokeWidth="1" />
          <text x="48" y="378" textAnchor="middle" fill="#fafafa" fontSize="10.5" fontWeight="600" fontFamily="Geist, sans-serif">
            MS
          </text>
          <text x="74" y="371" fill="#fafafa" fontSize="13" fontWeight="600" fontFamily="Geist, sans-serif">
            Maria Santos
          </text>
          <text x="74" y="386" fill="#a1a1aa" fontSize="10" fontFamily="Geist Mono, monospace">
            GB4K…9P2X
          </text>

          <line x1="34" y1="406" x2="226" y2="406" stroke="#27272a" strokeWidth="1" />

          <text x="34" y="432" fill="#a1a1aa" fontSize="11" fontFamily="Geist, sans-serif">
            Milestone lock
          </text>
          <text x="226" y="433" textAnchor="end" fill="#fafafa" fontSize="15.5" fontWeight="700" fontFamily="Geist, sans-serif">
            250.00 XLM
          </text>
          <text x="34" y="451" fill="#71717a" fontSize="10" fontFamily="Geist, sans-serif">
            0% platform fee · Soroban contract
          </text>

          {/* Escrow lock confirmation bar */}
          <rect x="34" y="472" width="192" height="40" rx="11" fill="#18181c" stroke="#27272a" strokeWidth="1" />
          <motion.rect
            x="34"
            y="472"
            width="192"
            height="40"
            rx="11"
            fill="#00becd"
            style={{ scaleX: lockFillScale, transformOrigin: '34px 492px' }}
          />
          <text x="130" y="496" textAnchor="middle" fill="#09090b" fontSize="12" fontWeight="600" fontFamily="Geist, sans-serif">
            Locked in Soroban
          </text>
        </motion.g>
      </svg>
    </motion.div>
  );
};

const DeliverScreenLayer = ({ progress }) => {
  const layerOpacity = useTransform(progress, [0.51, 0.56, 0.74, 0.78], [0, 1, 1, 0]);

  const card1Y = useTransform(progress, [0.54, 0.59], [22, 0]);
  const card1Op = useTransform(progress, [0.54, 0.59], [0, 1]);
  const check1 = useTransform(progress, [0.57, 0.61], [0, 1]);

  const card2Y = useTransform(progress, [0.59, 0.64], [22, 0]);
  const card2Op = useTransform(progress, [0.59, 0.64], [0, 1]);
  const check2 = useTransform(progress, [0.62, 0.66], [0, 1]);

  const card3Y = useTransform(progress, [0.64, 0.69], [22, 0]);
  const card3Op = useTransform(progress, [0.64, 0.69], [0, 1]);
  const check3 = useTransform(progress, [0.67, 0.71], [0, 1]);

  const reviewBarScale = useTransform(progress, [0.68, 0.73], [0, 1]);

  const cards = [
    { y: 146, title: 'Brand UI Kit', host: 'figma.com/file/gp-kit', icon: 'frame', animY: card1Y, animOp: card1Op, check: check1 },
    { y: 226, title: 'Landing PR #42', host: 'github.com/org/pull/42', icon: 'branch', animY: card2Y, animOp: card2Op, check: check2 },
    { y: 306, title: 'Walkthrough Clip', host: 'loom.com/share/84b2c', icon: 'play', animY: card3Y, animOp: card3Op, check: check3 },
  ];

  return (
    <motion.div style={{ opacity: layerOpacity }} className="absolute inset-0">
      <svg
        viewBox="0 0 260 564"
        className="h-full w-full"
        role="img"
        aria-label="Delivering verifiable proof of work links on GigPay"
      >
        <text x="22" y="68" fill="#fafafa" fontSize="13.5" fontWeight="600" fontFamily="Geist, sans-serif">
          Deliverables
        </text>
        <rect x="160" y="55" width="80" height="20" rx="10" fill="rgba(245,158,11,0.14)" stroke="rgba(245,158,11,0.36)" strokeWidth="1" />
        <text x="200" y="68.5" textAnchor="middle" fill="#fbbf24" fontSize="9.2" fontWeight="600" fontFamily="Geist, sans-serif">
          IN REVIEW
        </text>

        {/* Active milestone bar */}
        <rect x="20" y="92" width="220" height="38" rx="11" fill="#131317" stroke="#27272a" strokeWidth="1" />
        <text x="34" y="115" fill="#d4d4d8" fontSize="11.5" fontWeight="500" fontFamily="Geist, sans-serif">
          Brand Identity &amp; UI
        </text>
        <text x="226" y="115" textAnchor="end" fill="#00f0ff" fontSize="12" fontWeight="600" fontFamily="Geist, sans-serif">
          250 XLM
        </text>

        {/* Scroll-scrubbed geometric deliverable rows */}
        {cards.map((item) => (
          <motion.g key={item.title} style={{ y: item.animY, opacity: item.animOp }}>
            <rect x="20" y={item.y} width="220" height="66" rx="15" fill="#131317" stroke="#27272a" strokeWidth="1" />
            <rect x="34" y={item.y + 15} width="36" height="36" rx="10" fill="#1c1c22" stroke="#2e2e36" strokeWidth="1" />

            {item.icon === 'frame' && (
              <g stroke="#d4d4d8" strokeWidth="1.6" fill="none">
                <rect x="44" y={item.y + 24} width="16" height="11" rx="2" />
                <line x1="44" y1={item.y + 39} x2="60" y2={item.y + 39} stroke="#00f0ff" strokeLinecap="round" />
              </g>
            )}
            {item.icon === 'branch' && (
              <g stroke="#d4d4d8" strokeWidth="1.6" fill="none" strokeLinecap="round">
                <circle cx="47" cy={item.y + 27} r="2.3" />
                <circle cx="47" cy={item.y + 39} r="2.3" />
                <circle cx="57" cy={item.y + 33} r="2.3" stroke="#00f0ff" />
                <line x1="47" y1={item.y + 29.5} x2="47" y2={item.y + 36.5} />
                <path d={`M49 ${item.y + 29} C53 ${item.y + 29} 55 ${item.y + 31} 55 ${item.y + 33}`} stroke="#00f0ff" />
              </g>
            )}
            {item.icon === 'play' && (
              <polygon points={`48,${item.y + 25} 59,${item.y + 33} 48,${item.y + 41}`} fill="#00f0ff" />
            )}

            <text x="82" y={item.y + 31} fill="#fafafa" fontSize="12" fontWeight="600" fontFamily="Geist, sans-serif">
              {item.title}
            </text>
            <text x="82" y={item.y + 47} fill="#a1a1aa" fontSize="9.8" fontFamily="Geist Mono, monospace">
              {item.host}
            </text>

            {/* Scroll-drawn verification checkmark */}
            <circle cx="218" cy={item.y + 33} r="10.5" fill="rgba(0,240,255,0.14)" />
            <motion.path
              d={`M213.2 ${item.y + 33.2} L216.5 ${item.y + 36.5} L223 ${item.y + 29.6}`}
              stroke="#00f0ff"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              style={{ pathLength: item.check }}
            />
          </motion.g>
        ))}

        {/* Four-stage synced timeline card */}
        <rect x="20" y="402" width="220" height="128" rx="18" fill="#131317" stroke="#27272a" strokeWidth="1" />
        <text x="36" y="432" fill="#fafafa" fontSize="12" fontWeight="600" fontFamily="Geist, sans-serif">
          Synced Escrow Timeline
        </text>
        <text x="36" y="450" fill="#a1a1aa" fontSize="10.2" fontFamily="Geist, sans-serif">
          Ready for client approval
        </text>

        <rect x="36" y="474" width="43" height="5" rx="2.5" fill="#00f0ff" />
        <rect x="85" y="474" width="43" height="5" rx="2.5" fill="#00f0ff" />
        <rect x="134" y="474" width="43" height="5" rx="2.5" fill="#27272a" />
        <motion.rect
          x="134"
          y="474"
          width="43"
          height="5"
          rx="2.5"
          fill="#fbbf24"
          style={{ scaleX: reviewBarScale, transformOrigin: '134px 476.5px' }}
        />
        <rect x="183" y="474" width="43" height="5" rx="2.5" fill="#27272a" />

        <text x="36" y="498" fill="#a1a1aa" fontSize="9" fontFamily="Geist, sans-serif">Funded</text>
        <text x="85" y="498" fill="#a1a1aa" fontSize="9" fontFamily="Geist, sans-serif">Active</text>
        <text x="134" y="498" fill="#fbbf24" fontSize="9" fontWeight="600" fontFamily="Geist, sans-serif">Review</text>
        <text x="183" y="498" fill="#71717a" fontSize="9" fontFamily="Geist, sans-serif">Paid</text>
      </svg>
    </motion.div>
  );
};

const SettleBackdropLayer = ({ progress }) => {
  // Subtle seal ring inside the phone screen that fades out WITH the phone, leaving ONLY the emerald checkmark
  const ringOpacity = useTransform(progress, [0.76, 0.80, 0.84, 0.89], [0, 1, 1, 0]);
  const ringPath = useTransform(progress, [0.76, 0.82], [0, 1]);

  return (
    <motion.div style={{ opacity: ringOpacity }} className="absolute inset-0 flex items-center justify-center">
      <svg viewBox="0 0 260 564" className="h-full w-full" aria-hidden="true">
        <g transform="translate(130, 282)">
          <circle r="48" fill="rgba(0,240,255,0.06)" stroke="rgba(0,240,255,0.22)" strokeWidth="1" />
          <motion.path
            d="M27.2 4.2 A 28 28 0 1 1 14.9 -23.6"
            stroke="#fafafa"
            strokeWidth="5.4"
            strokeLinecap="round"
            fill="none"
            style={{ pathLength: ringPath }}
          />
        </g>
      </svg>
    </motion.div>
  );
};

const ReducedMotionFallback = () => (
  <section id="how-it-works" className="scroll-mt-16 border-t border-zinc-800/80 bg-[#09090b] py-24">
    <div className="mx-auto max-w-[1120px] px-4 sm:px-6">
      <h2 className="m-0 text-center text-3xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
        Being paid should be simple.
      </h2>
      <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
        <div className="border-t border-zinc-800 pt-6">
          <h3 className="m-0 text-xl font-semibold text-zinc-50">Scan a QR.</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-zinc-400">
            Scan from camera or gallery. Recipient address and milestone amount pre-fill and lock in Soroban before work starts.
          </p>
        </div>
        <div className="border-t border-zinc-800 pt-6">
          <h3 className="m-0 text-xl font-semibold text-zinc-50">Deliver work.</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-zinc-400">
            Attach live deliverable links (Figma, GitHub PR, or Loom). Both sides track the same four-stage escrow live.
          </p>
        </div>
        <div className="border-t border-zinc-800 pt-6">
          <h3 className="m-0 text-xl font-semibold text-zinc-50">Settle within seconds.</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-zinc-400">
            Once the client approves, the payment goes straight to your wallet.
          </p>
        </div>
      </div>
    </div>
  </section>
);

const EscrowPhoneShowcase = () => {
  const trackRef = useRef(null);
  const reducedMotion = Boolean(useReducedMotion());
  const [glidePx, setGlidePx] = useState(250);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const update = () => {
      const w = window.innerWidth;
      if (w < 768) setGlidePx(0);
      else setGlidePx(Math.min(265, Math.round(w * 0.2)));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });

  // Responsive scroll smoothing: tracks fast flicks crisply and stops dead when scroll stops
  const smooth = useSpring(scrollYProgress, {
    stiffness: 360,
    damping: 36,
    mass: 0.14,
  });

  // Beat 1A (0.00 - 0.13): "Being paid should be simple." holds dead-center in stillness, then fades out cleanly
  const introOpacity = useTransform(smooth, [0, 0.07, 0.13], [1, 1, 0]);
  const introScale = useTransform(smooth, [0.07, 0.13], [1, 0.96]);

  // Beat 1B (0.13 - 0.22): Only AFTER intro fades out, phone emerges in place by scaling up cleanly (zero vertical lift)
  const phoneScale = useTransform(smooth, [0.13, 0.22, 0.83, 0.91], [0.78, 1, 1, 1.46]);
  const phoneOpacity = useTransform(smooth, [0.13, 0.20, 0.84, 0.91], [0, 1, 1, 0]);
  const phoneX = useTransform(
    smooth,
    [0, 0.25, 0.32, 0.47, 0.54, 0.71, 0.77, 1],
    [0, 0, -glidePx, -glidePx, glidePx, glidePx, 0, 0]
  );

  // Beat 2 (0.28 - 0.51): "Scan a QR." fades in on the right, then fades out cleanly
  const scanCopyOpacity = useTransform(smooth, [0.28, 0.33, 0.46, 0.51], [0, 1, 1, 0]);
  const scanCopyY = useTransform(smooth, [0.28, 0.33, 0.46, 0.51], [20, 0, 0, -18]);

  // Beat 3 (0.53 - 0.75): "Deliver work." fades in on the left, then fades out cleanly
  const deliverCopyOpacity = useTransform(smooth, [0.53, 0.58, 0.70, 0.75], [0, 1, 1, 0]);
  const deliverCopyY = useTransform(smooth, [0.53, 0.58, 0.70, 0.75], [20, 0, 0, -18]);

  // Beat 4 (0.77 - 1.00): ONLY the emerald checkmark remains from the dissolving phone + "Settle within seconds."
  const checkPathLength = useTransform(smooth, [0.77, 0.84], [0, 1]);
  const checkOpacity = useTransform(smooth, [0.76, 0.79, 1], [0, 1, 1]);
  const checkScale = useTransform(smooth, [0.84, 0.91], [1, 1.24]);
  const checkY = useTransform(smooth, [0.84, 0.91], [0, -44]);

  const settleCopyOpacity = useTransform(smooth, [0.85, 0.92, 1], [0, 1, 1]);
  const settleCopyY = useTransform(smooth, [0.85, 0.92], [22, 0]);

  if (reducedMotion) {
    return <ReducedMotionFallback />;
  }

  return (
    <section
      id="how-it-works"
      ref={trackRef}
      aria-label="How GigPay milestone escrow works"
      className="relative scroll-mt-16 border-t border-zinc-800/80 bg-[#09090b] min-h-[480vh] md:min-h-[560vh]"
    >
      {/* Full-viewport sticky choreography stage (releases cleanly at 100% so finale scrolls up naturally) */}
      <div className="sticky top-0 flex h-[100dvh] w-full items-center justify-center overflow-hidden px-4 sm:px-6">
        <div className="relative flex h-full w-full max-w-[1120px] items-center justify-center">
          {/* Beat 1A Dead-Center Intro Statement (holds at center of viewport, fades out before phone appears) */}
          <motion.div
            style={{ opacity: introOpacity, scale: introScale }}
            className="pointer-events-none absolute inset-x-4 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center text-center"
          >
            <h2 className="m-0 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-5xl md:text-6xl">
              Being paid should be simple.
            </h2>
          </motion.div>

          {/* Beat 2 Copy: Right half on desktop, top centered on mobile */}
          <motion.div
            style={{ opacity: scanCopyOpacity, y: scanCopyY }}
            className="pointer-events-none absolute inset-x-4 top-20 z-20 flex flex-col items-center text-center md:inset-x-auto md:top-1/2 md:right-6 md:w-[44%] md:-translate-y-1/2 md:items-start md:text-left"
          >
            <h3 className="m-0 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
              Scan a QR.
            </h3>
            <p className="mt-3 mb-0 max-w-[36ch] text-[15px] leading-relaxed text-zinc-400 sm:text-base">
              Camera or gallery. Recipient address and amount pre-fill and lock in Soroban before work starts.
            </p>
          </motion.div>

          {/* Beat 3 Copy: Left half on desktop, top centered on mobile */}
          <motion.div
            style={{ opacity: deliverCopyOpacity, y: deliverCopyY }}
            className="pointer-events-none absolute inset-x-4 top-20 z-20 flex flex-col items-center text-center md:inset-x-auto md:top-1/2 md:left-6 md:w-[44%] md:-translate-y-1/2 md:items-start md:text-left"
          >
            <h3 className="m-0 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
              Deliver work.
            </h3>
            <p className="mt-3 mb-0 max-w-[36ch] text-[15px] leading-relaxed text-zinc-400 sm:text-base">
              Attach verifiable links from Figma, GitHub, or Loom. Both sides see the same four-stage timeline live.
            </p>
          </motion.div>

          {/* Flat Orthographic True 9:19.5 Flagship Phone Shell (scales up in place from center; zero vertical rise) */}
          <motion.div
            style={{
              x: phoneX,
              scale: phoneScale,
              opacity: phoneOpacity,
            }}
            className="relative z-10 mt-20 md:mt-6"
          >
            {/* Ultra-clean anodized hairline chassis in true 9:19.5 aspect ratio */}
            <div
              className="relative aspect-[9/19.5] h-[clamp(410px,56dvh,500px)] rounded-[42px] bg-gradient-to-b from-zinc-600/75 via-zinc-800/90 to-zinc-800/60 p-[1.5px] shadow-[0_32px_90px_-16px_rgba(0,0,0,0.9)] md:h-[clamp(470px,68dvh,590px)] md:rounded-[46px]"
            >
              {/* Side buttons (minimal flat silhouette) */}
              <div aria-hidden="true" className="absolute top-[18%] -left-[2.5px] h-9 w-[2.5px] rounded-l bg-zinc-700" />
              <div aria-hidden="true" className="absolute top-[28%] -left-[2.5px] h-9 w-[2.5px] rounded-l bg-zinc-700" />
              <div aria-hidden="true" className="absolute top-[22%] -right-[2.5px] h-14 w-[2.5px] rounded-r bg-zinc-700" />

              <div className="relative h-full w-full overflow-hidden rounded-[40.5px] bg-[#0a0a0d] p-2 md:rounded-[44.5px] md:p-2.5">
                {/* Inner pure OLED screen */}
                <div className="relative h-full w-full overflow-hidden rounded-[33px] border border-white/[0.06] bg-[#09090b] md:rounded-[35px]">
                  {/* Dynamic Island & Status Bar */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 pt-2.5">
                    <span className="text-[10px] font-semibold text-zinc-400 tabular-nums">9:41</span>
                    <div className="h-[17px] w-[68px] rounded-full bg-black ring-1 ring-white/10" />
                    <span className="h-1.5 w-3.5 rounded-[2px] bg-zinc-400" />
                  </div>

                  {/* Scroll-scrubbed internal screen layers */}
                  <ScanScreenLayer progress={smooth} />
                  <DeliverScreenLayer progress={smooth} />
                  <SettleBackdropLayer progress={smooth} />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Beat 4 Surviving Emerald Checkmark (decoupled from phone fade so ONLY the checkmark remains) */}
          <motion.div
            style={{ opacity: checkOpacity, scale: checkScale, y: checkY }}
            className="pointer-events-none absolute z-30 mt-20 flex items-center justify-center md:mt-6"
            aria-hidden="true"
          >
            <svg viewBox="0 0 88 88" className="h-24 w-24 sm:h-28 sm:w-28" fill="none">
              <motion.path
                d="M21 45.5 L36.5 61 L69 27"
                stroke="#00f0ff"
                strokeWidth="6.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pathLength: checkPathLength }}
              />
            </svg>
          </motion.div>

          {/* Beat 4 Finale Copy: Fades in right below the lone surviving checkmark */}
          <motion.div
            style={{ opacity: settleCopyOpacity, y: settleCopyY }}
            className="pointer-events-none absolute inset-x-4 top-[57%] z-30 flex flex-col items-center text-center md:top-[56%]"
          >
            <h3 className="m-0 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
              Settle within seconds.
            </h3>
            <p className="mt-3 mb-0 max-w-[48ch] text-[15px] leading-relaxed text-balance text-zinc-400 sm:text-base">
              Once the client approves, the payment goes straight to your wallet.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default EscrowPhoneShowcase;
