/**
 * Freelancer invite links and QR Ph-style payout cards:
 *   Static:  https://www.gigpay.tech/client?pay=G...
 *   Dynamic: https://www.gigpay.tech/client?pay=G...&name=...&title=...&amount=...
 *
 * Copying a 56-character Stellar address through chat is error-prone. Freelancers share a
 * scannable QR card or link instead so the client's escrow sheet pre-fills automatically.
 * Captured invite data is held in sessionStorage (this tab only, at most 24h) and cleared
 * on sign-out or after escrow creation.
 */
import QRCode from 'qrcode';
import { isValidStellarAddress, isDemoWallet } from './stellar.js';

const STORAGE_KEY = 'gigpay_invite_payout';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_NAME_LEN = 60;
const MAX_TITLE_LEN = 100;
const MAX_AMOUNT = 1_000_000;

// Real G-addresses only: demo keys would pay GigPay's own test wallet.
const isInvitable = (address) => isValidStellarAddress(address) && !isDemoWallet(address);

export const shortStellarAddress = (address) => {
  const clean = String(address || '').trim();
  if (clean.length < 12) return clean;
  return `${clean.slice(0, 6)}…${clean.slice(-4)}`;
};

export const sanitizeInviteText = (value, maxLength = MAX_TITLE_LEN) => {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, maxLength);
};

export const sanitizeInviteAmount = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw || !/^\d+(?:\.\d{1,7})?$/.test(raw)) return '';
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0 || num > MAX_AMOUNT) return '';
  return raw;
};

/**
 * Builds a GigPay client escrow link.
 * Backward-compatible signature:
 *   buildInviteLink(address)
 *   buildInviteLink(address, 'https://www.gigpay.tech')
 *   buildInviteLink(address, { origin, name, title, amount })
 */
export const buildInviteLink = (payoutAddress, optionsOrOrigin) => {
  const isOptionsObj = optionsOrOrigin && typeof optionsOrOrigin === 'object';
  const defaultOrigin = globalThis.location?.origin || 'https://www.gigpay.tech';
  const origin = (isOptionsObj ? optionsOrOrigin.origin : optionsOrOrigin) || defaultOrigin;
  const cleanOrigin = String(origin).replace(/\/+$/, '');

  const params = new URLSearchParams();
  params.set('pay', String(payoutAddress || '').trim());

  if (isOptionsObj) {
    const name = sanitizeInviteText(optionsOrOrigin.name, MAX_NAME_LEN);
    const title = sanitizeInviteText(optionsOrOrigin.title, MAX_TITLE_LEN);
    const amount = sanitizeInviteAmount(optionsOrOrigin.amount);
    if (name) params.set('name', name);
    if (title) params.set('title', title);
    if (amount) params.set('amount', amount);
  }

  return `${cleanOrigin}/client?${params.toString()}`;
};

/**
 * Parses a scanned or pasted QR string.
 * Supports:
 *   1. GigPay invite URLs (?pay=G...&name=...&title=...&amount=...)
 *   2. Stellar SEP-0007 URIs (web+stellar:pay?destination=G...&amount=...)
 *   3. Raw 56-character Stellar G... addresses
 */
export const parseQrPayload = (rawText) => {
  const text = String(rawText || '').trim();
  if (!text) {
    return { ok: false, error: 'Enter a GigPay link or Stellar wallet address.' };
  }

  // Case 1: Raw Stellar G... address
  if (isValidStellarAddress(text)) {
    if (isDemoWallet(text)) {
      return { ok: false, error: 'Demo wallet addresses cannot be used as a payout recipient.' };
    }
    return {
      ok: true,
      payload: { address: text, name: '', title: '', amount: '' },
    };
  }

  // Case 2: Query string only (?pay=G...)
  if (text.startsWith('?')) {
    const params = new URLSearchParams(text);
    const address = String(params.get('pay') || '').trim();
    if (!address || !isValidStellarAddress(address)) {
      return { ok: false, error: 'That link does not contain a valid Stellar recipient address.' };
    }
    if (isDemoWallet(address)) {
      return { ok: false, error: 'Demo wallet addresses cannot be used as a payout recipient.' };
    }
    return {
      ok: true,
      payload: {
        address,
        name: sanitizeInviteText(params.get('name') || '', MAX_NAME_LEN),
        title: sanitizeInviteText(params.get('title') || '', MAX_TITLE_LEN),
        amount: sanitizeInviteAmount(params.get('amount') || ''),
      },
    };
  }

  // Case 3: Full URL or web+stellar URI
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return { ok: false, error: 'That is not a valid GigPay invite link or Stellar G... address.' };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol === 'web+stellar:') {
    const destination = String(parsed.searchParams.get('destination') || '').trim();
    if (!isValidStellarAddress(destination)) {
      return { ok: false, error: 'That Stellar QR code does not contain a valid recipient address.' };
    }
    if (isDemoWallet(destination)) {
      return { ok: false, error: 'Demo wallet addresses cannot be used as a payout recipient.' };
    }
    return {
      ok: true,
      payload: {
        address: destination,
        name: '',
        title: sanitizeInviteText(parsed.searchParams.get('memo') || '', MAX_TITLE_LEN),
        amount: sanitizeInviteAmount(parsed.searchParams.get('amount') || ''),
      },
    };
  }

  if (protocol !== 'https:' && protocol !== 'http:') {
    return { ok: false, error: 'Unsupported link format. Scan a GigPay QR card or paste a G... address.' };
  }

  const pay = String(parsed.searchParams.get('pay') || '').trim();
  if (!isValidStellarAddress(pay)) {
    return { ok: false, error: 'No valid GigPay payout address was found in that QR link.' };
  }
  if (isDemoWallet(pay)) {
    return { ok: false, error: 'Demo wallet addresses cannot be used as a payout recipient.' };
  }

  return {
    ok: true,
    payload: {
      address: pay,
      name: sanitizeInviteText(parsed.searchParams.get('name') || '', MAX_NAME_LEN),
      title: sanitizeInviteText(parsed.searchParams.get('title') || '', MAX_TITLE_LEN),
      amount: sanitizeInviteAmount(parsed.searchParams.get('amount') || ''),
    },
  };
};

/**
 * Generates an inline PNG data URL of the invite link QR code (CSP img-src data: safe).
 */
export const buildInviteQrDataUrl = (payoutAddress, optionsOrOrigin) =>
  QRCode.toDataURL(buildInviteLink(payoutAddress, optionsOrOrigin), {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: { dark: '#09090b', light: '#ffffff' },
  });

const drawRoundedRect = (ctx, x, y, w, h, r) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const drawVerifiedPayoutSeal = (ctx, x, y, size) => {
  const scale = size / 64;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Obsidian rounded tile
  drawRoundedRect(ctx, 0, 0, 64, 64, 16);
  ctx.fillStyle = '#09090b';
  ctx.fill();

  // Open circular seal ring matching public/logo.svg geometry
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fafafa';
  ctx.lineWidth = 5.8;
  ctx.beginPath();
  ctx.arc(32, 32, 16, 0.15, 5.27, false);
  ctx.stroke();

  // Pitch Deck Electric Cyan (#00F0FF) checkmark breaking through the 2 o'clock negative-space gap
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.moveTo(25.5, 32.5);
  ctx.lineTo(30.5, 37.5);
  ctx.lineTo(47.2, 19.8);
  ctx.stroke();

  ctx.restore();
};

/**
 * Renders a high-resolution (840x1120) QR Ph-style Save-to-Photos PNG card with
 * an Error-Correction-H QR matrix, centered Verified Payout Seal, freelancer identity,
 * optional dynamic milestone title/amount, and honest Stellar Testnet disclosure.
 */
export const buildBrandedQrCardDataUrl = async ({
  address,
  displayName = '',
  title = '',
  amount = '',
  origin,
}) => {
  const cleanAddr = String(address || '').trim();
  const cleanName = sanitizeInviteText(displayName, MAX_NAME_LEN) || 'GigPay Freelancer';
  const cleanTitle = sanitizeInviteText(title, MAX_TITLE_LEN);
  const cleanAmount = sanitizeInviteAmount(amount);
  const link = buildInviteLink(cleanAddr, { origin, name: displayName, title: cleanTitle, amount: cleanAmount });

  if (typeof document === 'undefined') {
    return buildInviteQrDataUrl(cleanAddr, { origin, name: displayName, title: cleanTitle, amount: cleanAmount });
  }

  const canvas = document.createElement('canvas');
  const W = 840;
  const H = 1120;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return buildInviteQrDataUrl(cleanAddr, { origin, name: displayName, title: cleanTitle, amount: cleanAmount });
  }

  // Outer card background
  ctx.fillStyle = '#f8f8f9';
  ctx.fillRect(0, 0, W, H);

  drawRoundedRect(ctx, 32, 32, W - 64, H - 64, 36);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#e4e4e7';
  ctx.stroke();

  // Header brand lockup
  drawVerifiedPayoutSeal(ctx, 80, 82, 54);
  ctx.fillStyle = '#09090b';
  ctx.font = '700 34px Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('GigPay', 148, 109);

  // Header badge on right
  const badgeLabel = cleanAmount || cleanTitle ? 'MILESTONE QR' : 'PAY QR';
  ctx.font = '600 18px Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const badgeW = ctx.measureText(badgeLabel).width + 36;
  drawRoundedRect(ctx, W - 80 - badgeW, 88, badgeW, 42, 21);
  ctx.fillStyle = '#ecfeff';
  ctx.fill();
  ctx.strokeStyle = '#a5f3fc';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#0e7490';
  ctx.textAlign = 'center';
  ctx.fillText(badgeLabel, W - 80 - badgeW / 2, 109);

  // Header divider
  ctx.strokeStyle = '#e4e4e7';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(80, 166);
  ctx.lineTo(W - 80, 166);
  ctx.stroke();

  // Generate Error-Correction-H QR matrix so centered Verified Payout Seal stays 100% scannable
  const qr = QRCode.create(link, { errorCorrectionLevel: 'H' });
  const moduleCount = qr.modules.size;
  const qrOuterSize = 540;
  const quietZone = 32;
  const qrArea = qrOuterSize - quietZone * 2;
  const cell = Math.floor(qrArea / moduleCount);
  const actualQrSize = cell * moduleCount;
  const boxX = Math.round((W - qrOuterSize) / 2);
  const boxY = 204;
  const qrStartX = Math.round((W - actualQrSize) / 2);
  const qrStartY = Math.round(boxY + (qrOuterSize - actualQrSize) / 2);

  // Subtle QR card container
  drawRoundedRect(ctx, boxX, boxY, qrOuterSize, qrOuterSize, 28);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#e4e4e7';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Clear ~17% central diameter (~3% total module area, well within H-level 30% recovery) for center seal
  const pocketHalf = Math.max(2, Math.floor(moduleCount * 0.085));
  const mid = Math.floor(moduleCount / 2);
  ctx.fillStyle = '#09090b';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (Math.abs(r - mid) <= pocketHalf && Math.abs(c - mid) <= pocketHalf) continue;
      if (qr.modules.get(r, c)) {
        ctx.fillRect(qrStartX + c * cell, qrStartY + r * cell, cell, cell);
      }
    }
  }

  // Align the center white halo strictly to the cleared module pocket so no QR square is half-sliced
  const haloSize = (pocketHalf * 2 + 1) * cell;
  const sealSize = Math.round(haloSize * 0.76);
  const pocketOriginX = qrStartX + (mid - pocketHalf) * cell;
  const pocketOriginY = qrStartY + (mid - pocketHalf) * cell;
  drawRoundedRect(ctx, pocketOriginX, pocketOriginY, haloSize, haloSize, Math.round(haloSize * 0.22));
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  drawVerifiedPayoutSeal(
    ctx,
    Math.round(pocketOriginX + (haloSize - sealSize) / 2),
    Math.round(pocketOriginY + (haloSize - sealSize) / 2),
    sealSize
  );

  // Freelancer name & verified short address
  ctx.textAlign = 'center';
  ctx.fillStyle = '#09090b';
  ctx.font = '700 34px Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(cleanName, W / 2, 796);

  ctx.fillStyle = '#52525b';
  ctx.font = '500 22px "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(shortStellarAddress(cleanAddr), W / 2, 840);

  // Dynamic milestone details or static personal QR note
  if (cleanAmount || cleanTitle) {
    const requestLabel = [
      cleanTitle ? (cleanTitle.length > 36 ? `${cleanTitle.slice(0, 35)}…` : cleanTitle) : '',
      cleanAmount ? `${Number(cleanAmount).toLocaleString(undefined, { maximumFractionDigits: 7 })} XLM` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    ctx.font = '600 23px Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const pillW = Math.min(W - 140, ctx.measureText(requestLabel).width + 56);
    drawRoundedRect(ctx, (W - pillW) / 2, 878, pillW, 56, 14);
    ctx.fillStyle = '#ecfeff';
    ctx.fill();
    ctx.strokeStyle = '#a5f3fc';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#0e7490';
    ctx.fillText(requestLabel, W / 2, 906);
  } else {
    ctx.fillStyle = '#52525b';
    ctx.font = '500 22px Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('Scan in GigPay to lock any milestone amount', W / 2, 904);
  }

  // Footer hairline and honest Stellar Testnet disclosure
  ctx.strokeStyle = '#e4e4e7';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(80, 982);
  ctx.lineTo(W - 80, 982);
  ctx.stroke();

  ctx.fillStyle = '#52525b';
  ctx.font = '500 20px Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('0% platform fee · Stellar Testnet (practice XLM)', W / 2, 1028);

  return canvas.toDataURL('image/png');
};

/** Stores a parsed invite payload in tab-local sessionStorage. */
export const rememberInvitePayload = ({ address, name = '', title = '', amount = '' }) => {
  try {
    const cleanAddr = String(address || '').trim();
    if (!cleanAddr || !isInvitable(cleanAddr)) return null;
    const record = {
      address: cleanAddr,
      name: sanitizeInviteText(name, MAX_NAME_LEN),
      title: sanitizeInviteText(title, MAX_TITLE_LEN),
      amount: sanitizeInviteAmount(amount),
      at: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    return record;
  } catch {
    return null;
  }
};

/** Reads ?pay= (plus optional name, title, amount) from the current URL and remembers it if valid. */
export const captureInviteFromUrl = (search = globalThis.location?.search || '') => {
  try {
    const params = new URLSearchParams(search);
    const pay = String(params.get('pay') || '').trim();
    if (!pay || !isInvitable(pay)) return null;
    const saved = rememberInvitePayload({
      address: pay,
      name: params.get('name') || '',
      title: params.get('title') || '',
      amount: params.get('amount') || '',
    });
    return saved ? saved.address : null;
  } catch {
    return null;
  }
};

/**
 * Returns the remembered invite payload ({ address, name, title, amount }) WITHOUT consuming it,
 * or null if none, expired, or invalid.
 */
export const peekInvitePayload = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const { address, at } = parsed || {};
    if (!address || Date.now() - at > MAX_AGE_MS || !isInvitable(address)) return null;
    return {
      address,
      name: sanitizeInviteText(parsed.name || '', MAX_NAME_LEN),
      title: sanitizeInviteText(parsed.title || '', MAX_TITLE_LEN),
      amount: sanitizeInviteAmount(parsed.amount || ''),
    };
  } catch {
    return null;
  }
};

/** True when this tab arrived from a valid, unexpired invite (QR or link) that hasn't been used yet. */
export const hasPendingInvite = () => Boolean(peekInvitePayload());

/** Returns the remembered invite address WITHOUT forgetting it, or null if none or expired. */
export const peekInvitePayout = () => peekInvitePayload()?.address || null;

/** Returns the remembered invite address once (then forgets it), or null if none or expired. */
export const takeInvitePayout = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const { address, at } = JSON.parse(raw);
    if (!address || Date.now() - at > MAX_AGE_MS || !isInvitable(address)) return null;
    return address;
  } catch {
    return null;
  }
};

/** Forgets any remembered invite address (called on sign-out; also removes copies older builds kept). */
export const clearInvitePayout = () => {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage blocked */ }
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage blocked */ }
};
