const PushToken = require('../models/PushToken');
const firebaseAdmin = require('./firebaseAdmin');

/**
 * Convert relative URL to absolute URL for web push notifications
 * Chrome requires absolute URLs for images and icons in notifications
 */
function toAbsoluteUrl(path, baseUrl) {
    if (!path) return path;
    if (typeof path !== 'string') return String(path);
    
    // If already absolute URL, return as is
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
        return path;
    }
    
    // Get base URL from environment, CORS origins, or use default
    let base = baseUrl;
    if (!base) {
        const corsOrigins = process.env.CORS_ORIGIN || 'http://localhost:5173';
        const origins = corsOrigins.split(',').map(s => s.trim()).filter(Boolean);
        base = origins[0] || process.env.FRONTEND_URL || process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
    }
    
    // Remove trailing slash from base
    const cleanBase = base.replace(/\/$/, '');
    // Ensure path starts with /
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    
    return cleanBase + cleanPath;
}

/**
 * Send push notification to a user with improved error handling and retry logic
 * @param {string} userId - User ID to send notification to
 * @param {object} options - Notification options
 * @param {number} retries - Number of retry attempts (default: 0)
 */
async function sendPushToUser(userId, { title, body, data, url, icon, badge, image, actions, actionUrls, requireInteraction, tag, priority } = {}, retries = 0) {
    if (!userId) return { success: false, reason: 'missing_user' };

    try {
        const tokens = await PushToken.find({ user_id: String(userId) }).select('token').lean();
        const tokenList = (tokens || []).map(t => t.token).filter(Boolean);
        if (!tokenList.length) {
            console.log(`[push] No tokens found for user: ${userId}`);
            return { success: false, reason: 'no_tokens' };
        }

        const safeData = Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [String(k), v == null ? '' : String(v)]));
        const finalUrl = String(url || safeData.url || safeData.link || '/Dashboard');
        
        // Convert relative URLs to absolute URLs (required for Chrome notifications)
        const finalIcon = toAbsoluteUrl(icon || safeData.icon || '/logo.png');
        const finalBadge = toAbsoluteUrl(badge || safeData.badge || '/logo.png');
        const finalImage = image && String(image).trim() ? toAbsoluteUrl(String(image)) : undefined;
        
        // Parse actions if string, otherwise use array
        let finalActions = [];
        if (actions) {
            if (typeof actions === 'string') {
                try {
                    finalActions = JSON.parse(actions);
                } catch {
                    finalActions = [];
                }
            } else if (Array.isArray(actions)) {
                finalActions = actions;
            }
        }
        if (!Array.isArray(finalActions) || finalActions.length === 0) {
            finalActions = [
                { action: 'open', title: 'Open Admin' },
                { action: 'dismiss', title: 'Dismiss' }
            ];
        }

        // Parse actionUrls
        let finalActionUrls = {};
        if (actionUrls) {
            if (typeof actionUrls === 'string') {
                try {
                    finalActionUrls = JSON.parse(actionUrls);
                } catch {
                    finalActionUrls = {};
                }
            } else if (typeof actionUrls === 'object') {
                finalActionUrls = actionUrls;
            }
        }
        if (!finalActionUrls.open) {
            finalActionUrls.open = finalUrl;
        }

        // Build FCM payload with both notification (for foreground) and data (for background)
        const payload = {
            tokens: tokenList,
            notification: {
                title: String(title || 'SpeakUp'),
                body: String(body || ''),
                icon: finalIcon,
                badge: finalBadge,
                image: finalImage,
                tag: tag || `notification-${Date.now()}`,
                requireInteraction: requireInteraction === true || String(safeData.requireInteraction || '') === 'true',
                priority: priority || 'high',
            },
            data: {
                ...safeData,
                _title: String(title || 'SpeakUp'),
                _body: String(body || ''),
                url: finalUrl,
                icon: finalIcon,
                badge: finalBadge,
                image: finalImage || '',
                actions: JSON.stringify(finalActions),
                actionUrls: JSON.stringify(finalActionUrls),
                requireInteraction: String(requireInteraction === true || String(safeData.requireInteraction || '') === 'true'),
                timestamp: String(Date.now()),
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'speakup_notifications',
                    priority: 'high',
                    defaultSound: true,
                    defaultVibrateTimings: true,
                }
            },
            webpush: {
                notification: {
                    title: String(title || 'SpeakUp'),
                    body: String(body || ''),
                    icon: finalIcon,
                    badge: finalBadge,
                    image: finalImage, // Large image displayed at top (like in screenshot)
                    tag: tag || `notification-${Date.now()}`,
                    requireInteraction: requireInteraction === true,
                    silent: false,
                    renotify: true,
                    vibrate: [200, 100, 200],
                    timestamp: Date.now(),
                    // Actions must be valid and properly formatted
                    actions: finalActions.map((act, idx) => ({
                        action: act.action || `action${idx}`,
                        title: act.title || 'Action',
                        icon: act.icon || undefined,
                    })),
                },
                fcmOptions: {
                    link: finalUrl.startsWith('http') ? finalUrl : toAbsoluteUrl(finalUrl),
                },
                headers: {
                    Urgency: 'high',
                }
            },
            apns: {
                payload: {
                    aps: {
                        alert: {
                            title: String(title || 'SpeakUp'),
                            body: String(body || ''),
                        },
                        sound: 'default',
                        badge: 1,
                    }
                }
            }
        };

        // Send notification
        const resp = await firebaseAdmin.messaging().sendEachForMulticast(payload);
        const invalidTokens = [];
        const errors = [];
        
        (resp.responses || []).forEach((r, idx) => {
            if (!r.success) {
                const code = r.error && r.error.code;
                const errorMsg = r.error && r.error.message ? r.error.message : 'Unknown error';
                errors.push({ token: tokenList[idx], code, message: errorMsg });
                
                if (code === 'messaging/registration-token-not-registered' || 
                    code === 'messaging/invalid-registration-token' ||
                    code === 'messaging/registration-token-not-registered') {
                    invalidTokens.push(tokenList[idx]);
                }
            }
        });

        // Clean up invalid tokens
        if (invalidTokens.length) {
            try {
                await PushToken.deleteMany({ token: { $in: invalidTokens } });
                console.log(`[push] Removed ${invalidTokens.length} invalid tokens for user: ${userId}`);
            } catch (cleanupError) {
                console.error('[push] Error cleaning up invalid tokens:', cleanupError);
            }
        }

        const result = {
            success: resp.successCount > 0,
            sent: resp.successCount || 0,
            failed: resp.failureCount || 0,
            removed: invalidTokens.length,
            errors: errors.length > 0 ? errors : undefined
        };

        // Retry logic for transient errors
        if (result.failed > 0 && retries < 2 && resp.failureCount > 0) {
            const retryableErrors = errors.filter(e => 
                e.code === 'messaging/unavailable' || 
                e.code === 'messaging/internal-error' ||
                e.message?.includes('timeout')
            );
            if (retryableErrors.length > 0) {
                console.log(`[push] Retrying ${retryableErrors.length} failed notifications for user: ${userId}`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (retries + 1))); // Exponential backoff
                return sendPushToUser(userId, { title, body, data, url, icon, badge, image, actions, actionUrls, requireInteraction, tag, priority }, retries + 1);
            }
        }

        if (result.success) {
            console.log(`[push] Successfully sent ${result.sent} notification(s) to user: ${userId}`);
        } else if (result.failed > 0) {
            console.warn(`[push] Failed to send ${result.failed} notification(s) to user: ${userId}`, errors);
        }

        return result;
    } catch (e) {
        console.error('[push] sendPushToUser error:', e);
        return {
            success: false,
            reason: 'send_failed',
            error: e && e.message ? e.message : String(e),
            code: e && e.code ? e.code : null,
        };
    }
}

/**
 * Send push notification to multiple users (batch operation)
 */
async function sendPushToMultipleUsers(userIds, options) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
        return { success: false, reason: 'invalid_user_ids' };
    }

    const results = await Promise.allSettled(
        userIds.map(userId => sendPushToUser(userId, options))
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;

    return {
        success: successful > 0,
        total: userIds.length,
        successful,
        failed,
        results: results.map((r, idx) => ({
            userId: userIds[idx],
            status: r.status,
            result: r.status === 'fulfilled' ? r.value : { error: r.reason }
        }))
    };
}

module.exports = { sendPushToUser, sendPushToMultipleUsers };
