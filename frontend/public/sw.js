// Dinely Service Worker (sw.js)
// Enables mobile background push notifications, foreground ServiceWorkerRegistration.showNotification(),
// and intelligent notification click routing.

const SW_VERSION = 'dinely-sw-v1';

self.addEventListener('install', (event) => {
  // Activate immediately without waiting for existing clients to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of all pages within scope immediately
  event.waitUntil(self.clients.claim());
});

// Listen for Web Push events (for background/closed phone notifications)
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'Dinely OS Alert';
  const options = {
    body: data.body || 'New operational update received.',
    icon: data.icon || '/favicon-32x32.png',
    badge: data.badge || '/favicon-16x16.png',
    tag: data.tag || `dinely-alert-${Date.now()}`,
    data: {
      url: data.url || '/restaurant/dashboard',
      timestamp: Date.now(),
      ...(data.data || {}),
    },
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click: focus existing tab or open dashboard
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/restaurant/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a tab is already open with the app, focus it
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          if (targetUrl === '/' || client.url.includes(targetUrl) || client.url.includes('/restaurant')) {
            return client.focus();
          }
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Allow client scripts to request notifications directly through the Service Worker
// (Required on Android Chrome where `new Notification(...)` in page scope throws Illegal Constructor)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    const notificationOptions = {
      icon: '/favicon-32x32.png',
      badge: '/favicon-16x16.png',
      vibrate: [200, 100, 200],
      ...options,
    };
    event.waitUntil(self.registration.showNotification(title, notificationOptions));
  }
});
