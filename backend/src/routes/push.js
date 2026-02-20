const express = require('express');
const auth = require('../middleware/auth');
const PushToken = require('../models/PushToken');
const { sendPushToUser } = require('../utils/pushNotifications');

const router = express.Router();

router.post('/subscribe', auth, async (req, res) => {
    try {
        const { token, platform, user_agent } = req.body || {};
        if (!token) return res.status(400).json({ message: 'Missing token' });

        const doc = await PushToken.findOneAndUpdate(
            { token: String(token) },
            {
                $set: {
                    user_id: req.user.email,
                    token: String(token),
                    platform: platform || 'web',
                    user_agent: user_agent || req.headers['user-agent'] || null,
                    last_seen_at: new Date(),
                }
            },
            { new: true, upsert: true }
        );

        res.status(201).json({ success: true, id: doc._id.toString() });
    } catch (e) {
        console.error('push subscribe error', e);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/unsubscribe', auth, async (req, res) => {
    try {
        const { token } = req.body || {};
        if (!token) return res.status(400).json({ message: 'Missing token' });
        await PushToken.deleteOne({ token: String(token), user_id: req.user.email });
        res.json({ success: true });
    } catch (e) {
        console.error('push unsubscribe error', e);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/status', auth, async (req, res) => {
    try {
        const tokens = await PushToken.find({ user_id: req.user.email }).sort('-updatedAt').lean();
        res.json({
            user_id: req.user.email,
            count: (tokens || []).length,
            tokens: (tokens || []).map((t) => ({
                id: String(t._id || ''),
                token: String(t.token || '').slice(0, 12) + '…',
                platform: t.platform || null,
                last_seen_at: t.last_seen_at || null,
                createdAt: t.createdAt || null,
                updatedAt: t.updatedAt || null,
            }))
        });
    } catch (e) {
        console.error('push status error', e);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/test', auth, async (req, res) => {
    try {
        const { title, body, url, image, icon, badge, actions, actionUrls, requireInteraction } = req.body || {};
        
        // Default values that match the screenshot style
        const defaultTitle = title || 'New message: SpeakUp';
        const defaultBody = body || `Test notification • ${new Date().toLocaleTimeString()} • ${new Date().toLocaleDateString()}`;
        const defaultUrl = url || '/Dashboard';
        const defaultIcon = icon || '/logo.png';
        const defaultBadge = badge || '/logo.png';
        const defaultImage = image || undefined; // Optional large image
        
        const result = await sendPushToUser(req.user.email, {
            title: defaultTitle,
            body: defaultBody,
            url: defaultUrl,
            icon: defaultIcon,
            badge: defaultBadge,
            image: defaultImage,
            tag: `test-${Date.now()}`, // Unique tag for test notifications
            priority: 'high',
            requireInteraction: (requireInteraction === true) || String(requireInteraction || '') === 'true',
            actions: actions || [
                { action: 'open', title: 'Open Admin' },
                { action: 'dismiss', title: 'Dismiss' },
            ],
            actionUrls: actionUrls || { 
                open: defaultUrl,
            },
            data: {
                type: 'test',
                ts: String(Date.now()),
                url: defaultUrl,
            }
        });
        
        if (result && result.success) {
            console.log(`[push] Test notification sent to ${req.user.email}: ${result.sent} delivered`);
            res.json({ 
                success: true, 
                result,
                message: `Notification sent successfully! ${result.sent} notification(s) delivered.`
            });
            return;
        }
        
        console.warn(`[push] Test notification failed for ${req.user.email}:`, result?.reason || 'unknown');
        res.status(500).json({ 
            success: false, 
            result,
            message: result?.reason === 'no_tokens' 
                ? 'No push tokens registered. Please ensure notifications are enabled.' 
                : 'Failed to send test notification'
        });
    } catch (e) {
        console.error('[push] Test notification error:', e);
        res.status(500).json({ 
            message: 'Failed to send test push', 
            error: e?.message || String(e) 
        });
    }
});

module.exports = router;
