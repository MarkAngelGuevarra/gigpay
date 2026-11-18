import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

const INTRA_TAB_SYNC_EVENT = 'gigpay_pilot_feedback_sync';

export const PILOT_FEEDBACK_STORAGE_KEY = 'gigpay_pilot_feedback_v1';
export const PILOT_FORM_URL = 'https://forms.gle/oLGjJRcxg5LZ5bC96';

export const FEEDBACK_STATES = {
  UNSEEN: 'UNSEEN',
  BANNER_VIEWED: 'BANNER_VIEWED',
  SNOOZED: 'SNOOZED',
  OPENED_FORM: 'OPENED_FORM',
  COMPLETED: 'COMPLETED'
};

export const DEFAULT_STATE = {
  schema_version: 1,
  status: FEEDBACK_STATES.UNSEEN,
  first_seen_at: null,
  last_prompted_at: null,
  snooze_until: null,
  completed_at: null,
  last_opened_at: null,
  times_viewed: 0,
  times_dismissed: 0,
  times_form_opened: 0,
  touchpoints: {
    navbar_clicked: false,
    dashboard_banner_viewed: false,
    client_card_viewed: false,
    freelancer_card_viewed: false,
    banner_viewed: false
  },
  identity_binding: {
    associated_user_ids: [],
    last_user_id: null,
    last_wallet: null
  }
};

/**
 * Resilient storage layer with transparent in-memory fallback.
 * Prevents unhandled QuotaExceededError or SecurityError in private browsing modes.
 */
export class SafeStorage {
  constructor() {
    this.memoryStore = new Map();
    this.isLocalStorageAvailable = this._checkAvailability();
  }

  _checkAvailability() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }
      const testKey = '__gigpay_storage_probe__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  getItem(key) {
    if (this.isLocalStorageAvailable) {
      try {
        const item = window.localStorage.getItem(key);
        if (item !== null) return item;
      } catch (err) {
        console.warn(`[SafeStorage] LocalStorage read failed for ${key}, falling back to memory:`, err);
      }
    }
    return this.memoryStore.has(key) ? this.memoryStore.get(key) : null;
  }

  setItem(key, value) {
    const stringVal = String(value);
    if (this.isLocalStorageAvailable) {
      try {
        window.localStorage.setItem(key, stringVal);
        return;
      } catch (err) {
        console.warn(`[SafeStorage] LocalStorage write failed for ${key}, falling back to memory:`, err);
      }
    }
    this.memoryStore.set(key, stringVal);
  }

  removeItem(key) {
    if (this.isLocalStorageAvailable) {
      try {
        window.localStorage.removeItem(key);
      } catch (err) {
        console.warn(`[SafeStorage] LocalStorage remove failed for ${key}:`, err);
      }
    }
    this.memoryStore.delete(key);
  }

  clear() {
    if (this.isLocalStorageAvailable) {
      try {
        window.localStorage.clear();
      } catch (err) {
        console.warn('[SafeStorage] LocalStorage clear failed:', err);
      }
    }
    this.memoryStore.clear();
  }
}

// Global default SafeStorage instance
export const safeStorage = new SafeStorage();

/**
 * Validates whether the given snooze timestamp is active.
 * Handles both ISO 8601 strings and numeric timestamps.
 */
export function isSnoozeActive(status, snoozeUntil, now = Date.now()) {
  if (status !== FEEDBACK_STATES.SNOOZED || !snoozeUntil) {
    return false;
  }
  const expiryTime = new Date(snoozeUntil).getTime();
  if (isNaN(expiryTime)) {
    return false;
  }
  return now < expiryTime;
}

/**
 * Calculates snooze expiration timestamp exactly `hours` ahead.
 */
export function calculateSnoozeExpiration(hours = 24, fromTime = Date.now()) {
  return new Date(fromTime + hours * 3600 * 1000).toISOString();
}

/**
 * Safely parses feedback state JSON, returning DEFAULT_STATE on corruption or empty.
 */
export function parseFeedbackState(rawJson) {
  if (!rawJson) return { ...DEFAULT_STATE };
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_STATE };
    }
    return {
      ...DEFAULT_STATE,
      ...parsed,
      touchpoints: {
        ...DEFAULT_STATE.touchpoints,
        ...(parsed.touchpoints || {})
      },
      identity_binding: {
        ...DEFAULT_STATE.identity_binding,
        ...(parsed.identity_binding || {})
      }
    };
  } catch (err) {
    console.warn('[PilotFeedback] Malformed JSON recovered to default state:', err);
    return { ...DEFAULT_STATE };
  }
}

/**
 * Pure state transition functions for unit testing and deterministic evaluation.
 */
export function transitionBannerViewed(prevState, touchpoint = 'banner_viewed', now = new Date()) {
  if (prevState.status === FEEDBACK_STATES.COMPLETED) {
    return prevState;
  }
  return {
    ...prevState,
    status: prevState.status === FEEDBACK_STATES.UNSEEN ? FEEDBACK_STATES.BANNER_VIEWED : prevState.status,
    first_seen_at: prevState.first_seen_at || now.toISOString(),
    last_prompted_at: now.toISOString(),
    times_viewed: (prevState.times_viewed || 0) + 1,
    touchpoints: {
      ...prevState.touchpoints,
      [touchpoint]: true
    }
  };
}

export function transitionSnoozed(prevState, hours = 24, now = Date.now()) {
  if (prevState.status === FEEDBACK_STATES.COMPLETED) {
    return prevState;
  }
  return {
    ...prevState,
    status: FEEDBACK_STATES.SNOOZED,
    snooze_until: calculateSnoozeExpiration(hours, now),
    times_dismissed: (prevState.times_dismissed || 0) + 1
  };
}

export function transitionOpenedForm(prevState, touchpoint = 'navbar_clicked', now = new Date()) {
  return {
    ...prevState,
    status: prevState.status === FEEDBACK_STATES.COMPLETED ? FEEDBACK_STATES.COMPLETED : FEEDBACK_STATES.OPENED_FORM,
    last_opened_at: now.toISOString(),
    times_form_opened: (prevState.times_form_opened || 0) + 1,
    touchpoints: {
      ...prevState.touchpoints,
      [touchpoint]: true
    }
  };
}

export function transitionCompleted(prevState, now = new Date()) {
  return {
    ...prevState,
    status: FEEDBACK_STATES.COMPLETED,
    completed_at: now.toISOString(),
    snooze_until: null
  };
}

export function reconcilePersonaBinding(prevState, userId, walletKey) {
  if (!userId) return prevState;
  const existingIds = prevState.identity_binding?.associated_user_ids || [];
  if (existingIds.includes(userId)) {
    return prevState;
  }
  return {
    ...prevState,
    identity_binding: {
      ...prevState.identity_binding,
      last_user_id: userId,
      last_wallet: typeof walletKey === 'string' ? walletKey : (walletKey?.address || null),
      associated_user_ids: [...existingIds, userId]
    }
  };
}

/**
 * React Hook: usePilotFeedbackState
 * Provides reactive bindings, multi-tab sync, 24h snooze, and persistent completion suppression.
 */
export function usePilotFeedbackState(storage = safeStorage, authOverride = null) {
  let userId = authOverride?.user?.id;
  let walletKey = authOverride?.publicKey;

  if (!userId && typeof window !== 'undefined') {
    try {
      const rawUser = storage.getItem('gigpay_demo_user');
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        userId = parsed?.id;
      }
      walletKey = walletKey || storage.getItem('gigpay_wallet_public_key');
    } catch {
      // fallback
    }
  }

  const [state, setState] = useState(() => {
    const raw = storage.getItem(PILOT_FEEDBACK_STORAGE_KEY);
    return parseFeedbackState(raw);
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  // Cross-tab (storage event) and intra-tab (CustomEvent) synchronization
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorageChange = (e) => {
      if (e.key === PILOT_FEEDBACK_STORAGE_KEY || e.key === null) {
        const synced = parseFeedbackState(e.newValue);
        stateRef.current = synced;
        setState(synced);
      }
    };
    const handleIntraTabSync = (e) => {
      if (e.detail?.storage === storage && e.detail?.state) {
        stateRef.current = e.detail.state;
        setState(e.detail.state);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(INTRA_TAB_SYNC_EVENT, handleIntraTabSync);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(INTRA_TAB_SYNC_EVENT, handleIntraTabSync);
    };
  }, [storage]);

  const getLatestState = useCallback(() => {
    const raw = storage.getItem(PILOT_FEEDBACK_STORAGE_KEY);
    return raw ? parseFeedbackState(raw) : stateRef.current;
  }, [storage]);

  // Save changes to storage and broadcast intra-tab without triggering side effects in state updaters
  const persistState = useCallback((nextState) => {
    stateRef.current = nextState;
    setState(nextState);
    storage.setItem(PILOT_FEEDBACK_STORAGE_KEY, JSON.stringify(nextState));
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(INTRA_TAB_SYNC_EVENT, { detail: { storage, state: nextState } }));
    }
  }, [storage]);

  // Reconcile user identity when authenticated persona changes
  useEffect(() => {
    if (!userId) return;
    const latest = getLatestState();
    const updated = reconcilePersonaBinding(latest, userId, walletKey);
    if (updated !== latest) {
      persistState(updated);
    }
  }, [userId, walletKey, getLatestState, persistState]);

  // Derived state calculations
  const isCompleted = state.status === FEEDBACK_STATES.COMPLETED;
  
  const isSnoozed = useMemo(() => {
    return isSnoozeActive(state.status, state.snooze_until);
  }, [state.status, state.snooze_until]);

  const isFormOpened = state.status === FEEDBACK_STATES.OPENED_FORM;
  const shouldShowBanner = !isCompleted && !isSnoozed;
  const shouldShowSubtlePill = !isCompleted && isSnoozed;

  // Actions read latest persisted state to avoid overwriting newer cross-tab or sibling hook updates.
  const markBannerViewed = useCallback((touchpoint = 'banner_viewed') => {
    persistState(transitionBannerViewed(getLatestState(), touchpoint));
  }, [persistState, getLatestState]);

  const snoozePrompt = useCallback((hours = 24) => {
    persistState(transitionSnoozed(getLatestState(), hours));
  }, [persistState, getLatestState]);

  const openFormLink = useCallback((touchpoint = 'navbar_clicked', options = {}) => {
    persistState(transitionOpenedForm(getLatestState(), touchpoint));
    // Anchor elements (<a target="_blank">) already navigate natively; only open programmatically when requested.
    if (options?.openTab && typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(PILOT_FORM_URL, '_blank', 'noopener,noreferrer');
    }
  }, [persistState, getLatestState]);

  const markCompleted = useCallback(() => {
    persistState(transitionCompleted(getLatestState()));
  }, [persistState, getLatestState]);

  const resetFeedbackState = useCallback(() => {
    persistState({ ...DEFAULT_STATE });
  }, [persistState]);

  return {
    state,
    isCompleted,
    isSnoozed,
    isFormOpened,
    shouldShowBanner,
    shouldShowSubtlePill,
    markBannerViewed,
    snoozePrompt,
    openFormLink,
    markCompleted,
    resetFeedbackState,
    formUrl: PILOT_FORM_URL
  };
}
