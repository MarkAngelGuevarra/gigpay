import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ImagePlus, Link2, CheckCircle2, ChevronDown, ChevronUp, X, RotateCcw } from 'lucide-react';
import { parseQrPayload, shortStellarAddress } from '../lib/invite';
import { decodeQrFromImageData, decodeQrFromImageFile } from '../lib/qrDecode';

const QrScannerModal = ({ isOpen, onClose, onConfirm }) => {
  const [mode, setMode] = useState('scan'); // 'scan' | 'paste'
  const [cameraState, setCameraState] = useState('idle'); // 'idle' | 'starting' | 'active' | 'unavailable'
  const [cameraHint, setCameraHint] = useState('');
  const [scanError, setScanError] = useState('');
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [pasteInput, setPasteInput] = useState('');
  const [confirmed, setConfirmed] = useState(null); // { address, name, title, amount }
  const [showFullAddress, setShowFullAddress] = useState(false);

  const videoRef = useRef(null);
  const scanCanvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const lastScanTsRef = useRef(0);

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try { track.stop(); } catch { /* ignore */ }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch { /* ignore */ }
    }
  }, []);

  const resetState = useCallback(() => {
    stopCamera();
    setConfirmed(null);
    setScanError('');
    setPasteInput('');
    setShowFullAddress(false);
    setCameraState('idle');
    setCameraHint('');
  }, [stopCamera]);

  // Escape key closes modal cleanly
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Reset cleanly when closed
  useEffect(() => {
    if (!isOpen) {
      resetState();
      setMode('scan');
    }
  }, [isOpen, resetState]);

  // Live camera lifecycle: active strictly when modal is open, mode === 'scan', and no recipient confirmed yet
  useEffect(() => {
    if (!isOpen || mode !== 'scan' || confirmed) {
      stopCamera();
      return undefined;
    }

    let cancelled = false;

    const startCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraState('unavailable');
        setCameraHint('Camera scanning is unavailable in this browser. Upload a QR screenshot or paste the link instead.');
        return;
      }

      setCameraState('starting');
      setCameraHint('');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 1280 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();

        if (cancelled) return;
        setCameraState('active');

        const scanFrame = (ts) => {
          if (cancelled || !streamRef.current || !videoRef.current) return;

          // Throttle decoding to ~6 frames/sec to keep mobile thermals cool
          if (ts - lastScanTsRef.current >= 160 && video.readyState >= 2 && video.videoWidth > 0) {
            lastScanTsRef.current = ts;
            let canvas = scanCanvasRef.current;
            if (!canvas) {
              canvas = document.createElement('canvas');
              scanCanvasRef.current = canvas;
            }
            const maxDim = 640;
            const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
            const w = Math.max(1, Math.round(video.videoWidth * scale));
            const h = Math.max(1, Math.round(video.videoHeight * scale));
            if (canvas.width !== w || canvas.height !== h) {
              canvas.width = w;
              canvas.height = h;
            }
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, w, h);
              const imageData = ctx.getImageData(0, 0, w, h);
              const raw = decodeQrFromImageData(imageData);
              if (raw) {
                const parsed = parseQrPayload(raw);
                if (parsed.ok) {
                  stopCamera();
                  setScanError('');
                  setConfirmed(parsed.payload);
                  return;
                }
                setScanError(parsed.error);
              }
            }
          }

          rafRef.current = requestAnimationFrame(scanFrame);
        };

        rafRef.current = requestAnimationFrame(scanFrame);
      } catch (err) {
        if (cancelled) return;
        setCameraState('unavailable');
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          setCameraHint('Camera access was denied. You can still upload a QR screenshot from your gallery or paste the link.');
        } else {
          setCameraHint('No rear camera detected. Upload a QR screenshot from your gallery or paste the link below.');
        }
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, mode, confirmed, stopCamera]);

  const handleGalleryUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setScanError('');
    setIsReadingFile(true);
    try {
      const result = await decodeQrFromImageFile(file);
      if (!result.ok) {
        setScanError(result.error);
        return;
      }
      stopCamera();
      setConfirmed(result.payload);
    } finally {
      setIsReadingFile(false);
    }
  };

  const handlePasteSubmit = (e) => {
    e.preventDefault();
    const parsed = parseQrPayload(pasteInput);
    if (!parsed.ok) {
      setScanError(parsed.error);
      return;
    }
    setScanError('');
    setConfirmed(parsed.payload);
  };

  const handleConfirmRecipient = () => {
    if (!confirmed) return;
    onConfirm?.(confirmed);
    onClose();
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="gp-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-scanner-title"
        className="gp-modal max-w-[460px]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="gp-modal-close"
          aria-label="Close QR scanner"
        >
          <X size={18} />
        </button>

        <div className="pr-10">
          <h2 id="qr-scanner-title" className="m-0 text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            {confirmed ? 'Confirm recipient' : 'Scan GigPay QR'}
          </h2>
          <p className="mt-1 mb-0 text-[13px] text-[var(--text-muted)]">
            {confirmed
              ? 'Check the recipient details before locking funds in escrow.'
              : 'Scan a freelancer QR card, upload a screenshot from Messenger or Viber, or paste a link.'}
          </p>
        </div>

        {/* Hidden file input for Gallery QR upload (accessible across all tabs) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleGalleryUpload}
          className="sr-only"
          aria-label="Upload QR image from gallery"
        />

        {confirmed ? (
          <div className="mt-5 flex flex-col gap-4">
            <div className="rounded-2xl border border-[var(--signal-money-border)] bg-[var(--signal-money-bg)] p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[var(--signal-money)]" />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-[var(--text-primary)]">
                    {confirmed.name || 'Verified Stellar recipient'}
                  </div>
                  <div className="gp-mono mt-0.5 text-[13px] text-[var(--text-secondary)]">
                    {shortStellarAddress(confirmed.address)}
                  </div>

                  {(confirmed.title || confirmed.amount) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--signal-money-border)] pt-3 text-[13px]">
                      {confirmed.title && (
                        <span className="font-medium text-[var(--text-primary)]">{confirmed.title}</span>
                      )}
                      {confirmed.amount && (
                        <span className="font-semibold text-[var(--signal-money-fg)] tabular-nums">
                          {Number(confirmed.amount).toLocaleString(undefined, { maximumFractionDigits: 7 })} XLM
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowFullAddress((prev) => !prev)}
                className="mt-3 inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {showFullAddress ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showFullAddress ? 'Hide full address' : 'Verify full 56-character address'}
              </button>

              {showFullAddress && (
                <div className="gp-mono mt-2 break-all rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5 text-[12px] text-[var(--text-primary)] select-all">
                  {confirmed.address}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleConfirmRecipient}
                className="gp-btn gp-btn-money gp-btn-lg flex-1"
              >
                Continue to lock funds
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmed(null);
                  setShowFullAddress(false);
                  setScanError('');
                }}
                className="gp-btn gp-btn-secondary gp-btn-lg"
              >
                <RotateCcw size={15} />
                Scan another
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            {/* Segmented Mode Control */}
            <div className="gp-segmented w-full" role="tablist" aria-label="QR input method">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'scan'}
                onClick={() => {
                  setScanError('');
                  setMode('scan');
                }}
                className="gp-segmented-btn flex-1"
              >
                <Camera size={14} />
                Scan or Upload QR
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'paste'}
                onClick={() => {
                  setScanError('');
                  setMode('paste');
                }}
                className="gp-segmented-btn flex-1"
              >
                <Link2 size={14} />
                Paste link
              </button>
            </div>

            {mode === 'scan' ? (
              <>
                {/* Crisp Square Camera Viewfinder */}
                <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[#09090b]">
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className={`h-full w-full object-cover ${cameraState === 'active' ? 'opacity-100' : 'opacity-0'}`}
                  />

                  {/* Architectural cyan viewfinder brackets */}
                  {cameraState === 'active' && (
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center p-10">
                      <div className="relative h-full w-full max-h-[240px] max-w-[240px]">
                        <span className="absolute top-0 left-0 h-7 w-7 rounded-tl-lg border-t-[3px] border-l-[3px] border-[#00f0ff]" />
                        <span className="absolute top-0 right-0 h-7 w-7 rounded-tr-lg border-t-[3px] border-r-[3px] border-[#00f0ff]" />
                        <span className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-lg border-b-[3px] border-l-[3px] border-[#00f0ff]" />
                        <span className="absolute right-0 bottom-0 h-7 w-7 rounded-br-lg border-r-[3px] border-b-[3px] border-[#00f0ff]" />
                      </div>
                    </div>
                  )}

                  {cameraState === 'starting' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-[13px] text-zinc-400">
                      <Camera size={24} className="text-zinc-500" />
                      <span>Starting camera…</span>
                    </div>
                  )}

                  {cameraState === 'unavailable' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400">
                        <Camera size={22} />
                      </div>
                      <p className="m-0 max-w-[30ch] text-[13px] leading-relaxed text-zinc-300">
                        {cameraHint || 'Camera unavailable. Upload a QR screenshot from your gallery or paste the invite link.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isReadingFile}
                        className="gp-btn gp-btn-money mt-1"
                      >
                        <ImagePlus size={15} />
                        {isReadingFile ? 'Reading QR…' : 'Upload QR from gallery'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Primary Gallery Upload Action (GCash / QR Ph pattern for Messenger/Viber screenshots) */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isReadingFile}
                  className="gp-btn gp-btn-secondary gp-btn-lg w-full"
                >
                  <ImagePlus size={16} />
                  {isReadingFile ? 'Scanning image…' : 'Upload QR from gallery'}
                </button>
              </>
            ) : (
              <form onSubmit={handlePasteSubmit} className="flex flex-col gap-3">
                <div className="gp-field">
                  <label htmlFor="qr-paste-input" className="gp-label">
                    GigPay invite link or Stellar wallet address
                  </label>
                  <input
                    id="qr-paste-input"
                    type="text"
                    value={pasteInput}
                    onChange={(e) => {
                      setPasteInput(e.target.value);
                      if (scanError) setScanError('');
                    }}
                    placeholder="https://www.gigpay.tech/client?pay=G... or G..."
                    className="gp-input gp-mono text-[13px]"
                    autoFocus
                  />
                  <p className="gp-hint">
                    Supports full GigPay links, dynamic milestone requests, or 56-character Stellar G-addresses.
                  </p>
                </div>

                <button type="submit" className="gp-btn gp-btn-primary gp-btn-lg w-full">
                  Verify recipient
                </button>
              </form>
            )}

            {scanError && (
              <div
                role="alert"
                className="rounded-xl border border-[var(--signal-danger-border)] bg-[var(--signal-danger-bg)] px-3.5 py-2.5 text-[13px] text-[var(--signal-danger)]"
              >
                {scanError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default QrScannerModal;
