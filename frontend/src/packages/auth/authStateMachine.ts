import { User } from '../types';

export type AuthState = 'INITIALIZING' | 'AUTHENTICATED' | 'UNAUTHENTICATED' | 'ERROR';

export interface AuthErrorDetails {
  message: string;
  code?: string;
  isNetworkError?: boolean;
  isCancelled?: boolean;
}

export interface AuthStateMachineData {
  state: AuthState;
  user: User | null;
  token: string | null;
  error: AuthErrorDetails | null;
}

type AuthListener = (data: AuthStateMachineData) => void;

/**
 * Authoritative Dinely Phase 3 Auth State Machine:
 * 
 * Required Transitions:
 * INITIALIZING -> AUTHENTICATED
 * INITIALIZING -> UNAUTHENTICATED
 * INITIALIZING -> ERROR
 * 
 * Subsequent transitions:
 * AUTHENTICATED -> UNAUTHENTICATED (logout / session expired)
 * AUTHENTICATED -> ERROR (critical connection/token failure)
 * UNAUTHENTICATED -> AUTHENTICATED (successful login)
 * UNAUTHENTICATED -> ERROR (network failure on auth attempt)
 * ERROR -> INITIALIZING (retry)
 * ERROR -> UNAUTHENTICATED (proceed to sign in)
 * 
 * Never: INFINITE LOADING (enforced by watchdog timer)
 */
class AuthStateMachine {
  private _state: AuthState = 'INITIALIZING';
  private _user: User | null = null;
  private _token: string | null = null;
  private _error: AuthErrorDetails | null = null;
  private _listeners: Set<AuthListener> = new Set();
  private _watchdogTimer: any = null;

  constructor() {
    // Start initial watchdog timer (4000ms max)
    this.armWatchdog(4000);
  }

  public armWatchdog(timeoutMs: number = 4000) {
    this.disarmWatchdog();
    this._watchdogTimer = setTimeout(() => {
      if (this._state === 'INITIALIZING') {
        console.warn(`[AuthStateMachine] Watchdog timer expired (${timeoutMs}ms). Forcing exit from INITIALIZING to prevent infinite loading.`);
        this.setError({
          message: 'Authentication initialization timed out. Please check your network connection.',
          code: 'auth/timeout',
          isNetworkError: true,
        });
      }
    }, timeoutMs);
  }

  public disarmWatchdog() {
    if (this._watchdogTimer) {
      clearTimeout(this._watchdogTimer);
      this._watchdogTimer = null;
    }
  }

  public getSnapshot(): AuthStateMachineData {
    return {
      state: this._state,
      user: this._user,
      token: this._token,
      error: this._error,
    };
  }

  public getState(): AuthState {
    return this._state;
  }

  public getUser(): User | null {
    return this._user;
  }

  public getToken(): string | null {
    return this._token;
  }

  public getError(): AuthErrorDetails | null {
    return this._error;
  }

  public subscribe(listener: AuthListener): () => void {
    this._listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this._listeners.delete(listener);
    };
  }

  private notify() {
    const snap = this.getSnapshot();
    this._listeners.forEach((cb) => {
      try {
        cb(snap);
      } catch (err) {
        console.error('[AuthStateMachine] Listener error:', err);
      }
    });
  }

  /**
   * Transition: -> INITIALIZING
   */
  public setInitializing(watchdogMs: number = 4000) {
    this._state = 'INITIALIZING';
    this._error = null;
    this.armWatchdog(watchdogMs);
    this.notify();
  }

  /**
   * Transition: -> AUTHENTICATED
   */
  public setAuthenticated(user: User, token: string) {
    this.disarmWatchdog();
    if (!token) {
      throw new Error('Valid token is required to enter AUTHENTICATED state.');
    }
    // Strict prohibition of synthetic tokens
    if (token.startsWith('df_jwt_') || token.startsWith('df_ref_')) {
      throw new Error('Synthetic df_jwt_* tokens are strictly forbidden.');
    }

    this._state = 'AUTHENTICATED';
    this._user = user;
    this._token = token;
    this._error = null;
    this.notify();
  }

  /**
   * Transition: -> UNAUTHENTICATED
   */
  public setUnauthenticated() {
    this.disarmWatchdog();
    this._state = 'UNAUTHENTICATED';
    this._user = null;
    this._token = null;
    this._error = null;
    this.notify();
  }

  /**
   * Transition: -> ERROR
   */
  public setError(error: AuthErrorDetails) {
    this.disarmWatchdog();
    this._state = 'ERROR';
    this._error = error;
    this.notify();
  }

  /**
   * Handles session expiration when token refresh fails or is revoked.
   * Clears in-memory identity and transitions to UNAUTHENTICATED.
   */
  public handleSessionExpired() {
    this.disarmWatchdog();
    this._state = 'UNAUTHENTICATED';
    this._user = null;
    this._token = null;
    this._error = {
      message: 'Your session has expired. Please sign in again.',
      code: 'auth/session-expired',
    };
    this.notify();
  }

  /**
   * Handles network failure during authentication attempts.
   */
  public handleNetworkFailure(message: string = 'Network failure: Unable to communicate with authentication servers.') {
    this.disarmWatchdog();
    this.setError({
      message,
      code: 'auth/network-request-failed',
      isNetworkError: true,
    });
  }

  /**
   * Handles Google sign-in popup cancellation gracefully.
   * Leaves user in UNAUTHENTICATED state with non-blocking error notice.
   */
  public handleGoogleCancellation() {
    this.disarmWatchdog();
    this._state = 'UNAUTHENTICATED';
    this._error = {
      message: 'Google sign-in popup was closed before completing authentication.',
      code: 'auth/popup-closed-by-user',
      isCancelled: true,
    };
    this.notify();
  }

  /**
   * Handles switching account from User A to User B.
   */
  public switchAccount(newUser: User, newToken: string) {
    this.setUnauthenticated();
    this.setAuthenticated(newUser, newToken);
  }

  /**
   * Handles logout.
   */
  public logout() {
    this.setUnauthenticated();
  }
}

export const authStateMachine = new AuthStateMachine();
