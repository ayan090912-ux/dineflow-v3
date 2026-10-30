import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  UserCredential,
} from 'firebase/auth';

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' && process.env ? process.env : {}) as any;

/**
 * Resolves the appropriate Firebase Authentication domain.
 * When running in production (dinely.food or *.dinely.food), uses 'dinely.food'
 * to leverage the same-domain reverse proxy at /__/auth/ (preventing iOS Safari
 * Intelligent Tracking Prevention and cross-origin Storage Partitioning failures).
 * In local development, falls back to VITE_FIREBASE_AUTH_DOMAIN or dinely-cd6cd.firebaseapp.com.
 */
export function resolveAuthDomain(): string {
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname === 'dinely.food' || hostname.endsWith('.dinely.food')) {
      return 'dinely.food';
    }
  }
  return env.VITE_FIREBASE_AUTH_DOMAIN || 'dinely-cd6cd.firebaseapp.com';
}

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyAp2Mt6i7JfWHdQyxogoMtlDh1RQrtJtUg',
  authDomain: resolveAuthDomain(),
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'dinely-cd6cd',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'dinely-cd6cd.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '99267644103',
  appId: env.VITE_FIREBASE_APP_ID || '1:99267644103:web:c7f93f68625d3c0da04ce2',
};

// Initialize Firebase App singleton safely
export const firebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const firebaseAuth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

// Custom parameters for Google auth prompt
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export interface GoogleAuthResult {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  idToken?: string;
}

/**
 * Detects whether the current environment is a mobile or tablet browser (iOS Safari, Android Chrome, etc.)
 * where third-party storage partitioning (ITP) and popup restrictions are actively enforced.
 */
export function isMobileOrTabletBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isTouch = Boolean(navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && isTouch);
  const isAndroid = /Android/i.test(ua);
  const isMobileUA = /Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  return isIOS || isAndroid || isMobileUA || (isTouch && window.innerWidth <= 1024);
}

/**
 * Extracts and normalizes Google authentication payload from a Firebase UserCredential.
 */
async function extractGoogleAuthResult(credential: UserCredential, forceRefreshIdToken: boolean = false): Promise<GoogleAuthResult> {
  const user = credential.user;
  if (!user.email) {
    throw new Error('No email address associated with this Google account.');
  }

  const idToken = await user.getIdToken(forceRefreshIdToken);

  return {
    uid: user.uid,
    email: user.email.toLowerCase(),
    displayName: user.displayName || user.email.split('@')[0],
    photoURL: user.photoURL || undefined,
    idToken,
  };
}

/**
 * Standardized mapping for Firebase Auth error codes to helpful user messages.
 */
function mapAndThrowAuthError(error: any): never {
  console.error('Firebase Google Auth Error:', error);

  if (error.code === 'auth/popup-closed-by-user') {
    const cancelErr = new Error('Google sign-in popup was closed before completing authentication.');
    (cancelErr as any).code = 'auth/popup-closed-by-user';
    (cancelErr as any).isCancelled = true;
    throw cancelErr;
  } else if (error.code === 'auth/popup-blocked') {
    const blockErr = new Error('Google sign-in popup was blocked by your browser. Please allow popups for this domain.');
    (blockErr as any).code = 'auth/popup-blocked';
    throw blockErr;
  } else if (error.code === 'auth/cancelled-popup-request') {
    const cancelErr = new Error('Sign-in process cancelled.');
    (cancelErr as any).code = 'auth/cancelled-popup-request';
    (cancelErr as any).isCancelled = true;
    throw cancelErr;
  } else if (error.code === 'auth/network-request-failed' || error.message?.toLowerCase().includes('network') || error.message?.toLowerCase().includes('failed to fetch')) {
    const netErr = new Error('Network failure: Unable to reach Google authentication service. Please check your internet connection.');
    (netErr as any).code = 'auth/network-request-failed';
    (netErr as any).isNetworkError = true;
    throw netErr;
  } else if (error.code === 'auth/account-exists-with-different-credential') {
    const accErr = new Error('An account already exists with the same email address using a different login method.');
    (accErr as any).code = error.code;
    throw accErr;
  } else if (error.code === 'auth/unauthorized-domain' || error.message?.includes('unauthorized-domain')) {
    const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
    const domErr = new Error(`Firebase Auth Domain Error: '${currentHost}' is not authorized in Firebase Console. Please add '${currentHost}' under Firebase Console -> Authentication -> Settings -> Authorized Domains.`);
    (domErr as any).code = 'auth/unauthorized-domain';
    throw domErr;
  } else if (error.code === 'auth/api-key-not-valid' || error.message?.includes('api-key-not-valid')) {
    const keyErr = new Error('Firebase API key is missing or invalid in frontend/.env (VITE_FIREBASE_API_KEY). Please set a valid Firebase Web API key from Firebase Console.');
    (keyErr as any).code = 'auth/api-key-not-valid';
    throw keyErr;
  }

  const rawMsg = (error.message || '').toLowerCase();
  if (
    rawMsg.includes('database is closing') ||
    rawMsg.includes('database is closing/hidden') ||
    rawMsg.includes('connection is closing')
  ) {
    const storageErr = new Error('Browser authentication storage was briefly interrupted. Please click Continue with Google again.');
    (storageErr as any).code = 'auth/storage-interrupted';
    (storageErr as any).isTransient = true;
    throw storageErr;
  }

  const genErr = new Error(error.message || 'Google Authentication failed. Please try again.');
  (genErr as any).code = error.code || 'auth/unknown';
  throw genErr;
}

/**
 * Safely executes signInWithPopup with automatic retry if browser IndexedDB visibility race occurs.
 */
async function safeSignInWithPopup(auth: any, provider: any, maxRetries = 2): Promise<UserCredential> {
  let attempt = 0;
  while (true) {
    try {
      return await signInWithPopup(auth, provider);
    } catch (error: any) {
      const msg = (error?.message || '').toLowerCase();
      const isDbClosing =
        msg.includes('database is closing') ||
        msg.includes('database is closing/hidden') ||
        msg.includes('connection is closing') ||
        error.code === 'auth/internal-error';
      if (isDbClosing && attempt < maxRetries) {
        attempt++;
        console.warn(`[Firebase] Caught transient IndexedDB visibility closure (${attempt}/${maxRetries}). Retrying popup auth...`);
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Triggers Google Authentication with mobile redirect or desktop popup flow.
 * - Mobile / tablet devices (especially iOS Safari with ITP): Uses signInWithRedirect.
 * - Desktop browsers: Uses signInWithPopup, falling back to signInWithRedirect if popup is blocked or interrupted.
 * When redirect is used, this method returns null as the browser redirects away.
 * Results upon return from redirect must be collected via handleGoogleRedirectResult().
 */
export async function signInWithGoogle(options?: {
  forceRedirect?: boolean;
  forceRefreshIdToken?: boolean;
}): Promise<GoogleAuthResult | null> {
  const shouldUseRedirect = options?.forceRedirect || isMobileOrTabletBrowser();

  if (shouldUseRedirect) {
    try {
      if (typeof window?.sessionStorage?.setItem === 'function') {
        window.sessionStorage.setItem('dinely_auth_redirect_in_progress', '1');
      }
      await signInWithRedirect(firebaseAuth, googleProvider);
      return null;
    } catch (error: any) {
      if (typeof window?.sessionStorage?.removeItem === 'function') {
        window.sessionStorage.removeItem('dinely_auth_redirect_in_progress');
      }
      mapAndThrowAuthError(error);
    }
  }

  // Desktop popup flow with automatic popup-blocked & storage-interrupted fallback to redirect
  try {
    const result = await safeSignInWithPopup(firebaseAuth, googleProvider);
    return await extractGoogleAuthResult(result, options?.forceRefreshIdToken);
  } catch (error: any) {
    const msg = (error?.message || '').toLowerCase();
    const isDbClosing =
      msg.includes('database is closing') ||
      msg.includes('database is closing/hidden') ||
      msg.includes('connection is closing') ||
      error.code === 'auth/storage-interrupted';

    if (error.code === 'auth/popup-blocked' || isDbClosing) {
      console.warn('Popup blocked or browser storage interrupted. Seamlessly falling back to redirect flow...');
      try {
        if (typeof window?.sessionStorage?.setItem === 'function') {
          window.sessionStorage.setItem('dinely_auth_redirect_in_progress', '1');
        }
        await signInWithRedirect(firebaseAuth, googleProvider);
        return null;
      } catch (redirectErr: any) {
        if (typeof window?.sessionStorage?.removeItem === 'function') {
          window.sessionStorage.removeItem('dinely_auth_redirect_in_progress');
        }
        mapAndThrowAuthError(redirectErr);
      }
    }
    mapAndThrowAuthError(error);
  }
}

/**
 * Triggers real Firebase Google Authentication with popup flow.
 * On mobile browsers or when popups are blocked, gracefully delegates to redirect flow.
 */
export async function signInWithGooglePopup(forceRefreshIdToken: boolean = false): Promise<GoogleAuthResult> {
  const res = await signInWithGoogle({ forceRefreshIdToken });
  if (!res) {
    // When redirecting on mobile, return an unresolving promise while browser navigates
    return new Promise(() => {});
  }
  return res;
}

/**
 * Processes the result of a Google sign-in redirect flow (from signInWithRedirect).
 * Memoized per page load so multiple callers share the same redirect result without racing getRedirectResult.
 */
let redirectResultPromise: Promise<GoogleAuthResult | null> | null = null;

export async function handleGoogleRedirectResult(forceRefreshIdToken: boolean = false): Promise<GoogleAuthResult | null> {
  if (typeof window === 'undefined') return null;

  const hasRedirectPending = typeof window.sessionStorage?.getItem === 'function' &&
    window.sessionStorage.getItem('dinely_auth_redirect_in_progress') === '1';
  const hasAuthParams = Boolean(
    (window.location?.search && (window.location.search.includes('apiKey=') || window.location.search.includes('mode='))) ||
    (window.location?.hash && (window.location.hash.includes('access_token=') || window.location.hash.includes('id_token=')))
  );

  // If no redirect was initiated in this session and no OAuth parameters exist in URL, return null immediately
  if (!hasRedirectPending && !hasAuthParams) {
    return null;
  }

  if (!redirectResultPromise) {
    redirectResultPromise = (async () => {
      try {
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500));
        const result: UserCredential | null = await Promise.race([
          getRedirectResult(firebaseAuth),
          timeoutPromise,
        ]);
        if (typeof window.sessionStorage?.removeItem === 'function') {
          window.sessionStorage.removeItem('dinely_auth_redirect_in_progress');
        }
        if (!result || !result.user) {
          return null;
        }
        return await extractGoogleAuthResult(result, forceRefreshIdToken);
      } catch (error: any) {
        if (typeof window.sessionStorage?.removeItem === 'function') {
          window.sessionStorage.removeItem('dinely_auth_redirect_in_progress');
        }
        if (error.code === 'auth/operation-not-supported-in-this-environment') {
          return null;
        }
        console.error('Firebase Google Redirect Result Error:', error);
        mapAndThrowAuthError(error);
      }
    })();
  }

  return redirectResultPromise;
}

/**
 * Platform Admin Google Login Flow.
 * Obtains fresh Firebase ID token for backend Platform Admin verification.
 */
export async function signInPlatformAdminWithGoogle(): Promise<GoogleAuthResult | null> {
  return signInWithGoogle({ forceRefreshIdToken: true });
}

let _firebaseAuthReadyPromise: Promise<any> | null = null;
let _isFirebaseAuthInitialized = false;

/**
 * Waits for Firebase Auth to complete initial asynchronous hydration from IndexedDB / Redirect.
 * Cached singleton: executes once and returns immediately on all subsequent calls.
 */
export async function ensureFirebaseAuthReady(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if (_isFirebaseAuthInitialized) {
    return firebaseAuth.currentUser;
  }

  if (!_firebaseAuthReadyPromise) {
    _firebaseAuthReadyPromise = (async () => {
      // Process any pending redirect results first
      try {
        await handleGoogleRedirectResult();
      } catch (e) {
        console.warn('[firebase] Pending redirect result error during hydration:', e);
      }

      if (firebaseAuth.currentUser) {
        _isFirebaseAuthInitialized = true;
        return firebaseAuth.currentUser;
      }

      try {
        if (typeof (firebaseAuth as any).authStateReady === 'function') {
          const readyPromise = (firebaseAuth as any).authStateReady();
          const timeoutPromise = new Promise<void>((res) => setTimeout(res, 500));
          await Promise.race([readyPromise, timeoutPromise]);
          if (firebaseAuth.currentUser) {
            _isFirebaseAuthInitialized = true;
            return firebaseAuth.currentUser;
          }
        }
      } catch (e) {
        console.warn('authStateReady check failed:', e);
      }

      return new Promise((resolve) => {
        let resolved = false;
        const unsub = firebaseAuth.onAuthStateChanged((u) => {
          if (!resolved) {
            resolved = true;
            _isFirebaseAuthInitialized = true;
            unsub();
            resolve(u);
          }
        });
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            _isFirebaseAuthInitialized = true;
            unsub();
            resolve(firebaseAuth.currentUser);
          }
        }, 500);
      });
    })();
  }

  return _firebaseAuthReadyPromise;
}

/**
 * Retrieves a verified, fresh cryptographic Firebase ID token.
 * Awaits auth hydration if needed, and supports force-refresh for expired tokens.
 */
export async function getValidFirebaseIdToken(forceRefresh: boolean = false): Promise<string | null> {
  let user = firebaseAuth.currentUser;
  if (!user) {
    user = await ensureFirebaseAuthReady();
  }
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch (e) {
    console.warn('Failed to get fresh Firebase ID token:', e);
    return null;
  }
}

export async function getFirebaseIdToken(forceRefresh: boolean = false): Promise<string | null> {
  return getValidFirebaseIdToken(forceRefresh);
}

import { authStateMachine, AuthState, AuthStateMachineData, AuthErrorDetails } from './authStateMachine';
export { authStateMachine, type AuthState, type AuthStateMachineData, type AuthErrorDetails };

export async function signOutFirebase(): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('dinely_platform_admin_id_token');
    sessionStorage.removeItem('dinely_admin_token');
    localStorage.removeItem('dinely_admin_token');
    localStorage.removeItem('dinely_auth_token');
    sessionStorage.removeItem('dinely_auth_token');
  }
  try {
    await firebaseSignOut(firebaseAuth);
  } catch (e) {
    console.warn('Firebase SignOut Warning:', e);
  } finally {
    authStateMachine.logout();
  }
}
