import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, getPortalScopeFromPath } from '../api/client';

export interface NavigationContextType {
  currentPath: string;
  cleanPath: string;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  currentUser: any;
  setCurrentUser: (user: any) => void;
}

export function getCleanPath(rawPath?: string): string {
  if (!rawPath) {
    rawPath = typeof window !== 'undefined' ? window.location.pathname : '/';
  }
  // Strip origin if full URL passed
  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
    try {
      const parsed = new URL(rawPath);
      rawPath = parsed.pathname;
    } catch {
      rawPath = '/';
    }
  }
  // Strip query string and hash
  const withoutQuery = rawPath.split('?')[0].split('#')[0].trim();
  // Strip trailing slashes unless root '/'
  const normalized = withoutQuery.replace(/\/+$/, '') || '/';
  return normalized.toLowerCase();
}

export function getSearchParams(rawPath?: string): URLSearchParams {
  if (rawPath && rawPath.includes('?')) {
    return new URLSearchParams(rawPath.substring(rawPath.indexOf('?')));
  }
  if (typeof window !== 'undefined') {
    return new URLSearchParams(window.location.search);
  }
  return new URLSearchParams();
}

const NavigationContext = createContext<NavigationContextType>({
  currentPath: typeof window !== 'undefined' ? (window.location.pathname + window.location.search) : '/',
  cleanPath: typeof window !== 'undefined' ? getCleanPath(window.location.pathname) : '/',
  navigate: () => {},
  currentUser: null,
  setCurrentUser: () => {},
});

// Patch browser history methods to dispatch custom event on pushState/replaceState
if (typeof window !== 'undefined') {
  const origPushState = window.history.pushState;
  window.history.pushState = function (...args: any[]) {
    const result = origPushState.apply(this, args as any);
    const url = args[2] ? String(args[2]) : (window.location.pathname + window.location.search);
    window.dispatchEvent(new CustomEvent('dinely_navigate', { detail: { path: url } }));
    return result;
  };

  const origReplaceState = window.history.replaceState;
  window.history.replaceState = function (...args: any[]) {
    const result = origReplaceState.apply(this, args as any);
    const url = args[2] ? String(args[2]) : (window.location.pathname + window.location.search);
    window.dispatchEvent(new CustomEvent('dinely_navigate', { detail: { path: url } }));
    return result;
  };
}

/**
 * Imperative navigation function usable anywhere in the application.
 */
export function navigate(path: string, options?: { replace?: boolean }) {
  if (typeof window === 'undefined') return;

  const targetUrl = path || '/';
  if (options?.replace) {
    window.history.replaceState({}, '', targetUrl);
  } else {
    window.history.pushState({}, '', targetUrl);
  }
  window.dispatchEvent(new CustomEvent('dinely_navigate', { detail: { path: targetUrl } }));
  window.scrollTo({ top: 0, behavior: 'instant' as any });
}

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return typeof window !== 'undefined' ? (window.location.pathname + window.location.search) : '/';
  });

  const [cleanPath, setCleanPath] = useState<string>(() => {
    return typeof window !== 'undefined' ? getCleanPath(window.location.pathname) : '/';
  });

  const [currentUser, setCurrentUser] = useState<any>(() => {
    const initialPath = typeof window !== 'undefined' ? window.location.pathname || '/' : '/';
    return api.getCurrentUser(getPortalScopeFromPath(initialPath));
  });

  const handleNavigate = useCallback((path: string, options?: { replace?: boolean }) => {
    const targetUrl = path || '/';
    if (options?.replace) {
      window.history.replaceState({}, '', targetUrl);
    } else {
      window.history.pushState({}, '', targetUrl);
    }
    setCurrentPath(targetUrl);
    setCleanPath(getCleanPath(targetUrl));
    setCurrentUser(api.getCurrentUser(getPortalScopeFromPath(targetUrl)));
    window.scrollTo({ top: 0, behavior: 'instant' as any });
  }, []);

  useEffect(() => {
    const handleLocationChange = () => {
      const full = (window.location.pathname || '/') + (window.location.search || '');
      setCurrentPath(full);
      setCleanPath(getCleanPath(window.location.pathname));
      setCurrentUser(api.getCurrentUser(getPortalScopeFromPath(window.location.pathname)));
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('dinely_navigate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('dinely_navigate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        currentPath,
        cleanPath,
        navigate: handleNavigate,
        currentUser,
        setCurrentUser,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export function useNavigate() {
  const context = useContext(NavigationContext);
  return context.navigate || navigate;
}

export function useCurrentPath() {
  const context = useContext(NavigationContext);
  return context.currentPath;
}

export function useCleanPath() {
  const context = useContext(NavigationContext);
  return context.cleanPath || getCleanPath(context.currentPath);
}

export function useCurrentUser() {
  const context = useContext(NavigationContext);
  return { currentUser: context.currentUser, setCurrentUser: context.setCurrentUser };
}
