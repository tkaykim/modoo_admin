import type { CalibrationState } from './types';

const STORAGE_PREFIX = '__calib_test__/';
const STATE_KEY = `${STORAGE_PREFIX}state/v1`;

const log = (...args: unknown[]) => console.log('[CALIB-TEST]', ...args);
const warn = (...args: unknown[]) => console.warn('[CALIB-TEST]', ...args);

export function loadState(): CalibrationState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CalibrationState;
    if (parsed.schemaVersion !== 1) {
      warn('schema version mismatch, ignoring stored state', parsed.schemaVersion);
      return null;
    }
    return parsed;
  } catch (e) {
    warn('failed to load state from localStorage', e);
    return null;
  }
}

export function saveState(state: CalibrationState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (e) {
    warn('failed to save state to localStorage', e);
  }
}

export function clearState(): void {
  if (typeof window === 'undefined') return;
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  keys.forEach((k) => window.localStorage.removeItem(k));
  log('cleared keys', keys);
}

export { STORAGE_PREFIX };
