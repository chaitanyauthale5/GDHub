importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: 'AIzaSyCxUTfUhpMfyadunt94VR6A10wVeWYfbOs',
    authDomain: 'speakup-fafe8.firebaseapp.com',
    projectId: 'speakup-fafe8',
    storageBucket: 'speakup-fafe8.firebasestorage.app',
    messagingSenderId: '451745252894',
    appId: '1:451745252894:web:7e818c42c801dfa106100f',
});

const messaging = firebase.messaging();

// Handle background messages (when app is closed)
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background message received:', payload);
    
    const data = payload?.data || {};
    const notificationData = payload?.notification || {};
    
    // Use notification object if available, otherwise fallback to data
    const title = notificationData.title || data._title || 'SpeakUp';
    const body = notificationData.body || data._body || '';
    const icon = notificationData.icon || data.icon || '/logo.png';
    const badge = notificationData.badge || data.badge || '/logo.png';
    const image = notificationData.image || (data.image && String(data.image).trim() ? String(data.image) : undefined);
    const tag = notificationData.tag || data.tag || `notification-${Date.now()}`;
    
    // Parse actions
    let actions = [];
    if (notificationData.actions && Array.isArray(notificationData.actions)) {
        actions = notificationData.actions;
    } else if (data.actions) {
        try {
            actions = JSON.parse(data.actions);
        } catch (e) {
            console.warn('[SW] Failed to parse actions:', e);
        }
    }
    
    // Fallback actions
    if (!Array.isArray(actions) || actions.length === 0) {
        actions = [
            { action: 'open', title: 'Open' },
            { action: 'dismiss', title: 'Dismiss' },
        ];
    }

    // Parse action URLs
    let actionUrls = {};
    if (data.actionUrls) {
        try {
            actionUrls = JSON.parse(data.actionUrls);
        } catch (e) {
            console.warn('[SW] Failed to parse actionUrls:', e);
        }
    }
    
    // Determine target URL based on notification type
    let targetUrl = data.url || '/Dashboard';
    const notificationType = data.type || '';
    
    // Determine target URL and optimize notification format based on type
    switch (notificationType) {
        case 'chat_message':
            targetUrl = data.from_user_id ? `/Chat?friendId=${encodeURIComponent(data.from_user_id)}` : '/Chat';
            // For chat messages, use consistent tag to replace previous notifications from same sender
            if (!tag || !tag.includes('chat-')) {
                tag = data.from_user_id ? `chat-${data.from_user_id}` : `chat-${Date.now()}`;
            }
            // Default actions for chat if not provided
            if (!actions || actions.length === 0) {
                actions = [
                    { action: 'open', title: 'Open Chat' },
                    { action: 'dismiss', title: 'Dismiss' }
                ];
            }
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
    
    // Ensure actionUrls has open action
    if (!actionUrls.open) {
        actionUrls.open = targetUrl;
    }
    
    // For chat messages, update actionUrls if needed
    if (notificationType === 'chat_message' && !actionUrls.open) {
        actionUrls.open = targetUrl;
    }

    // Build notification options with proper formatting
    const options = {
        body,
        icon: icon || '/logo.png', // Ensure icon is set
        badge: badge || '/logo.png', // Ensure badge is set
        image: image || undefined, // Large image (optional, shown at top like screenshot)
        tag: tag || `notification-${Date.now()}`, // Unique tag for grouping/replacing notifications
        timestamp: notificationData.timestamp || parseInt(data.timestamp) || Date.now(),
        requireInteraction: String(data.requireInteraction || '') === 'true' || notificationData.requireInteraction === true,
        actions: actions && actions.length > 0 ? actions : [
            { action: 'open', title: 'Open' },
            { action: 'dismiss', title: 'Dismiss' }
        ],
        vibrate: [200, 100, 200], // Vibration pattern for mobile
        data: {
            url: targetUrl,
            actionUrls,
            raw: data,
            notificationType,
            timestamp: data.timestamp || String(Date.now()),
            // Include chat-specific data
            ...(notificationType === 'chat_message' && {
                from_user_id: data.from_user_id || '',
                from_user_name: data.from_user_name || '',
                message_id: data.message_id || '',
            }),
        },
        silent: false,
        renotify: true, // Allow renotification if tag matches (replaces previous notification)
    };

    console.log('[SW] Showing notification as floating window:', { 
        title, 
        body: body.substring(0, 50) + '...', 
        notificationType, 
        tag, 
        targetUrl,
        hasImage: !!image,
        hasIcon: !!icon,
        actionsCount: options.actions.length
    });
    
    // This displays the notification as a native browser floating window
    // The browser (Chrome, Firefox, Edge, etc.) will show it as a floating popup
    // matching the OS notification style (like the screenshot shows)
    return self.registration.showNotification(title, options);
});

// Handle notification click events
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event);
    
    event.notification.close();
    
    const action = event.action || 'open';
    const notif = event.notification;
    const data = (notif && notif.data) || {};
    const actionUrls = data.actionUrls || {};
    const notificationType = data.notificationType || '';

    // Handle dismiss action
    if (action === 'dismiss') {
        return;
    }

    // Handle chat message notifications (default action or click on notification body)
    if (notificationType === 'chat_message' && (action === 'open' || !action)) {
        const fromUserId = data.from_user_id;
        if (fromUserId) {
            const chatUrl = `/Chat?friendId=${encodeURIComponent(fromUserId)}`;
            event.waitUntil(
                clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                    for (const client of clientList) {
                        if (client.url && client.url.startsWith(self.location.origin) && 'focus' in client) {
                            client.focus();
                            client.postMessage({
                                type: 'NAVIGATE',
                                url: chatUrl,
                                notificationType: 'chat_message',
                                fromUserId: fromUserId
                            });
                            return;
                        }
                    }
                    return clients.openWindow(chatUrl);
                })
            );
            return;
        }
    }

    // Handle special actions (like accept friend request)
    if (action === 'accept' && notificationType === 'friend_request') {
        const friendRequestId = data.friend_request_id || data.notification_id;
        const fromUserId = data.from_user_id;
        if (friendRequestId || fromUserId) {
            // Open the app and let the frontend handle the accept action
            event.waitUntil(
                clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                    const targetUrl = fromUserId 
                        ? `/UserProfile?userId=${encodeURIComponent(fromUserId)}&action=accept&friendRequestId=${encodeURIComponent(friendRequestId || '')}`
                        : `/Dashboard?action=acceptFriendRequest&friendRequestId=${encodeURIComponent(friendRequestId || '')}`;
                    
                    for (const client of clientList) {
                        if (client.url && client.url.startsWith(self.location.origin) && 'focus' in client) {
                            client.focus();
                            client.postMessage({
                                type: 'NAVIGATE',
                                url: targetUrl,
                                action: 'acceptFriendRequest',
                                friendRequestId: friendRequestId || null,
                                fromUserId: fromUserId || null
                            });
                            return;
                        }
                    }
                    return clients.openWindow(targetUrl);
                })
            );
            return;
        }
    }

    // Handle join room action
    if (action === 'join' && notificationType === 'room_invite') {
        const roomId = data.room_id;
        if (roomId) {
            const targetUrl = `/JoinRoom?roomId=${encodeURIComponent(roomId)}`;
            event.waitUntil(
                clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                    for (const client of clientList) {
                        if (client.url && client.url.startsWith(self.location.origin) && 'focus' in client) {
                            client.focus();
                            client.postMessage({
                                type: 'NAVIGATE',
                                url: targetUrl
                            });
                            return;
                        }
                    }
                    return clients.openWindow(targetUrl);
                })
            );
            return;
        }
    }

    // Default: open URL based on action or default URL
    // For chat messages, we already handled above, so this is for other types or when action is specified
    if (notificationType !== 'chat_message' || (action && action !== 'open' && action !== 'dismiss')) {
        let targetUrl = action && actionUrls[action] ? actionUrls[action] : (data.url || '/Dashboard');
        
        // Ensure relative URLs are handled correctly
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            const baseUrl = self.location.origin;
            targetUrl = targetUrl.startsWith('/') ? baseUrl + targetUrl : baseUrl + '/' + targetUrl;
        }

        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                // Try to find an existing window with the same origin
                for (const client of clientList) {
                    if (client.url && client.url.startsWith(self.location.origin) && 'focus' in client) {
                        // Client exists, focus it and post message to navigate
                        client.focus();
                        // Send message to navigate (client-side should listen for this)
                        client.postMessage({
                            type: 'NAVIGATE',
                            url: targetUrl,
                            notificationType: notificationType,
                            action: action || 'default'
                        });
                        return;
                    }
                }
                // No existing client found, open a new window
                if (clients.openWindow) {
                    return clients.openWindow(targetUrl);
                }
            }).catch((err) => {
                console.error('[SW] Error handling notification click:', err);
            })
        );
    }
});

// Handle notification close (optional)
self.addEventListener('notificationclose', (event) => {
    console.log('[SW] Notification closed:', event.notification.tag);
    // Could send analytics here if needed
});

// Handle push events (if needed for additional handling)
self.addEventListener('push', (event) => {
    console.log('[SW] Push event received:', event);
    // The onBackgroundMessage handler will handle most cases
    // This is here for additional processing if needed
});

