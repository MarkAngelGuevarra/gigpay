/**
 * Freelancer invite links: https://www.gigpay.tech/client?pay=G...
 *
 * Copying a 56-character Stellar address through chat is error-prone, and one wrong character sends the
 * escrow to the wrong account. The freelancer shares a link instead; the client's task form is pre-filled
 * with the address. The address is held in localStorage (24h) so it survives the sign-up / email
 * confirmation detour before the client reaches /client.
 */
import { isValidStellarAddress, isDemoWallet } from './stellar.js';

const STORAGE_KEY = 'gigpay_invite_payout';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// A real G-address only: the demo keys would pay GigPay's own test wallet.
const isInvitable = (a) => isValidStellarAddress(a) && !isDemoWallet(a);

export const buildInviteLink = (payoutAddress, origin = globalThis.location?.origin || 'https://www.gigpay.tech') =>
  `${origin}/client?pay=${encodeURIComponent(payoutAddress)}`;

/** Reads ?pay= from the current URL and remembers it if it is a valid Stellar address. */
export const captureInviteFromUrl = (search = globalThis.location?.search || '') => {
  try {
    const pay = new URLSearchParams(search).get('pay');
    if (!pay || !isInvitable(pay.trim())) return null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ address: pay.trim(), at: Date.now() }));
    return pay.trim();
  } catch {
    return null;
  }
};

/** Returns the remembered invite address once (then forgets it), or null if none or expired. */
export const takeInvitePayout = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    localStorage.removeItem(STORAGE_KEY);
    const { address, at } = JSON.parse(raw);
    if (!address || Date.now() - at > MAX_AGE_MS || !isInvitable(address)) return null;
    return address;
  } catch {
    return null;
  }
};
