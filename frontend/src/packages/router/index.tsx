import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, getPortalScopeFromPath } from '../api/client';

export interface NavigationContextType {
  currentPath: string;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  currentUser: any;
  setCurrentUser: (user: any) => void;
}

const NavigationContext = createContext<NavigationContextType>({
  currentPath: typeof window !== 'undefined' ? window.location.pathname : '/',
  navigate: () => {},
  currentUser: null,
  setCurrentUser: () => {},
});

// Patch browser history methods to dispatch custom event on pushState/replaceState
if (typeof window !== 'undefined') {
  const origPushState = window.history.pushState;
  window.history.pushState = function (...args: any[]) {
    const result = origPushState.apply(this, args as any);
    const url = args[2] ? String(args[2]) : window.location.pathname;
    window.dispatchEvent(new CustomEvent('dinely_navigate', { detail: { path: url } }));
    return result;
  };

  const origReplaceState = window.history.replaceState;
  window.history.replaceState = function (...args: any[]) {
    const result = origReplaceState.apply(this, args as any);
    const url = args[2] ? String(args[2]) : window.location.pathname;
    window.dispatchEvent(new CustomEvent('dinely_navigate', { detail: { path: url } }));
    return result;
  };
}

/**
 * Imperative navigation function usable anywhere in the application.
 */
export function navigate(path: string, options?: { replace?: boolean }) {
  if (typeof window === 'undefined') return;

  if (options?.replace) {
    window.history.replaceState({}, '', path);
  } else {
    window.history.pushState({}, '', path);
  }
  window.dispatchEvent(new CustomEvent('dinely_navigate', { detail: { path } }));
  window.scrollTo({ top: 0, behavior: 'instant' as any });
}

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return typeof window !== 'undefined' ? window.location.pathname || '/' : '/';
  });

  const [currentUser, setCurrentUser] = useState<any>(() => {
    const initialPath = typeof window !== 'undefined' ? window.location.pathname || '/' : '/';
    return api.getCurrentUser(getPortalScopeFromPath(initialPath));
  });

  const handleNavigate = useCallback((path: string, options?: { replace?: boolean }) => {
    if (options?.replace) {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }
    setCurrentPath(path);
    setCurrentUser(api.getCurrentUser(getPortalScopeFromPath(path)));
    window.scrollTo({ top: 0, behavior: 'instant' as any });
  }, []);

  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname || '/';
      setCurrentPath(path);
      setCurrentUser(api.getCurrentUser(getPortalScopeFromPath(path)));
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

export function useCurrentUser() {
  const context = useContext(NavigationContext);
  return { currentUser: context.currentUser, setCurrentUser: context.setCurrentUser };
}
