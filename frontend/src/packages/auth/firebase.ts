import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  UserCredential,
} from 'firebase/auth';

// Firebase configuration from environment variables with safe fallback for localhost dev
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDemoKeyForDinelyLocalhostAuthDev',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'dinely-cloud.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'dinely-cloud',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'dinely-cloud.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '100000000000',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:100000000000:web:dinelydemo123456',
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
export async function signInWithGooglePopup(): Promise<GoogleAuthResult> {
  try {
    const result: UserCredential = await signInWithPopup(firebaseAuth, googleProvider);
    const user = result.user;

    if (!user.email) {
      throw new Error('No email address associated with this Google account.');
    }

    const idToken = await user.getIdToken();

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
      throw new Error('Google sign-in popup was blocked by your browser. Please allow popups for localhost.');
    } else if (error.code === 'auth/cancelled-popup-request') {
      throw new Error('Sign-in process cancelled.');
    } else if (error.code === 'auth/account-exists-with-different-credential') {
      throw new Error('An account already exists with the same email address using a different login method.');
    }

    throw new Error(error.message || 'Google Authentication failed. Please try again.');
  }
}

export async function signOutFirebase(): Promise<void> {
  try {
    await firebaseSignOut(firebaseAuth);
  } catch (e) {
    console.warn('Firebase SignOut Warning:', e);
  }
}
