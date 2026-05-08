import { useEffect, useState, useCallback, useRef } from 'react';

const STORAGE_KEY = 'rb_last_activity';
const TIMEOUT_MS = 30 * 60 * 1000;       // 30 min idle → expired
const ACTIVITY_THROTTLE_MS = 5 * 1000;   // write at most once / 5s
const CHECK_INTERVAL_MS = 60 * 1000;     // re-check expiry every minute

function readLast() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) ? n : Date.now();
  } catch {
    return Date.now();
  }
}

function writeLast(ts) {
  try { localStorage.setItem(STORAGE_KEY, String(ts)); } catch {}
}

export function resetInactivity() {
  writeLast(Date.now());
}

export default function useInactivityTimeout({ active = true } = {}) {
  const [expired, setExpired] = useState(false);
  const lastWriteRef = useRef(0);

  const dismissExpired = useCallback(() => {
    setExpired(false);
    writeLast(Date.now());
  }, []);

  useEffect(() => {
    if (!active) return;

    // Seed activity timestamp on mount so a fresh tab doesn't fire
    // immediately when the storage key is missing.
    if (!localStorage.getItem(STORAGE_KEY)) writeLast(Date.now());

    const onActivity = () => {
      const now = Date.now();
      if (now - lastWriteRef.current < ACTIVITY_THROTTLE_MS) return;
      lastWriteRef.current = now;
      writeLast(now);
    };

    const events = ['mousemove', 'click', 'keypress', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));

    const tick = () => {
      const last = readLast();
      if (Date.now() - last > TIMEOUT_MS) setExpired(true);
    };
    tick();
    const id = setInterval(tick, CHECK_INTERVAL_MS);

    return () => {
      events.forEach(e => window.removeEventListener(e, onActivity));
      clearInterval(id);
    };
  }, [active]);

  return { expired, dismissExpired };
}
