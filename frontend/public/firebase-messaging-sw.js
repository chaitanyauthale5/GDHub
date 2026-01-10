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

messaging.onBackgroundMessage((payload) => {
    const data = payload?.data || {};
    const title = data._title || payload?.notification?.title || 'SpeakUp';
    const body = data._body || payload?.notification?.body || '';
    let actions = [];
    try {
        if (data.actions) actions = JSON.parse(data.actions);
    } catch { }
    // Fallback actions to match the sample UI
    if (!Array.isArray(actions) || actions.length === 0) {
        actions = [
            { action: 'open_admin', title: 'Open Admin' },
            { action: 'dismiss', title: 'Dismiss' },
        ];
    }

    const url = data.url || '/';
    const options = {
        body,
        icon: data.icon || '/logo.png',
        badge: data.badge || '/logo.png',
        image: (data.image && String(data.image).trim()) ? String(data.image) : undefined,
        actions,
        requireInteraction: String(data.requireInteraction || '') === 'true',
        data: {
            url, actionUrls: (() => {
                try { return data.actionUrls ? JSON.parse(data.actionUrls) : {}; } catch { return {}; }
            })(), raw: data
        },
    };
    self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
    const action = event.action || '';
    const notif = event.notification;
    const data = (notif && notif.data) || {};
    const actionUrls = data.actionUrls || {};

    // Dismiss action: close only
    if (action === 'dismiss') {
        notif?.close();
        return;
    }

    const url = action && actionUrls[action] ? actionUrls[action] : (data.url || '/');
    notif?.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    client.navigate(url);
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow(url);
            return null;
        })
    );
});
