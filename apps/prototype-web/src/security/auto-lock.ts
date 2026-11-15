import { useEffect, useRef } from 'react';

export const IDLE_LOCK_MS = 5 * 60 * 1000;
export const BACKGROUND_LOCK_MS = 60 * 1000;
export function useAutoLock(enabled: boolean, onLock: () => void) {
  const callback = useRef(onLock); callback.current = onLock;
  useEffect(() => {
    if (!enabled) return;
    let idleDeadline = Date.now() + IDLE_LOCK_MS, hiddenDeadline = document.hidden ? Date.now() + BACKGROUND_LOCK_MS : Infinity;
    let timer: ReturnType<typeof setTimeout>, locked = false;
    const check = () => {
      if (locked) return;
      if (Date.now() >= Math.min(idleDeadline, hiddenDeadline)) { locked = true; clearTimeout(timer); callback.current(); return; }
      clearTimeout(timer); timer = setTimeout(check, Math.max(1, Math.min(idleDeadline, hiddenDeadline) - Date.now()));
    };
    const activity = () => { check(); if (!locked && !document.hidden) { idleDeadline = Date.now() + IDLE_LOCK_MS; check(); } };
    const visibility = () => { check(); if (!locked) { hiddenDeadline = document.hidden ? Date.now() + BACKGROUND_LOCK_MS : Infinity; check(); } };
    for (const event of ['pointerdown','keydown','wheel','touchstart']) window.addEventListener(event, activity, { passive: true });
    document.addEventListener('visibilitychange', visibility); check();
    return () => { clearTimeout(timer); for (const event of ['pointerdown','keydown','wheel','touchstart']) window.removeEventListener(event, activity); document.removeEventListener('visibilitychange', visibility); };
  }, [enabled]);
}
