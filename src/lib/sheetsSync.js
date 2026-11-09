export const GOOGLE_SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwA95Fxsf-PoPK1f95qvVZ3fLnGoGLZg7hW7iNy0EWh2WqE1pR6qO_QaK38Az2G5FNTPg/exec';

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
    const payload = {
      student_name: studentName || 'Baliuag Student',
      student_id: studentId || 'CITE-Tester',
      program_section: programSection || 'CITE Department',
      device_used: deviceUsed || detectUserDevice(),
      wallet_address: walletAddress || 'N/A',
      task_title: taskTitle || 'Milestone Escrow Simulation',
      amount: String(amount || '2.0'),
      release_tx_hash: releaseTxHash || 'Pending Escrow Release',
      feedback_submitted: Boolean(feedbackSubmitted),
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
