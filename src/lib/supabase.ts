import { createClient } from '@supabase/supabase-js';

// Accept the URL with or without a trailing "/rest/v1/" (Supabase shows both forms).
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/(rest\/v1\/?)?$/, '');
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

const REMEMBER_KEY = 'tt.remember-device';

/**
 * "Keep me signed in on this device": checked → the session lives in localStorage and survives
 * closing the browser; unchecked → sessionStorage, so closing the browser signs you out.
 * Either way it is per device: signing in here never signs anyone in anywhere else.
 */
export function setRememberDevice(remember: boolean) {
  try {
    if (remember) localStorage.setItem(REMEMBER_KEY, '1');
    else localStorage.removeItem(REMEMBER_KEY);
  } catch { /* storage blocked: falls back to sessionStorage */ }
}

function sessionStore(): Storage {
  try {
    return localStorage.getItem(REMEMBER_KEY) ? localStorage : sessionStorage;
  } catch {
    return sessionStorage;
  }
}

const authStorage = {
  getItem: (key: string) => sessionStore().getItem(key),
  setItem: (key: string, value: string) => sessionStore().setItem(key, value),
  removeItem: (key: string) => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  },
};

/**
 * "invite" or "recovery" when the page was opened from an invite / reset-password email link.
 * Read before the client is created, because the client clears the link details from the URL.
 */
export const initialAuthLinkType: string | null = (() => {
  try {
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    return params.get('type');
  } catch {
    return null;
  }
})();

/** Null when no Supabase project is configured: the app then runs in "this device only" mode. */
export const supabase =
  url && anonKey
    ? createClient(url, anonKey, { auth: { storage: authStorage, persistSession: true, autoRefreshToken: true } })
    : null;

/** GitHub sign-in is optional; set VITE_ENABLE_GITHUB_LOGIN=true once it's set up in Supabase. */
export const githubLoginEnabled = import.meta.env.VITE_ENABLE_GITHUB_LOGIN === 'true';
