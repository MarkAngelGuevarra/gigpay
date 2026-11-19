import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as StellarSdk from '@stellar/stellar-sdk';
import QRCode from 'qrcode';
import {
  buildInviteLink,
  parseQrPayload,
  captureInviteFromUrl,
  peekInvitePayload,
  peekInvitePayout,
  hasPendingInvite,
  clearInvitePayout,
  shortStellarAddress,
} from '../lib/invite';
import { decodeQrFromImageData } from '../lib/qrDecode';
import { DEMO_FREELANCER_KEY } from '../lib/stellar';
import PayQrModal from '../components/PayQrModal';
import QrScannerModal from '../components/QrScannerModal';

// Rasterize an Error-Correction-H QR with the exact center pocket used on branded cards into pure RGBA bytes
const rasterizePocketedQrToImageData = (text, cellPx = 8, marginCells = 4) => {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const mid = Math.floor(n / 2);
  const pocketHalf = Math.max(2, Math.floor(n * 0.085));
  const width = (n + marginCells * 2) * cellPx;
  const height = width;
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (Math.abs(r - mid) <= pocketHalf && Math.abs(c - mid) <= pocketHalf) continue;
      if (!qr.modules.get(r, c)) continue;
      const startY = (r + marginCells) * cellPx;
      const startX = (c + marginCells) * cellPx;
      for (let dy = 0; dy < cellPx; dy++) {
        for (let dx = 0; dx < cellPx; dx++) {
          const offset = ((startY + dy) * width + (startX + dx)) * 4;
          data[offset] = 9;
          data[offset + 1] = 9;
          data[offset + 2] = 11;
          data[offset + 3] = 255;
        }
      }
    }
  }

  return { data, width, height };
};

describe('Slice 3: QR Ph-Grade Engine (invite.js, qrDecode.js, PayQrModal, QrScannerModal)', () => {
  const validAddr = StellarSdk.Keypair.random().publicKey();

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps buildInviteLink backward-compatible while encoding dynamic milestone payloads cleanly', () => {
    expect(buildInviteLink(validAddr, 'https://www.gigpay.tech')).toBe(
      `https://www.gigpay.tech/client?pay=${validAddr}`
    );

    const dynamic = buildInviteLink(validAddr, {
      origin: 'https://www.gigpay.tech/',
      name: '  Maria   Santos \n',
      title: 'Brand Identity & UI Kit',
      amount: '250.5',
    });
    const parsed = new URL(dynamic);
    expect(parsed.pathname).toBe('/client');
    expect(parsed.searchParams.get('pay')).toBe(validAddr);
    expect(parsed.searchParams.get('name')).toBe('Maria Santos');
    expect(parsed.searchParams.get('title')).toBe('Brand Identity & UI Kit');
    expect(parsed.searchParams.get('amount')).toBe('250.5');

    // Invalid amounts are omitted instead of producing broken links
    const badAmount = buildInviteLink(validAddr, {
      origin: 'https://www.gigpay.tech',
      amount: '-50',
    });
    expect(badAmount).toBe(`https://www.gigpay.tech/client?pay=${validAddr}`);
  });

  it('parses GigPay static/dynamic links, SEP-0007 URIs, and raw Stellar addresses while rejecting demo/unsafe inputs', () => {
    const dynUrl = buildInviteLink(validAddr, {
      origin: 'https://www.gigpay.tech',
      name: 'Maria Santos',
      title: 'Landing Page',
      amount: '300',
    });
    expect(parseQrPayload(dynUrl)).toEqual({
      ok: true,
      payload: {
        address: validAddr,
        name: 'Maria Santos',
        title: 'Landing Page',
        amount: '300',
      },
    });

    expect(parseQrPayload(validAddr)).toEqual({
      ok: true,
      payload: { address: validAddr, name: '', title: '', amount: '' },
    });

    expect(parseQrPayload(`web+stellar:pay?destination=${validAddr}&amount=45.25&memo=Sprint+1`)).toEqual({
      ok: true,
      payload: { address: validAddr, name: '', title: 'Sprint 1', amount: '45.25' },
    });

    expect(parseQrPayload(DEMO_FREELANCER_KEY).ok).toBe(false);
    expect(parseQrPayload(`https://www.gigpay.tech/client?pay=${DEMO_FREELANCER_KEY}`).ok).toBe(false);
    expect(parseQrPayload('javascript:alert(1)').ok).toBe(false);
    expect(parseQrPayload('https://example.com/no-pay-param').ok).toBe(false);
    expect(parseQrPayload('').ok).toBe(false);
  });

  it('captures full dynamic invite payload in sessionStorage only and preserves peekInvitePayout', () => {
    const search = `?pay=${validAddr}&name=Maria+Santos&title=Logo+Refresh&amount=120`;
    expect(captureInviteFromUrl(search)).toBe(validAddr);
    expect(localStorage.getItem('gigpay_invite_payout')).toBeNull();
    expect(hasPendingInvite()).toBe(true);
    expect(peekInvitePayout()).toBe(validAddr);
    expect(peekInvitePayload()).toEqual({
      address: validAddr,
      name: 'Maria Santos',
      title: 'Logo Refresh',
      amount: '120',
    });

    clearInvitePayout();
    expect(hasPendingInvite()).toBe(false);
    expect(peekInvitePayload()).toBeNull();
  });

  it('round-trips a center-pocketed Error-Correction-H dynamic GigPay QR through jsQR cleanly', () => {
    const dynamicLink = buildInviteLink(validAddr, {
      origin: 'https://www.gigpay.tech',
      name: 'Maria Santos',
      title: 'Landing Page',
      amount: '250',
    });
    const imgData = rasterizePocketedQrToImageData(dynamicLink);
    const decoded = decodeQrFromImageData(imgData);
    expect(decoded).toBe(dynamicLink);

    const parsed = parseQrPayload(decoded);
    expect(parsed).toEqual({
      ok: true,
      payload: {
        address: validAddr,
        name: 'Maria Santos',
        title: 'Landing Page',
        amount: '250',
      },
    });
  });

  it('PayQrModal toggles between Personal QR and Milestone Request, validates amount, and expands full address', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      configurable: true,
    });

    const onClose = vi.fn();
    const onToast = vi.fn();

    render(
      <PayQrModal
        isOpen
        onClose={onClose}
        payoutAddress={validAddr}
        displayName="Maria Santos"
        onToast={onToast}
      />
    );

    expect(screen.getByRole('dialog', { name: /My Pay QR/i })).toBeInTheDocument();
    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText(shortStellarAddress(validAddr))).toBeInTheDocument();
    expect(screen.getByText('PAY QR')).toBeInTheDocument();

    // Switch to Dynamic Milestone Request
    fireEvent.click(screen.getByRole('tab', { name: /Milestone Request/i }));
    fireEvent.change(screen.getByLabelText(/Milestone title/i), { target: { value: 'UI Kit Refresh' } });
    fireEvent.change(screen.getByLabelText(/Amount \(XLM\)/i), { target: { value: '180' } });

    expect(screen.getByText('MILESTONE QR')).toBeInTheDocument();
    expect(screen.getByText('UI Kit Refresh')).toBeInTheDocument();
    expect(screen.getByText('180 XLM')).toBeInTheDocument();

    // Share link falls back to clipboard copy with dynamic params
    fireEvent.click(screen.getByRole('button', { name: /Share link/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain(`pay=${validAddr}`);
    expect(writeText.mock.calls[0][0]).toContain('title=UI+Kit+Refresh');
    expect(writeText.mock.calls[0][0]).toContain('amount=180');

    // Expand full 56-character address disclosure
    expect(screen.queryByText(validAddr)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show full 56-character address/i }));
    expect(screen.getByText(validAddr)).toBeInTheDocument();

    // Escape closes cleanly
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('QrScannerModal handles unavailable camera gracefully and confirms pasted dynamic milestone link', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(<QrScannerModal isOpen onClose={onClose} onConfirm={onConfirm} />);

    // jsdom has no mediaDevices: gracefully falls back with gallery upload prompt
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Upload QR from gallery/i }).length).toBeGreaterThan(0);
    });

    // Switch to Paste link tab and reject invalid URL
    fireEvent.click(screen.getByRole('tab', { name: /Paste link/i }));
    const input = screen.getByLabelText(/GigPay invite link or Stellar wallet address/i);
    fireEvent.change(input, { target: { value: 'https://example.com/not-gigpay' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify recipient/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/No valid GigPay payout address/i);

    // Paste valid dynamic milestone URL and confirm recipient card
    const dynUrl = buildInviteLink(validAddr, {
      origin: 'https://www.gigpay.tech',
      name: 'Maria Santos',
      title: 'Figma Prototype',
      amount: '250',
    });
    fireEvent.change(input, { target: { value: dynUrl } });
    fireEvent.click(screen.getByRole('button', { name: /Verify recipient/i }));

    expect(screen.getByText('Confirm recipient')).toBeInTheDocument();
    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText(shortStellarAddress(validAddr))).toBeInTheDocument();
    expect(screen.getByText('Figma Prototype')).toBeInTheDocument();
    expect(screen.getByText('250 XLM')).toBeInTheDocument();

    // Full address hidden by default behind verification disclosure
    expect(screen.queryByText(validAddr)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Verify full 56-character address/i }));
    expect(screen.getByText(validAddr)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Continue to lock funds/i }));
    expect(onConfirm).toHaveBeenCalledWith({
      address: validAddr,
      name: 'Maria Santos',
      title: 'Figma Prototype',
      amount: '250',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
