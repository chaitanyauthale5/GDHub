import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { app } from '@/lib/firebase';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { useCallback, useEffect, useRef } from 'react';

const VAPID_KEY = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_FIREBASE_VAPID_KEY) || '';

export default function PushNotificationsManager() {
  const { user, isAuthenticated } = useAuth();
  const lastTokenRef = useRef(null);
  const didInitRef = useRef(false);
  const messagingRef = useRef(null);
  const unsubscribeRef = useRef(null);

  // Clean up function
  const cleanup = useCallback(() => {
    try {
      if (typeof unsubscribeRef.current === 'function') {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    } catch (e) {
      console.warn('[push] Cleanup error:', e);
    }
  }, []);

  // Initialize push notifications
  useEffect(() => {
    if (!isAuthenticated || !user?.email) {
      cleanup();
      return;
    }

    let isMounted = true;
    let registration = null;
    let messaging = null;

    const initializePush = async () => {
      try {
        // Check if already initialized
        if (didInitRef.current && lastTokenRef.current) {
          console.log('[push] Already initialized with token:', lastTokenRef.current.substring(0, 20) + '...');
          return;
        }

        // Check browser support
        const supported = await isSupported();
        if (!supported) {
          console.warn('[push] Firebase messaging not supported in this browser');
          return;
        }

        if (!VAPID_KEY) {
          console.warn('[push] VAPID_KEY not configured');
          return;
        }

        // Check service worker support
        if (!('serviceWorker' in navigator)) {
          console.warn('[push] Service workers not supported');
          return;
        }

        // Register service worker
        try {
          registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { 
            scope: '/',
            updateViaCache: 'none'
          });
          console.log('[push] Service worker registered:', registration.scope);
        } catch (swError) {
          console.error('[push] Service worker registration failed:', swError);
          return;
        }

        // Wait for service worker to be ready
        await navigator.serviceWorker.ready;

        // Request notification permission
        let permission = Notification.permission;
        if (permission === 'default') {
          try {
            permission = await Notification.requestPermission();
          } catch (permError) {
            console.error('[push] Permission request failed:', permError);
            return;
          }
        }

        if (permission !== 'granted') {
          console.warn('[push] Notification permission not granted:', permission);
          return;
        }

        // Get messaging instance
        try {
          messaging = getMessaging(app);
          messagingRef.current = messaging;
        } catch (msgError) {
          console.error('[push] Failed to get messaging instance:', msgError);
          return;
        }

        // Get FCM token
        let token = null;
        try {
          token = await getToken(messaging, { 
            vapidKey: VAPID_KEY, 
            serviceWorkerRegistration: registration 
          });
        } catch (tokenError) {
          console.error('[push] Failed to get token:', tokenError);
          
          // If token error is due to missing service worker registration, try again
          if (tokenError?.code === 'messaging/unsupported-browser' || 
              tokenError?.message?.includes('service worker')) {
            console.log('[push] Retrying token generation...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
              token = await getToken(messaging, { 
                vapidKey: VAPID_KEY, 
                serviceWorkerRegistration: registration 
              });
            } catch (retryError) {
              console.error('[push] Retry failed:', retryError);
              return;
            }
          } else {
            return;
          }
        }

        if (!token) {
          console.warn('[push] No token received');
          return;
        }

        // Check if token changed
        const prevToken = localStorage.getItem('fcm_token');
        if (prevToken && prevToken !== token) {
          console.log('[push] Token changed, unsubscribing old token');
          try {
            await api.push.unsubscribe({ token: prevToken });
          } catch (unsubError) {
            console.warn('[push] Failed to unsubscribe old token:', unsubError);
          }
        }

        // Subscribe new token
        if (!isMounted) return;
        
        if (prevToken !== token || !prevToken) {
          try {
            await api.push.subscribe({ 
              token, 
              platform: 'web', 
              user_agent: navigator.userAgent 
            });
            localStorage.setItem('fcm_token', token);
            console.log('[push] Successfully subscribed with token:', token.substring(0, 20) + '...');
          } catch (subscribeError) {
            console.error('[push] Failed to subscribe token:', subscribeError);
            return;
          }
        }

        lastTokenRef.current = token;
        didInitRef.current = true;

        // Listen for foreground messages (when app is open)
        const unsubscribe = onMessage(messaging, (payload) => {
          console.log('[push] Foreground message received:', payload);
          
          try {
            const data = payload?.data || {};
            const notification = payload?.notification || {};
            
            // Use notification object if available, otherwise fallback to data
            const title = notification.title || data._title || 'SpeakUp';
            const body = notification.body || data._body || '';
            const icon = notification.icon || data.icon || '/logo.png';
            const badge = notification.badge || data.badge || '/logo.png';
            const image = notification.image || (data.image && String(data.image).trim() ? String(data.image) : undefined);
            const tag = notification.tag || data.tag || `notification-${Date.now()}`;
            
            // Parse actions
            let actions = [];
            if (notification.actions && Array.isArray(notification.actions)) {
              actions = notification.actions;
            } else if (data.actions) {
              try {
                actions = JSON.parse(data.actions);
              } catch (parseError) {
                console.warn('[push] Failed to parse actions:', parseError);
              }
            }
            
            if (!Array.isArray(actions) || actions.length === 0) {
              actions = [
                { action: 'open', title: 'Open' },
                { action: 'dismiss', title: 'Dismiss' },
              ];
            }

            // Determine target URL based on notification type
            let targetUrl = data.url || '/Dashboard';
            const notificationType = data.type || '';
            
            switch (notificationType) {
              case 'chat_message':
                targetUrl = data.from_user_id ? `/Chat?friendId=${encodeURIComponent(data.from_user_id)}` : '/Chat';
                break;
              case 'friend_request':
                targetUrl = data.from_user_id ? `/UserProfile?userId=${encodeURIComponent(data.from_user_id)}` : '/Dashboard';
                break;
              case 'room_invite':
                targetUrl = data.room_id ? `/JoinRoom?roomId=${encodeURIComponent(data.room_id)}` : '/BrowseRooms';
                break;
              default:
                targetUrl = data.url || '/Dashboard';
            }

            // Parse action URLs
            let actionUrls = {};
            if (data.actionUrls) {
              try {
                actionUrls = JSON.parse(data.actionUrls);
              } catch (parseError) {
                console.warn('[push] Failed to parse actionUrls:', parseError);
              }
            }
            
            if (!actionUrls.open) {
              actionUrls.open = targetUrl;
            }

            const options = {
              body,
              icon,
              badge,
              image,
              tag,
              timestamp: notification.timestamp || Date.now(),
              requireInteraction: String(data.requireInteraction || '') === 'true' || notification.requireInteraction === true,
              actions,
              vibrate: [200, 100, 200],
              data: {
                url: targetUrl,
                actionUrls,
                raw: data,
                notificationType,
                timestamp: data.timestamp || Date.now(),
              },
              silent: false,
              renotify: true,
            };

            // Show notification as floating window via service worker (preferred method)
            // This ensures notifications appear as native browser floating windows
            navigator.serviceWorker?.ready
              .then((swReg) => {
                if (swReg && swReg.active) {
                  console.log('[push] Showing foreground notification as floating window:', {
                    title,
                    body: body.substring(0, 50) + '...',
                    hasImage: !!image,
                    actionsCount: actions.length
                  });
                  // This will display as a native browser floating window
                  return swReg.showNotification(title, options);
                } else {
                  throw new Error('Service worker not active');
                }
              })
              .catch((showError) => {
                console.warn('[push] Failed to show via service worker, using fallback Notification API:', showError);
                // Fallback to regular Notification API (also shows as floating window)
                if (Notification.permission === 'granted') {
                  try {
                    const fallbackOptions = {
                      body,
                      icon,
                      badge,
                      image,
                      tag,
                      timestamp,
                      requireInteraction: options.requireInteraction,
                      data: options.data,
                      silent: false
                    };
                    // Note: Regular Notification API doesn't support actions, but still shows as floating window
                    const notification = new Notification(title, fallbackOptions);
                    console.log('[push] Fallback notification displayed as floating window');
                    
                    // Handle click
                    notification.onclick = (event) => {
                      event.preventDefault();
                      window.focus();
                      window.location.href = targetUrl;
                    };
                  } catch (fallbackError) {
                    console.error('[push] Fallback notification failed:', fallbackError);
                  }
                }
              });
          } catch (error) {
            console.error('[push] Error handling foreground message:', error);
          }
        });

        unsubscribeRef.current = unsubscribe;

        // Set up token refresh handler
        const handleTokenRefresh = async () => {
          try {
            if (!messaging) return;
            const newToken = await getToken(messaging, { 
              vapidKey: VAPID_KEY, 
              serviceWorkerRegistration: registration 
            });
            if (newToken && newToken !== lastTokenRef.current && isMounted) {
              console.log('[push] Token refreshed');
              const prev = lastTokenRef.current;
              lastTokenRef.current = newToken;
              if (prev) {
                try {
                  await api.push.unsubscribe({ token: prev });
                } catch {}
              }
              try {
                await api.push.subscribe({ 
                  token: newToken, 
                  platform: 'web', 
                  user_agent: navigator.userAgent 
                });
                localStorage.setItem('fcm_token', newToken);
              } catch (err) {
                console.error('[push] Failed to subscribe refreshed token:', err);
              }
            }
          } catch (refreshError) {
            console.error('[push] Token refresh failed:', refreshError);
          }
        };

        // Listen for token refresh (Firebase automatically handles this, but we can add our listener)
        // Note: Firebase handles token refresh automatically, but we monitor for changes
        
      } catch (error) {
        console.error('[push] Initialization error:', error);
        didInitRef.current = false;
      }
    };

    // Initialize with a small delay to ensure service worker is ready
    const timeoutId = setTimeout(() => {
      initializePush();
    }, 1000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      cleanup();
    };
  }, [isAuthenticated, user?.email, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return null;
}
