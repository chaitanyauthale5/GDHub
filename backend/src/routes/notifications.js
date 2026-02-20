const express = require('express');
const Notification = require('../models/Notification');
const { sendPushToUser } = require('../utils/pushNotifications');

function toPlain(doc) {
    if (!doc) return null;
    const obj = doc.toObject ? doc.toObject() : doc;
    const id = (obj._id || obj.id || '').toString();
    const createdAt = obj.createdAt || obj.created_date || obj.created_at;
    const plain = { ...obj, id };
    if (createdAt) plain.created_date = createdAt;
    delete plain._id;
    delete plain.__v;
    return plain;
}

const router = express.Router();

router.get('/', async (req, res) => {
    const filter = { ...req.query };
    Object.keys(filter).forEach((k) => { if (filter[k] === 'true') filter[k] = true; if (filter[k] === 'false') filter[k] = false; });
    const items = await Notification.find(filter).sort(req.query.sort || '-createdAt');
    res.json(items.map(toPlain));
});

router.get('/:id', async (req, res) => {
    const item = await Notification.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(toPlain(item));
});

router.post('/', async (req, res) => {
    const created = await Notification.create(req.body || {});
    const plain = toPlain(created);

    // Realtime socket emit (in-app)
    try {
        const io = req.app.get('io');
        const userId = plain?.user_id;
        if (io && userId) {
            io.to(`user:${userId}`).emit('notification_created', { notification: plain });
        }
    } catch { }

    // Web push via FCM (device-level)
    try {
        const userId = plain?.user_id;
        if (userId) {
            const notificationType = plain.type || '';
            let targetUrl = '/Dashboard';
            let actions = [
                { action: 'open', title: 'Open' },
                { action: 'dismiss', title: 'Dismiss' },
            ];
            let actionUrls = { open: targetUrl };

            // Determine target URL and actions based on notification type
            switch (notificationType) {
                case 'chat_message':
                    targetUrl = plain.from_user_id 
                        ? `/Chat?friendId=${encodeURIComponent(plain.from_user_id)}` 
                        : '/Chat';
                    actions = [
                        { action: 'open', title: 'View Message' },
                        { action: 'dismiss', title: 'Dismiss' },
                    ];
                    actionUrls = { open: targetUrl };
                    break;
                case 'friend_request':
                    targetUrl = plain.from_user_id 
                        ? `/UserProfile?userId=${encodeURIComponent(plain.from_user_id)}` 
                        : '/Dashboard';
                    actions = [
                        { action: 'accept', title: 'Accept' },
                        { action: 'view', title: 'View Profile' },
                        { action: 'dismiss', title: 'Dismiss' },
                    ];
                    actionUrls = {
                        accept: targetUrl + '&action=accept',
                        view: targetUrl,
                    };
                    break;
                case 'room_invite':
                    targetUrl = plain.room_id 
                        ? `/JoinRoom?roomId=${encodeURIComponent(plain.room_id)}` 
                        : '/BrowseRooms';
                    actions = [
                        { action: 'join', title: 'Join Room' },
                        { action: 'view', title: 'View Rooms' },
                        { action: 'dismiss', title: 'Dismiss' },
                    ];
                    actionUrls = {
                        join: targetUrl,
                        view: '/BrowseRooms',
                    };
                    break;
                default:
                    // Default URL from notification or Dashboard
                    targetUrl = plain.url || '/Dashboard';
                    actionUrls = { open: targetUrl };
            }

            await sendPushToUser(userId, {
                title: plain.title || 'SpeakUp',
                body: plain.message || '',
                url: targetUrl,
                icon: '/logo.png',
                badge: '/logo.png',
                tag: `notification-${plain.id}`,
                priority: 'high',
                requireInteraction: notificationType === 'friend_request' || notificationType === 'room_invite',
                actions,
                actionUrls,
                data: {
                    notificationId: plain.id,
                    type: notificationType,
                    room_id: plain.room_id || '',
                    from_user_id: plain.from_user_id || '',
                }
            });
        }
    } catch (pushError) {
        console.error('[push] Failed to send push notification:', pushError);
    }

    res.status(201).json(plain);
});

router.patch('/:id', async (req, res) => {
    const updated = await Notification.findByIdAndUpdate(req.params.id, req.body || {}, { new: true });
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json(toPlain(updated));
});

router.delete('/:id', async (req, res) => {
    const deleted = await Notification.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
});

module.exports = router;
