import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { Download, Share2, Copy, Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { BrandMark, BrandLockup } from './BrandMark';
import {
  buildInviteLink,
  buildBrandedQrCardDataUrl,
  sanitizeInviteAmount,
  sanitizeInviteText,
  shortStellarAddress,
} from '../lib/invite';
import { isValidStellarAddress, isDemoWallet } from '../lib/stellar';

const buildSvgQrMatrix = (text) => {
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
    const size = qr.modules.size;
    const mid = Math.floor(size / 2);
    const pocketHalf = Math.max(2, Math.floor(size * 0.085));
    const cells = [];

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (Math.abs(r - mid) <= pocketHalf && Math.abs(c - mid) <= pocketHalf) continue;
        if (qr.modules.get(r, c)) cells.push({ r, c });
      }
    }
    return { size, cells, pocketHalf };
  } catch {
    return { size: 21, cells: [], pocketHalf: 2 };
  }
};

const PayQrModal = ({ isOpen, onClose, payoutAddress, displayName = '', onToast }) => {
  const [qrMode, setQrMode] = useState('static'); // 'static' | 'dynamic'
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneAmount, setMilestoneAmount] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [showFullAddress, setShowFullAddress] = useState(false);

  const cleanAddress = String(payoutAddress || '').trim();
  const canGenerate = isValidStellarAddress(cleanAddress) && !isDemoWallet(cleanAddress);
  const cleanName = sanitizeInviteText(displayName, 60) || 'GigPay Freelancer';
  const cleanTitle = qrMode === 'dynamic' ? sanitizeInviteText(milestoneTitle, 100) : '';
  const cleanAmount = qrMode === 'dynamic' ? sanitizeInviteAmount(milestoneAmount) : '';

  const amountInvalid =
    qrMode === 'dynamic' && milestoneAmount.trim().length > 0 && !cleanAmount;

  const inviteLink = useMemo(() => {
    if (!canGenerate) return '';
    return buildInviteLink(cleanAddress, {
      name: displayName,
      title: cleanTitle,
      amount: cleanAmount,
    });
  }, [canGenerate, cleanAddress, displayName, cleanTitle, cleanAmount]);

  const qrMatrix = useMemo(() => {
    if (!inviteLink) return null;
    return buildSvgQrMatrix(inviteLink);
  }, [inviteLink]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const handleSaveQrImage = async () => {
    if (!canGenerate || savingImage) return;
    setSavingImage(true);
    try {
      const dataUrl = await buildBrandedQrCardDataUrl({
        address: cleanAddress,
        displayName,
        title: cleanTitle,
        amount: cleanAmount,
      });
      const slug = (cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gigpay').slice(0, 24);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `gigpay-qr-${slug}${cleanAmount ? `-${cleanAmount}xlm` : ''}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      onToast?.('Saved your GigPay QR card.', 'success');
    } catch {
      onToast?.('Could not export the QR card image. Copy your invite link instead.', 'error');
    } finally {
      setSavingImage(false);
    }
  };

  const handleShareOrCopyLink = async () => {
    if (!inviteLink) return;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: cleanTitle ? `GigPay Milestone: ${cleanTitle}` : `Pay ${cleanName} on GigPay`,
          text: cleanAmount
            ? `Lock ${cleanAmount} XLM in GigPay escrow for ${cleanName}.`
            : `Lock milestone funds in GigPay escrow for ${cleanName}.`,
          url: inviteLink,
        });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedLink(true);
      onToast?.('Invite link copied.', 'success');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      onToast?.('Could not copy link. Select and copy your address below.', 'error');
    }
  };

  const handleCopyAddress = async () => {
    if (!canGenerate) return;
    try {
      await navigator.clipboard.writeText(cleanAddress);
      setCopiedAddress(true);
      onToast?.('Stellar payout address copied.', 'success');
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch {
      onToast?.('Could not copy address automatically.', 'error');
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const qrViewSize = 200;
  const cellSize = qrMatrix ? qrViewSize / qrMatrix.size : 8;
  const haloPx = qrMatrix ? Math.round(((qrMatrix.pocketHalf * 2 + 1) / qrMatrix.size) * 194) : 34;
  const sealPx = Math.max(20, Math.round(haloPx * 0.76));

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
        aria-labelledby="pay-qr-title"
        className="gp-modal max-w-[440px]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="gp-modal-close"
          aria-label="Close Pay QR"
        >
          <X size={18} />
        </button>

        <div className="pr-10">
          <h2 id="pay-qr-title" className="m-0 text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            My Pay QR
          </h2>
          <p className="mt-1 mb-0 text-[13px] text-[var(--text-muted)]">
            Share your QR card or link so clients lock funds straight to your wallet.
          </p>
        </div>

        {!canGenerate ? (
          <div className="mt-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-4 text-[14px] text-[var(--text-secondary)]">
            Connect Varial or activate your Testnet practice wallet first to generate your personal GigPay QR card.
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {/* Static vs Dynamic Segmented Control */}
            <div className="gp-segmented w-full" role="tablist" aria-label="QR card mode">
              <button
                type="button"
                role="tab"
                aria-selected={qrMode === 'static'}
                onClick={() => setQrMode('static')}
                className="gp-segmented-btn flex-1"
              >
                Personal QR
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={qrMode === 'dynamic'}
                onClick={() => setQrMode('dynamic')}
                className="gp-segmented-btn flex-1"
              >
                Milestone Request
              </button>
            </div>

            {qrMode === 'dynamic' && (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,1fr)_124px]">
                <div className="gp-field">
                  <label htmlFor="pay-qr-milestone-title" className="gp-label">
                    Milestone title
                  </label>
                  <input
                    id="pay-qr-milestone-title"
                    type="text"
                    maxLength={100}
                    value={milestoneTitle}
                    onChange={(e) => setMilestoneTitle(e.target.value)}
                    placeholder="e.g., Landing page UI"
                    className="gp-input"
                  />
                </div>
                <div className="gp-field">
                  <label htmlFor="pay-qr-milestone-amount" className="gp-label">
                    Amount (XLM)
                  </label>
                  <input
                    id="pay-qr-milestone-amount"
                    type="text"
                    inputMode="decimal"
                    value={milestoneAmount}
                    onChange={(e) => setMilestoneAmount(e.target.value)}
                    placeholder="250"
                    className="gp-input tabular-nums"
                  />
                </div>
                {amountInvalid && (
                  <p className="m-0 text-[12.5px] text-[var(--signal-danger)] sm:col-span-2">
                    Enter a valid positive XLM amount (up to 1,000,000 XLM).
                  </p>
                )}
              </div>
            )}

            {/* Live Branded QR Ph-Style Card Preview (always pure light card for universal camera contrast) */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-950 shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
                <BrandLockup size={24} variant="light" />
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-emerald-700">
                  {cleanAmount || cleanTitle ? 'MILESTONE QR' : 'PAY QR'}
                </span>
              </div>

              <div className="my-4 flex justify-center">
                <div className="relative flex h-[216px] w-[216px] items-center justify-center rounded-2xl border border-zinc-200 bg-white p-2.5">
                  {qrMatrix && (
                    <svg
                      viewBox={`0 0 ${qrViewSize} ${qrViewSize}`}
                      className="h-full w-full"
                      role="img"
                      aria-label={`GigPay QR code for ${cleanName}`}
                    >
                      <rect width={qrViewSize} height={qrViewSize} fill="#ffffff" />
                      <g fill="#09090b" shapeRendering="crispEdges">
                        {qrMatrix.cells.map(({ r, c }) => (
                          <rect
                            key={`${r}-${c}`}
                            x={c * cellSize}
                            y={r * cellSize}
                            width={cellSize + 0.15}
                            height={cellSize + 0.15}
                          />
                        ))}
                      </g>
                    </svg>
                  )}
                  <div
                    className="pointer-events-none absolute flex items-center justify-center rounded-lg bg-white"
                    style={{ width: haloPx, height: haloPx }}
                  >
                    <BrandMark size={sealPx} variant="light" />
                  </div>
                </div>
              </div>

              <div className="text-center">
                <div className="text-[16px] font-bold tracking-tight text-zinc-950">{cleanName}</div>
                <div className="gp-mono mt-0.5 text-[12.5px] text-zinc-600">
                  {shortStellarAddress(cleanAddress)}
                </div>

                {cleanAmount || cleanTitle ? (
                  <div className="mt-2.5 inline-flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-[13px] font-semibold text-emerald-800">
                    {cleanTitle && <span className="truncate">{cleanTitle}</span>}
                    {cleanTitle && cleanAmount && <span aria-hidden="true">·</span>}
                    {cleanAmount && (
                      <span className="tabular-nums">
                        {Number(cleanAmount).toLocaleString(undefined, { maximumFractionDigits: 7 })} XLM
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 text-[12.5px] text-zinc-500">
                    Scan in GigPay to lock any milestone amount
                  </div>
                )}

                <div className="mt-3.5 border-t border-zinc-200 pt-2.5 text-[11.5px] text-zinc-500">
                  0% platform fee · Stellar Testnet (practice XLM)
                </div>
              </div>
            </div>

            {/* Primary Save & Share Actions */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleSaveQrImage}
                disabled={savingImage || amountInvalid}
                className="gp-btn gp-btn-primary gp-btn-lg"
              >
                <Download size={15} />
                {savingImage ? 'Saving…' : 'Save QR image'}
              </button>
              <button
                type="button"
                onClick={handleShareOrCopyLink}
                disabled={amountInvalid}
                className="gp-btn gp-btn-secondary gp-btn-lg"
              >
                {copiedLink ? <Check size={15} /> : <Share2 size={15} />}
                {copiedLink ? 'Copied' : 'Share link'}
              </button>
            </div>

            {/* Expandable Full 56-Character Address Disclosure */}
            <div className="border-t border-[var(--border-subtle)] pt-3">
              <button
                type="button"
                onClick={() => setShowFullAddress((prev) => !prev)}
                className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                {showFullAddress ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showFullAddress ? 'Hide wallet address' : 'Show full 56-character address'}
              </button>

              {showFullAddress && (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2.5">
                  <code className="gp-mono min-w-0 flex-1 break-all text-[12px] text-[var(--text-primary)] select-all">
                    {cleanAddress}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="gp-btn gp-btn-secondary shrink-0 px-2.5 py-1.5"
                    aria-label="Copy full Stellar address"
                  >
                    {copiedAddress ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default PayQrModal;
