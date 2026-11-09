export const GOOGLE_SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwA95Fxsf-PoPK1f95qvVZ3fLnGoGLZg7hW7iNy0EWh2WqE1pR6qO_QaK38Az2G5FNTPg/exec';

/**
 * Detect event / campus source from:
 * 1. URL query parameters (e.g. ?source=bcc or ?event=bcc)
 * 2. Session persistence (if they arrived via BCC QR code and then clicked around)
 * 3. School email domain (@baliuag.edu.ph vs @umak.edu.ph)
 */
export const detectEventSource = (userEmail = '') => {
  if (typeof window === 'undefined') return 'Baliuag University CITE';
  try {
    const cleanEmail = String(userEmail || '').toLowerCase();
    if (cleanEmail.includes('umak.edu.ph')) {
      return 'BCC - UMak (Blockchain Campus Conference)';
    }
    if (cleanEmail.includes('baliuag') || cleanEmail.includes('cite')) {
      return 'Baliuag University CITE';
    }

    const params = new URLSearchParams(window.location.search);
    const src = (params.get('source') || params.get('event') || params.get('ref') || '').toLowerCase();
    if (src.includes('bcc') || src.includes('umak')) {
      try { sessionStorage.setItem('gigpay_event_source', 'bcc'); } catch {}
      return 'BCC - UMak (Blockchain Campus Conference)';
    }

    // Check if previously tagged in this session (e.g. arrived via QR code then navigated to /auth)
    const saved = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('gigpay_event_source') : null;
    if (saved === 'bcc') {
      return 'BCC - UMak (Blockchain Campus Conference)';
    }

    return 'Baliuag University CITE';
  } catch {
    return 'Baliuag University CITE';
  }
};

/**
 * Detect user device friendly string
 */
export const detectUserDevice = () => {
  if (typeof navigator === 'undefined') return 'Browser Device';
  const ua = navigator.userAgent || '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const browser = /Chrome/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : /Firefox/i.test(ua) ? 'Firefox' : 'Browser';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Macintosh|Mac OS X/i.test(ua) ? 'macOS' : 'PC';
  return `${os} ${browser} (${isMobile ? 'Mobile' : 'Desktop'})`;
};

/**
 * Asynchronously posts student registration and escrow activity to the Google Sheet.
 * Uses mode: 'no-cors' and text/plain to avoid CORS preflight while ensuring Apps Script parses e.postData.contents.
 * Non-blocking: failures never disrupt the user experience or throw errors.
 */
export async function recordStudentToGoogleSheet({
  studentName,
  studentId,
  programSection,
  deviceUsed,
  walletAddress,
  taskTitle,
  amount,
  releaseTxHash,
  feedbackSubmitted = false,
}) {
  if (!GOOGLE_SHEETS_WEBHOOK_URL) return;

  try {
    const detectedSource = detectEventSource(studentId || studentName);
    const payload = {
      student_name: studentName || 'Baliuag Student',
      student_id: studentId || 'CITE-Tester',
      program_section: programSection ? `${programSection} [${detectedSource}]` : detectedSource,
      device_used: deviceUsed || detectUserDevice(),
      wallet_address: walletAddress || 'N/A',
      task_title: taskTitle || 'Milestone Escrow Simulation',
      amount: String(amount || '2.0'),
      release_tx_hash: releaseTxHash || 'Pending Escrow Release',
      feedback_submitted: Boolean(feedbackSubmitted),
      event_source: detectedSource.includes('BCC') ? 'bcc' : 'baliuag',
      timestamp: new Date().toISOString(),
    };

    await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('[sheetsSync] Google Sheets recording notice (non-blocking):', err);
  }
}
