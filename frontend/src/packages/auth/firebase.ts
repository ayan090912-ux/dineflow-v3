import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  UserCredential,
} from 'firebase/auth';

// Firebase Web SDK Configuration for Dinely Cloud (Project: dinely-cd6cd)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'dinely-cd6cd.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'dinely-cd6cd',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'dinely-cd6cd.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '99267644103',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:99267644103:web:c7f93f68625d3c0da04ce2',
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
      throw new Error('Google sign-in popup was closed before completing authentication.');
    } else if (error.code === 'auth/popup-blocked') {
      throw new Error('Google sign-in popup was blocked by your browser. Please allow popups for this domain.');
    } else if (error.code === 'auth/cancelled-popup-request') {
      throw new Error('Sign-in process cancelled.');
    } else if (error.code === 'auth/account-exists-with-different-credential') {
      throw new Error('An account already exists with the same email address using a different login method.');
    } else if (error.code === 'auth/unauthorized-domain' || error.message?.includes('unauthorized-domain')) {
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
      throw new Error(`Firebase Auth Domain Error: '${currentHost}' is not authorized in Firebase Console. Please add '${currentHost}' under Firebase Console -> Authentication -> Settings -> Authorized Domains.`);
    } else if (error.code === 'auth/api-key-not-valid' || error.message?.includes('api-key-not-valid')) {
      throw new Error('Firebase API key is missing or invalid in frontend/.env (VITE_FIREBASE_API_KEY). Please set a valid Firebase Web API key from Firebase Console.');
    }

    throw new Error(error.message || 'Google Authentication failed. Please try again.');
  }
}

/**
 * Platform Admin Google Login Flow.
 * Obtains fresh Firebase ID token for backend Platform Admin verification.
 */
export async function signInPlatformAdminWithGoogle(): Promise<GoogleAuthResult> {
  return signInWithGooglePopup(true);
}

export async function signOutFirebase(): Promise<void> {
  try {
    await firebaseSignOut(firebaseAuth);
  } catch (e) {
    console.warn('Firebase SignOut Warning:', e);
  }
}
