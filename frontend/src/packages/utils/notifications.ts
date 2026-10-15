/**
 * Dinely Unified Notification System
 * Handles cross-platform notifications across Desktop, Android Chrome, and iOS PWA:
 * - Uses ServiceWorkerRegistration.showNotification() for Android Chrome & mobile web
 * - Falls back to window.Notification() constructor on desktop browsers
 * - Emits physical haptic vibration via navigator.vibrate()
 * - Generates synthesized audio alert tone via Web Audio API
 * - Manages Service Worker registration and Web Push lifecycle
 */

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export interface AppNotificationOptions {
  body?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  url?: string;
  data?: any;
  silent?: boolean;
}

/**
 * Check if browser supports notifications
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Check if browser supports service workers
 */
export function isServiceWorkerSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * Get current notification permission
 */
export function getNotificationPermission(): NotificationPermissionStatus {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionStatus;
}

/**
 * Register the Dinely service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return reg;
  } catch (err) {
    console.warn('[Dinely Notification] Service worker registration failed:', err);
    return null;
  }
}

/**
 * Request notification permission from the user (Must be invoked via a user gesture)
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await registerServiceWorker();
    }
    return permission as NotificationPermissionStatus;
  } catch (err) {
    console.error('[Dinely Notification] Permission request failed:', err);
    return 'denied';
  }
}

/**
 * Synthesize a modern, pleasant 2-tone alert chime using Web Audio API
 */
export function playNotificationTone(): void {
  try {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // First tone (G5: ~784Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(783.99, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Second tone (C6: ~1046Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1046.50, now + 0.1);
    gain2.gain.setValueAtTime(0.18, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.35);
  } catch (audioErr) {
    // Ignore audio autoplay restrictions
  }
}

/**
 * Trigger physical haptic vibration on mobile devices
 */
export function triggerHapticFeedback(pattern: number[] = [150, 80, 150]): void {
  try {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore vibration failure
  }
}

/**
 * Dispatches a notification across the supported browser platform:
 * 1. Executes haptics and sound (if not silent)
 * 2. Attempts ServiceWorkerRegistration.showNotification() (Supported on Android Chrome & modern mobile)
 * 3. Falls back to window.Notification() constructor (Desktop browsers)
 */
export async function sendAppNotification(
  title: string,
  options: AppNotificationOptions = {}
): Promise<boolean> {
  // Physical and auditory feedback in foreground
  if (!options.silent) {
    triggerHapticFeedback([180, 70, 180]);
    playNotificationTone();
  }

  // System notification dispatch requires permission
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const notificationOptions = {
    body: options.body || '',
    icon: options.icon || '/favicon-32x32.png',
    badge: options.badge || '/favicon-16x16.png',
    tag: options.tag || `dinely-${Date.now()}`,
    vibrate: [200, 100, 200],
    data: {
      url: options.url || '/restaurant/dashboard',
      timestamp: Date.now(),
      ...(options.data || {}),
    },
  };

  // 1. Preferred Mobile Mechanism: ServiceWorkerRegistration.showNotification()
  // This avoids the Android Chrome "Illegal constructor" error
  if (isServiceWorkerSupported()) {
    try {
      let reg: ServiceWorkerRegistration | undefined;
      try {
        reg = await navigator.serviceWorker.getRegistration();
      } catch {}

      if (!reg) {
        reg = (await registerServiceWorker()) || undefined;
      }

      if (reg && reg.showNotification) {
        await reg.showNotification(title, notificationOptions as any);
        return true;
      }
    } catch (swErr) {
      console.warn('[Dinely Notification] Service worker showNotification failed:', swErr);
    }
  }

  // 2. Desktop Fallback: window.Notification constructor
  try {
    new Notification(title, {
      body: notificationOptions.body,
      icon: notificationOptions.icon,
      tag: notificationOptions.tag,
    });
    return true;
  } catch (windowErr) {
    console.warn('[Dinely Notification] Window Notification constructor failed:', windowErr);
  }

  return false;
}
