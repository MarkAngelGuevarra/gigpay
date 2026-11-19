/**
 * Pure-JS QR decoding for live camera frames and gallery image uploads (jsQR).
 * Runs entirely in-browser with zero external requests or WASM/CSP relaxations.
 */
import jsQR from 'jsqr';
import { parseQrPayload } from './invite.js';

export const decodeQrFromImageData = (imageData) => {
  if (!imageData || !imageData.data || !imageData.width || !imageData.height) {
    return null;
  }
  const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth',
  });
  return decoded?.data ? String(decoded.data).trim() : null;
};

const drawAndScanSource = (source, srcW, srcH, maxDim) => {
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  return decodeQrFromImageData(imageData);
};

const loadImageElement = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ source: img, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read that image file.'));
    };
    img.src = objectUrl;
  });

/**
 * Decodes a GigPay QR code or Stellar address from a user-selected gallery screenshot/photo.
 * Attempts fast 1200px scaling first, then retries up to 2048px for small QRs inside tall phone screenshots.
 */
export const decodeQrFromImageFile = async (file) => {
  if (!file) {
    return { ok: false, error: 'Select a QR image from your device.' };
  }

  let loaded = null;
  let bitmap = null;

  try {
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file);
        loaded = { source: bitmap, width: bitmap.width, height: bitmap.height };
      } catch {
        loaded = await loadImageElement(file);
      }
    } else {
      loaded = await loadImageElement(file);
    }

    let raw = drawAndScanSource(loaded.source, loaded.width, loaded.height, 1200);
    if (!raw && Math.max(loaded.width, loaded.height) > 1200) {
      raw = drawAndScanSource(loaded.source, loaded.width, loaded.height, 2048);
    }

    if (!raw) {
      return {
        ok: false,
        error: 'No QR code found in this image. Try cropping closer to the QR card or paste the invite link.',
      };
    }

    const parsed = parseQrPayload(raw);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    return { ok: true, payload: parsed.payload, raw };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'Could not read that image. Try another screenshot or paste the invite link.',
    };
  } finally {
    if (bitmap && typeof bitmap.close === 'function') {
      try { bitmap.close(); } catch { /* ignore */ }
    }
  }
};
