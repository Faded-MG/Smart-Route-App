// Service Worker for Push Notifications and Background Sync
const CLOSURE_CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes

// Install event
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Background sync for closure checks
self.addEventListener('sync', (event) => {
  if (event.tag === 'closure-check') {
    event.waitUntil(checkForUpcomingClosures());
  }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'closure-check') {
    event.waitUntil(checkForUpcomingClosures());
  }
});

// Push notification received
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  
  const options = {
    body: data.body || 'A road closure is starting soon in your area.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: data.tag || 'closure-alert',
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: 'Open App'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ],
    data: data.closureData || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '🚧 Road Closure Alert', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    // Open the app
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clientList) => {
        if (clientList.length > 0) {
          const client = clientList[0];
          client.focus();
          // Post message to client with closure data
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            closure: event.notification.data
          });
        } else {
          self.clients.openWindow('/');
        }
      })
    );
  }
});

// Check for upcoming closures
async function checkForUpcomingClosures() {
  try {
    const response = await fetch('/roads');
    if (!response.ok) return;
    
    const data = await response.json();
    const closures = Array.isArray(data) ? data : (data.closures || data.roads || []);
    
    const now = new Date();
    const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    
    const upcomingClosures = closures.filter(closure => {
      if (!closure.startTime) return false;
      
      const startTime = new Date(closure.startTime);
      // Closures starting within next 4 hours but not yet started
      return startTime > now && startTime <= fourHoursFromNow;
    });
    
    // Notify for each upcoming closure
    for (const closure of upcomingClosures) {
      const startTime = new Date(closure.startTime);
      const minutesUntil = Math.round((startTime - now) / (1000 * 60));
      
      let timeText;
      if (minutesUntil <= 60) {
        timeText = `Starting in ${minutesUntil} minutes`;
      } else {
        const hours = Math.floor(minutesUntil / 60);
        timeText = `Starting in ${hours} hours`;
      }
      
      await self.registration.showNotification(
        `🚧 ${closure.road || 'Road'} Closure Starting Soon`,
        {
          body: `${timeText}\n${closure.reason || 'Road closure in effect'}`,
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          tag: `closure-${closure.road || 'unknown'}-${closure.startTime}`,
          requireInteraction: true,
          actions: [
            { action: 'open', title: 'View Route Options' },
            { action: 'dismiss', title: 'Dismiss' }
          ],
          data: closure
        }
      );
    }
    
    // Also check for active closures that user should know about
    const activeClosures = closures.filter(closure => {
      if (!closure.startTime && !closure.endTime) return true; // Always active
      const start = closure.startTime ? new Date(closure.startTime) : null;
      const end = closure.endTime ? new Date(closure.endTime) : null;
      
      if (start && end) return now >= start && now <= end;
      if (start) return now >= start;
      if (end) return now <= end;
      return false;
    });
    
    // Show summary if multiple active closures
    if (activeClosures.length >= 3) {
      await self.registration.showNotification(
        `🚧 ${activeClosures.length} Active Road Closures`,
        {
          body: 'Multiple road closures are currently active. Tap to plan your route.',
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          tag: 'active-closures-summary',
          actions: [
            { action: 'open', title: 'Plan Route' },
            { action: 'dismiss', title: 'Dismiss' }
          ],
          data: { closures: activeClosures }
        }
      );
    }
    
  } catch (error) {
    console.error('Error checking closures:', error);
  }
}

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CHECK_CLOSURES_NOW') {
    checkForUpcomingClosures();
  }
  
  if (event.data.type === 'SCHEDULE_CLOSURE_CHECKS') {
    // Set up periodic checks
    setInterval(checkForUpcomingClosures, CLOSURE_CHECK_INTERVAL);
  }
});
