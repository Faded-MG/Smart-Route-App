import { useState, useEffect, useCallback, useMemo } from 'react';

export function useNotifications() {
  // Check support during initialization (no setState needed)
  const { isSupported, initialPermission } = useMemo(() => {
    const supported = 'serviceWorker' in navigator && 'Notification' in window;
    return {
      isSupported: supported,
      initialPermission: supported ? Notification.permission : 'default'
    };
  }, []);

  const [permission, setPermission] = useState(initialPermission);
  const [swRegistration, setSwRegistration] = useState(null);

  // Register service worker
  useEffect(() => {
    if (!isSupported) return;

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/service-worker.js');
        setSwRegistration(registration);
        
        // Request periodic background sync if supported
        if ('periodicSync' in registration) {
          try {
            await registration.periodicSync.register('closure-check', {
              minInterval: 15 * 60 * 1000, // 15 minutes
            });
          } catch (err) {
            console.log('Periodic sync not granted:', err);
          }
        }
        
        // Start checking for closures
        if (registration.active) {
          registration.active.postMessage({ type: 'SCHEDULE_CLOSURE_CHECKS' });
        }
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    };

    registerSW();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if (!isSupported) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted' && swRegistration) {
        // Trigger immediate check
        swRegistration.active?.postMessage({ type: 'CHECK_CLOSURES_NOW' });
      }
      
      return result === 'granted';
    } catch (error) {
      console.error('Permission request failed:', error);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swRegistration]);

  // Send a test notification
  const sendTestNotification = useCallback((title, body) => {
    if (!swRegistration || permission !== 'granted') return;

    swRegistration.showNotification(title || '🚧 Test Notification', {
      body: body || 'Road closure notifications are working!',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: 'test',
      actions: [
        { action: 'open', title: 'Open App' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    });
  }, [swRegistration, permission]);

  // Manually trigger closure check
  const checkClosuresNow = useCallback(() => {
    if (swRegistration?.active) {
      swRegistration.active.postMessage({ type: 'CHECK_CLOSURES_NOW' });
    }
  }, [swRegistration]);

  return {
    permission,
    isSupported: isSupported,
    requestPermission,
    sendTestNotification,
    checkClosuresNow,
    isGranted: permission === 'granted',
    isDenied: permission === 'denied'
  };
}
