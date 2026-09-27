import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  UserCredential,
} from 'firebase/auth';

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' && process.env ? process.env : {}) as any;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyAp2Mt6i7JfWHdQyxogoMtlDh1RQrtJtUg',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'dinely-cd6cd.firebaseapp.com',
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
 * Triggers real Firebase Google Authentication with popup flow.
 * Returns the authenticated Google user details.
 */
export async function signInWithGooglePopup(forceRefreshIdToken: boolean = false): Promise<GoogleAuthResult> {
  try {
    const result: UserCredential = await signInWithPopup(firebaseAuth, googleProvider);
    const user = result.user;

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
  } catch (error: any) {
    console.error('Firebase Google Sign-In Error:', error);

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

    const genErr = new Error(error.message || 'Google Authentication failed. Please try again.');
    (genErr as any).code = error.code || 'auth/unknown';
    throw genErr;
  }
}

/**
 * Platform Admin Google Login Flow.
 * Obtains fresh Firebase ID token for backend Platform Admin verification.
 */
export async function signInPlatformAdminWithGoogle(): Promise<GoogleAuthResult> {
  return signInWithGooglePopup(true);
}

/**
 * Waits for Firebase Auth to complete initial asynchronous hydration from IndexedDB.
 */
export async function ensureFirebaseAuthReady(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if (firebaseAuth.currentUser) return firebaseAuth.currentUser;
  try {
    if (typeof (firebaseAuth as any).authStateReady === 'function') {
      await (firebaseAuth as any).authStateReady();
      return firebaseAuth.currentUser;
    }
  } catch (e) {
    console.warn('authStateReady check failed:', e);
  }
  return new Promise((resolve) => {
    let resolved = false;
    const unsub = firebaseAuth.onAuthStateChanged((u) => {
      if (!resolved) {
        resolved = true;
        unsub();
        resolve(u);
      }
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsub();
        resolve(firebaseAuth.currentUser);
      }
    }, 2500);
  });
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

