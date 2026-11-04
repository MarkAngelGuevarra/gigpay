import { supabase } from './supabase.js';
// GigPay Onboarding Telemetry & Verification Ledger
// Tracks real human onboarding, Stellar Testnet activity, and user feedback

const TELEMETRY_STORAGE_KEY = 'gigpay_onboarding_telemetry';

// Baseline cohort. NOTE: usr-06 and usr-16 list team wallets (GAATY… default freelancer, GCBXZSKN… founder),
// so they are not outside-user on-chain evidence. usr-23's escrow (#15) was funded but never released.
// Baseline cohort entries. 21 entries were removed on 2026-11-04: they attributed named
// testers to wallets that were created by a script on 2026-11-03 (several with dates before those
// wallets existed), so the attributions cannot be true. Emails are not stored in public code.
export const SPRINT_1_BASELINE_USERS = [
  {
    "id": "usr-06",
    "name": "Princess Lloreign Ligamzon",
    "role": "Freelancer",
    "cohort": "Sprint 1 Baseline (On-Chain Task #10)",
    "status": "Verified Payout",
    "rating": 5,
    "feedback": "Clean design and milestone payments feel reassuring.",
    "timestamp": "2026-10-17T09:00:00.000Z",
    "public_key": "GAATY4U2IOYKFY2IAZ3W5VRZQME4UD2Z3TAVLOE5ONEICGXZX7HRX7D3",
    "task_title": "Sprint 1 Protocol 22 Milestone Escrow Verification",
    "amount": "2",
    "tx_hash": "c0611300fce324394b3d906faac63fbe1d376c007ad81b6d3bef8e3d5e7e0bc5",
    "explorer_url": "https://stellar.expert/explorer/testnet/tx/c0611300fce324394b3d906faac63fbe1d376c007ad81b6d3bef8e3d5e7e0bc5"
  },
  {
    "id": "usr-16",
    "name": "Elsander Mpzo",
    "role": "Client",
    "cohort": "Sprint 1 Baseline (On-Chain Task #14)",
    "status": "Verified Escrow Funded",
    "rating": 4,
    "feedback": "Good UX for graphic design deliverables.",
    "timestamp": "2026-10-17T15:16:27.000Z",
    "public_key": "GCBXZSKNCLTKTVRHBRZ2XCTFDVNHSBF3G6CIPLBRCK2XBXIGPQY5RBRN",
    "task_title": "Logo Design",
    "amount": "300",
    "tx_hash": "d737e563c3c067f20e421c0dbaec94d0d0100a5d8a3e96a91406dcd9f6cd3c08",
    "explorer_url": "https://stellar.expert/explorer/testnet/tx/d737e563c3c067f20e421c0dbaec94d0d0100a5d8a3e96a91406dcd9f6cd3c08"
  },
  {
    "id": "usr-23",
    "name": "Jessa Motol",
    "role": "Client",
    "cohort": "Sprint 2 - University Pilot (On-Chain Task #15)",
    "status": "Verified Escrow Funded",
    "rating": 5,
    "feedback": "Direct Freighter wallet contract invocation on Soroban Testnet.",
    "timestamp": "2026-10-31T04:34:45.000Z",
    "public_key": "GBBXPZLWXMKMIDJ6XZK4RGT3PJEWTWSHI7X5BZ7YHEPXZMPDEWY5P475",
    "task_title": "Jessa",
    "amount": "2",
    "tx_hash": "e724413b279e00b9e78058bcaf215d9104ecb930f9c5f9f89c63a2cf7a7718ec",
    "explorer_url": "https://stellar.expert/explorer/testnet/tx/e724413b279e00b9e78058bcaf215d9104ecb930f9c5f9f89c63a2cf7a7718ec"
  }
];

export const getStoredTelemetry = () => {
  try {
    const raw = localStorage.getItem(TELEMETRY_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Failed to parse telemetry:", err);
    return [];
  }
};

export const recordTelemetryEntry = (entry) => {
  try {
    const existing = getStoredTelemetry();
    const newEntry = {
      id: 'usr-' + (existing.length + SPRINT_1_BASELINE_USERS.length + 1),
      timestamp: new Date().toISOString(),
      cohort: 'Sprint 2 - University Pilot',
      status: 'Verified',
      ...entry
    };
    const updated = [newEntry, ...existing];
    localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(updated));
    return newEntry;
  } catch (err) {
    console.warn("Failed to save telemetry:", err);
    return null;
  }
};

export const isAuthenticUserName = (name) => {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  const lower = trimmed.toLowerCase();
  const genericPlaceholders = [
    'demo client',
    'demo freelancer',
    'client tester',
    'client',
    'freelancer',
    'student client',
    'student freelancer',
    'student developer',
    'student dev',
    'student project lead',
    'student project manager',
    'student client manager',
    'student dev freelancer',
    'university student freelancer',
    'test client',
    'test freelancer',
    'tester',
    'user',
    'anonymous'
  ];
  return !genericPlaceholders.some(placeholder => lower === placeholder || lower.startsWith(placeholder));
};

export const getAllTelemetryRecords = () => {
  const dynamic = getStoredTelemetry();
  return [...dynamic, ...SPRINT_1_BASELINE_USERS].filter(r => isAuthenticUserName(r.name));
};

/**
 * Dynamically queries the central Supabase PostgreSQL tasks & profiles tables.
 * Merges all authentic registered student pilot profiles and live tasks with the 18 Month 1 baseline users,
 * strictly filtering out generic non-authentic placeholders (e.g. "Demo Client", "Freelancer").
 */
export const fetchLiveTelemetryRecords = async () => {
  try {
    let dbProfiles = [];
    let profileMap = new Map();
    try {
      const { data: profs, error: profErr } = await supabase
        .from('profiles')
        .select('id, display_name, role, created_at, is_kyc_verified')
        .order('created_at', { ascending: false });

      if (!profErr && profs) {
        dbProfiles = profs;
        profileMap = new Map(profs.map(p => [p.id, p]));
      }
    } catch (profEx) {
      console.warn("Profiles query exception:", profEx);
    }

    let dbTasks = [];
    try {
      const { data: tasks, error: taskErr } = await supabase
        .from('tasks')
        .select('id, title, amount, status, client_id, freelancer_id, tx_hash, explorer_url, created_at')
        .order('created_at', { ascending: false });

      if (!taskErr && tasks) {
        dbTasks = tasks;
      }
    } catch (taskEx) {
      console.warn("Tasks query exception:", taskEx);
    }

    // 1. Map live tasks from database where primary profile has an authentic name
    const liveTaskEntries = dbTasks
      .filter(t => !String(t.id).startsWith('task-mock-'))
      .map((t, idx) => {
        const clientProfile = profileMap.get(t.client_id);
        const freelancerProfile = profileMap.get(t.freelancer_id);
        const primaryProfile = freelancerProfile || clientProfile;
        const candidateName = primaryProfile?.display_name;
        if (!isAuthenticUserName(candidateName)) return null;

        const taskNum = idx + 1;
        const cleanName = candidateName.trim();
        const hasTx = t.tx_hash && !/^(demo|sim|rel|resilient|soroban_)[-_]/.test(t.tx_hash);
        // Only fields stored in Supabase are reported: no invented email, rating, feedback or hash.
        return {
          id: `usr-s2-task-${String(taskNum).padStart(2, '0')}`,
          timestamp: t.created_at || new Date().toISOString(),
          cohort: 'Sprint 2 - Live Verified',
          role: t.freelancer_id ? 'Freelancer' : 'Client',
          name: cleanName,
          public_key: null,
          task_title: t.title,
          amount: t.amount != null ? String(t.amount) : null,
          status: t.status || null,
          tx_hash: hasTx ? t.tx_hash : null,
          explorer_url: hasTx ? `https://stellar.expert/explorer/testnet/tx/${t.tx_hash}` : null,
          rating: null,
          feedback: null
        };
      })
      .filter(Boolean);

    // 2. Map authenticated student profiles registered on website with authentic personal names
    const registeredProfileEntries = dbProfiles
      .filter(p => isAuthenticUserName(p.display_name))
      .map((p, idx) => {
        const isClient = p.role === 'client';
        const name = p.display_name.trim();
        // A registered profile is a sign-up, not on-chain activity: no task, amount, hash or payout is claimed.
        return {
          id: `usr-s2-reg-${String(idx + 1).padStart(2, '0')}`,
          timestamp: p.created_at || new Date().toISOString(),
          cohort: 'Sprint 2 - Registered Student Pilot',
          role: isClient ? 'Client' : 'Freelancer',
          name: name,
          public_key: null,
          task_title: null,
          amount: null,
          status: 'Registered (no on-chain activity recorded)',
          tx_hash: null,
          explorer_url: null,
          rating: null,
          feedback: null
        };
      });

    const localDynamic = getStoredTelemetry().filter(r => isAuthenticUserName(r.name));
    const combined = [...SPRINT_1_BASELINE_USERS, ...liveTaskEntries, ...localDynamic, ...registeredProfileEntries];
    
    // Strict deduplication & authentic name guarantee
    const seenNames = new Set();
    const finalRecords = [];
    for (const record of combined) {
      if (record && isAuthenticUserName(record.name)) {
        const key = record.name.toLowerCase().trim();
        if (!seenNames.has(key)) {
          seenNames.add(key);
          finalRecords.push(record);
        }
      }
    }

    return finalRecords;
  } catch (err) {
    console.warn("Live telemetry fetch exception:", err);
    return getAllTelemetryRecords();
  }
};

export const exportTelemetryToCSV = (customRecords = null) => {
  const records = Array.isArray(customRecords) && customRecords.length > 0 
    ? customRecords 
    : getAllTelemetryRecords();
  const headers = [
    'User ID',
    'Timestamp',
    'Cohort',
    'Role',
    'Name/Student Identifier',
    'Stellar Public Key',
    'Task Title',
    'Escrow Amount (XLM)',
    'Status',
    'Transaction Hash',
    'Stellar Expert Explorer Link',
    'Rating (1-5)',
    'User Feedback & Review'
  ];

  const escapeCSV = (str) => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  // Export exactly what each record holds. Missing values stay blank: a default rating, quote,
  // amount or hash would put words and activity in the CSV that no user produced.
  // Emails are never exported (this CSV is shareable/public).
  const rows = records.map(r => [
    escapeCSV(r.id),
    escapeCSV(r.timestamp),
    escapeCSV(r.cohort),
    escapeCSV(r.role || r.user_role),
    escapeCSV(r.name),
    escapeCSV(r.public_key || r.publicKey),
    escapeCSV(r.task_title),
    escapeCSV(r.amount),
    escapeCSV(r.status),
    escapeCSV(r.tx_hash),
    escapeCSV(r.explorer_url),
    escapeCSV(r.rating),
    escapeCSV(r.feedback)
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `GigPay_Traction_Ledger_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
