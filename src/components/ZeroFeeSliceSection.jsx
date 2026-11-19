import { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useSpring, useTransform, useReducedMotion } from 'framer-motion';

const ZeroFeeSliceSection = () => {
  const sectionRef = useRef(null);
  const reducedMotion = Boolean(useReducedMotion());
  const [sliceOffset, setSliceOffset] = useState(40);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const update = () => {
      setSliceOffset(window.innerWidth < 640 ? 14 : 42);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const smooth = useSpring(scrollYProgress, {
    stiffness: 340,
    damping: 34,
    mass: 0.14,
  });

  // Scroll-scrubbed razor slice: crimson seam appears, then the rightmost 20% physically detaches to the right
  const seamOpacity = useTransform(smooth, [0.16, 0.26], [0, 1]);
  const seamScaleY = useTransform(smooth, [0.16, 0.28], [0, 1]);
  const cutChunkX = useTransform(smooth, [0.28, 0.68], [0, sliceOffset]);
  const cutChunkOpacity = useTransform(smooth, [0.28, 0.68], [1, 0.58]);
  const lossTagOpacity = useTransform(smooth, [0.36, 0.56], [0, 1]);

  // GigPay bar remains completely unbroken while emerald fills edge-to-edge on scroll
  const gigpayFillScale = useTransform(smooth, [0.24, 0.68], [0.06, 1]);
  const gigpayBadgeOpacity = useTransform(smooth, [0.5, 0.7], [0, 1]);

  if (reducedMotion) {
    return (
      <section
        id="zero-fees"
        className="flex min-h-[82dvh] scroll-mt-16 items-center border-t border-zinc-800/80 bg-[#09090b] py-24"
      >
        <div className="mx-auto w-full max-w-[960px] px-4 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <h2 className="m-0 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
                Keep 100% of every milestone.
              </h2>
              <p className="mt-3 mb-0 max-w-[46ch] text-[15px] leading-relaxed text-zinc-400 sm:text-base">
                Traditional freelance marketplaces take up to 20% off every invoice. GigPay takes zero commission.
              </p>
            </div>
            <div className="text-7xl font-bold tracking-[-0.05em] text-zinc-50 tabular-nums leading-none sm:text-8xl">
              0%
            </div>
          </div>

          <div className="mt-14 flex flex-col gap-9">
            <div>
              <div className="mb-3 flex items-center justify-between text-[13px]">
                <span className="text-zinc-400">Typical freelance platforms</span>
                <span className="font-medium text-red-400 tabular-nums">80% kept · -20% platform cut</span>
              </div>
              <div className="flex h-14 w-full items-stretch gap-4">
                <div className="flex w-[80%] items-center rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-[14px] font-medium text-zinc-300 tabular-nums">
                  80%
                </div>
                <div className="flex w-[20%] items-center justify-center rounded-xl border border-red-500/30 bg-red-500/12 text-[13px] font-semibold text-red-400 tabular-nums opacity-65">
                  -20%
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between text-[13px]">
                <span className="font-medium text-zinc-100">GigPay Escrow</span>
                <span className="font-semibold text-emerald-400 tabular-nums">100% received · 0% cut</span>
              </div>
              <div className="flex h-14 w-full items-center justify-between rounded-xl bg-emerald-500 px-5 text-[14px] font-semibold text-zinc-950">
                <span>100% straight to freelancer</span>
                <span className="tabular-nums">0% cut</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      id="zero-fees"
      ref={sectionRef}
      aria-label="Zero platform commission comparison"
      className="relative scroll-mt-16 border-t border-zinc-800/80 bg-[#09090b] min-h-[155vh]"
    >
      <div className="sticky top-0 flex h-[100dvh] w-full items-center justify-center overflow-hidden px-5 sm:px-6">
        <div className="mx-auto w-full max-w-[960px]">
          {/* Monumental 0% architectural header */}
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <h2 className="m-0 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
                Keep 100% of every milestone.
              </h2>
              <p className="mt-3 mb-0 max-w-[46ch] text-[15px] leading-relaxed text-zinc-400 sm:text-base">
                Traditional freelance marketplaces slice up to 20% off every payout. GigPay takes zero commission.
              </p>
            </div>
            <div className="shrink-0 text-[clamp(4.25rem,10vw,7.5rem)] leading-[0.88] font-bold tracking-[-0.05em] text-zinc-50 tabular-nums">
              0%
            </div>
          </div>

          {/* Scroll-scrubbed Split Bars (pure zero-control minimalism) */}
          <div className="mt-12 flex flex-col gap-10 sm:mt-16">
            {/* Row 1: Traditional Platform — rightmost 20% physically slices off on scroll */}
            <div>
              <div className="mb-3 flex items-center justify-between gap-4 text-[13px]">
                <span className="text-zinc-400">Typical freelance platforms</span>
                <motion.span
                  style={{ opacity: lossTagOpacity }}
                  className="shrink-0 font-medium text-red-400 tabular-nums whitespace-nowrap"
                >
                  80% kept · -20% cut
                </motion.span>
              </div>

              <div className="relative flex h-14 w-full items-stretch sm:h-16">
                {/* Left 80% remainder */}
                <div className="flex w-[80%] items-center rounded-l-xl border border-zinc-800 bg-zinc-900/90 px-4 text-[14px] font-medium text-zinc-300 tabular-nums sm:px-5">
                  80%
                </div>

                {/* Razor-thin crimson slice line at the 80% boundary */}
                <motion.div
                  aria-hidden="true"
                  style={{ opacity: seamOpacity, scaleY: seamScaleY }}
                  className="absolute top-[-6px] bottom-[-6px] left-[80%] z-10 w-[2px] -translate-x-1/2 bg-red-500"
                />

                {/* Rightmost 20% chunk that detaches and drifts away strictly on scroll */}
                <motion.div
                  style={{ x: cutChunkX, opacity: cutChunkOpacity }}
                  className="flex w-[20%] items-center justify-center rounded-r-xl border border-l-0 border-red-500/35 bg-red-500/12 px-2 text-[13px] font-semibold text-red-400 tabular-nums whitespace-nowrap"
                >
                  -20%
                </motion.div>
              </div>
            </div>

            {/* Row 2: GigPay Escrow — unbroken 100% bar filling cleanly edge-to-edge on scroll */}
            <div>
              <div className="mb-3 flex items-center justify-between gap-4 text-[13px]">
                <span className="font-medium text-zinc-100">GigPay Escrow</span>
                <motion.span
                  style={{ opacity: gigpayBadgeOpacity }}
                  className="shrink-0 font-semibold text-emerald-400 tabular-nums whitespace-nowrap"
                >
                  100% received · 0% cut
                </motion.span>
              </div>

              <div className="relative h-14 w-full overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10 sm:h-16">
                <motion.div
                  style={{ scaleX: gigpayFillScale, transformOrigin: 'left center' }}
                  className="absolute inset-0 bg-emerald-500"
                />
                <motion.div
                  style={{ opacity: gigpayBadgeOpacity }}
                  className="relative z-10 flex h-full items-center justify-between px-4 text-[14px] font-semibold text-zinc-950 sm:px-5"
                >
                  <span>100% straight to freelancer</span>
                  <span className="tabular-nums whitespace-nowrap">0% cut</span>
                </motion.div>
              </div>
            </div>
          </div>

          <p className="mt-8 mb-0 text-[13px] text-zinc-500">
            Clients cover only the fractional Stellar network fee (~0.06 XLM total for lock and release).
          </p>
        </div>
      </div>
    </section>
  );
};

export default ZeroFeeSliceSection;
