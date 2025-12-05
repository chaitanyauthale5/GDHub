const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const config = require('./config');
const connectDB = require('./db');
const createCrudRouter = require('./routes/crud');
const { sendTournamentRegistrationEmail, sendJudgeInviteEmail, sendTimeSlotEmail } = require('./utils/mailer');

const User = require('./models/User');
const UserProfile = require('./models/UserProfile');
const FriendRequest = require('./models/FriendRequest');
const Notification = require('./models/Notification');
const Tournament = require('./models/Tournament');
const TournamentRegistration = require('./models/TournamentRegistration');
const TournamentAccessToken = require('./models/TournamentAccessToken');
const GDRoom = require('./models/GDRoom');
const GDTranscript = require('./models/GDTranscript');
const DebateRoom = require('./models/DebateRoom');
const GDSession = require('./models/GDSession');
const ExtemporeSession = require('./models/ExtemporeSession');
const AIInterview = require('./models/AIInterview');
const ChatMessage = require('./models/ChatMessage');
const ExtemporeTopic = require('./models/ExtemporeTopic');
const ExtemporeMessage = require('./models/ExtemporeMessage');
const SoloPracticeSession = require('./models/SoloPracticeSession');
const AIInterviewSession = require('./models/AIInterviewSession');

const authRoutes = require('./routes/auth');
const tokenRoutes = require('./routes/token');
const globalGdRoutes = require('./routes/globalGd');
const extemporeGeminiRoutes = require('./routes/extemporeGemini');
const aiAnalysisRoutes = require('./routes/aiAnalysis');
const auth = require('./middleware/auth');

const app = express();

const corsOptions = {
    origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (config.corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
    },
    credentials: true
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/global-gd', globalGdRoutes);
app.use('/api/extempore', extemporeGeminiRoutes);
app.use('/api/ai-analysis', aiAnalysisRoutes);

app.use('/api/users', createCrudRouter(User));
app.use('/api/user-profiles', createCrudRouter(UserProfile));
app.use('/api/friend-requests', createCrudRouter(FriendRequest));
app.use('/api/notifications', createCrudRouter(Notification));
app.use('/api/tournaments', createCrudRouter(Tournament));
app.use('/api/tournament-registrations', createCrudRouter(TournamentRegistration));
app.use('/api/gd-rooms', createCrudRouter(GDRoom));
app.use('/api/gd-transcripts', createCrudRouter(GDTranscript));
app.use('/api/debate-rooms', createCrudRouter(DebateRoom));
app.use('/api/gd-sessions', createCrudRouter(GDSession));
app.use('/api/extempore-sessions', createCrudRouter(ExtemporeSession));
app.use('/api/ai-interviews', createCrudRouter(AIInterview));
app.use('/api/chat-messages', createCrudRouter(ChatMessage));
app.use('/api/extempore-topics', createCrudRouter(ExtemporeTopic));
app.use('/api/extempore-messages', createCrudRouter(ExtemporeMessage));
app.use('/api/solo-practice-sessions', createCrudRouter(SoloPracticeSession));
app.use('/api/zego', tokenRoutes);
app.use('/api/ai-interview-sessions', createCrudRouter(AIInterviewSession));

app.post('/api/friend-requests/:id/accept', async (req, res) => {
    const fr = await FriendRequest.findById(req.params.id);
    if (!fr) return res.status(404).json({ message: 'Not found' });
    fr.status = 'accepted';
    await fr.save();
    const me = await UserProfile.findOne({ user_id: fr.to_user_id });
    const other = await UserProfile.findOne({ user_id: fr.from_user_id });
    if (me) {
        me.friends = Array.from(new Set([...(me.friends || []), fr.from_user_id]));
        await me.save();
    }
    if (other) {
        other.friends = Array.from(new Set([...(other.friends || []), fr.to_user_id]));
        await other.save();
    }
    await Notification.create({ user_id: fr.from_user_id, type: 'friend_request', title: 'Friend Request Accepted', message: 'Your request was accepted', from_user_id: fr.to_user_id, is_read: false });
    res.json({ success: true });
});

app.post('/api/gd-rooms/:id/join', async (req, res) => {
    const { user_id, user_name } = req.body || {};
    if (!user_id) return res.status(400).json({ message: 'Missing user_id' });
    const room = await GDRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Not found' });
    const now = new Date();
    const idx = (room.participants || []).findIndex(p => p.user_id === user_id);
    if (idx === -1) {
        room.participants.push({ user_id, name: user_name, joined_at: now });
    } else {
        // Ensure joined_at is set when user re-joins
        if (!room.participants[idx].joined_at) room.participants[idx].joined_at = now;
        if (!room.participants[idx].name && user_name) room.participants[idx].name = user_name;
    }
    await room.save();
    res.json(room);
});

function generateTournamentPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pwd = '';
    for (let i = 0; i < 8; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
}

app.post('/api/tournaments/:id/register', async (req, res) => {
    try {
        const { user_id, user_name, user_email, group_number, accepted_rules } = req.body || {};
        if (!user_id || !user_email) return res.status(400).json({ message: 'Missing user details' });
        if (!accepted_rules) return res.status(400).json({ message: 'You must accept the tournament rules to register' });

        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        // Prevent the host/organiser from registering as a participant
        if (String(user_id) === String(tournament.host_id)) {
            return res.status(400).json({ message: 'Host cannot register as a participant' });
        }

        if (tournament.status !== 'registering') {
            return res.status(400).json({ message: 'Registration is not open for this tournament' });
        }

        const tournamentIdStr = tournament._id.toString();

        const existing = await TournamentRegistration.findOne({ tournament_id: tournamentIdStr, user_id });
        if (existing) {
            return res.status(409).json({ message: 'User already registered for this tournament', registration: existing });
        }

        if (tournament.max_participants) {
            const count = await TournamentRegistration.countDocuments({ tournament_id: tournamentIdStr });
            if (count >= tournament.max_participants) {
                return res.status(400).json({ message: 'Tournament is full' });
            }
        }

        let password = (tournament.password || '').trim();
        if (!password) {
            password = generateTournamentPassword();
            tournament.password = password.toUpperCase();
            await tournament.save();
        }
        const normalizedPassword = password.toUpperCase();

        const registration = await TournamentRegistration.create({
            tournament_id: tournamentIdStr,
            tournament_code: tournament.tournament_id,
            user_id,
            user_name,
            user_email,
            password: normalizedPassword,
            status: 'registered',
            group_number,
            accepted_rules: true,
            accepted_at: new Date(),
        });

        const registrationId = registration._id.toString();

        await sendTournamentRegistrationEmail({
            to: user_email,
            userName: user_name || user_id,
            tournament,
            password: normalizedPassword,
            registrationId,
        });

        const plain = registration.toObject ? registration.toObject() : registration;
        res.status(201).json({ ...plain, id: registrationId });
    } catch (e) {
        console.error('Tournament registration error', e);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/debate-rooms/:id/join', async (req, res) => {
    const { user_id, user_name, side } = req.body || {};
    if (!user_id) return res.status(400).json({ message: 'Missing user_id' });
    const room = await DebateRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Not found' });
    const exists = (room.participants || []).some(p => p.user_id === user_id);
    if (!exists) {
        const normSide = ['for', 'against', 'neutral'].includes(side) ? side : 'neutral';
        room.participants.push({ user_id, name: user_name, side: normSide });
        await room.save();
    }
    res.json(room);
});

app.post('/api/tournaments/:id/start', async (req, res) => {
    const t = await Tournament.findById(req.params.id);
    if (!t) return res.status(404).json({ message: 'Not found' });
    t.status = 'active';
    await t.save();
    res.json(t);
});

app.post('/api/tournaments/:id/restart', async (req, res) => {
    const t = await Tournament.findById(req.params.id);
    if (!t) return res.status(404).json({ message: 'Not found' });
    // Reset to registering so participants can (re)join and organiser can re-prepare rooms
    t.status = 'registering';
    await t.save();
    res.json(t);
});

app.post('/api/tournament-registrations/:id/join', async (req, res) => {
    const reg = await TournamentRegistration.findById(req.params.id);
    if (!reg) return res.status(404).json({ message: 'Not found' });
    reg.status = 'joined';
    await reg.save();
    res.json(reg);
});

// ===== Organiser & Judge Access Tokens and Controls =====
function getDefaultFrontendBase() {
    const first = (config.corsOrigins || [])[0];
    if (first && /^https?:\/\//i.test(first)) return first;
    return 'http://localhost:5173';
}

function getAccessTokenFromReq(req) {
    const header = req.headers['x-access-token'] || '';
    const bearer = (req.headers['authorization'] || '').startsWith('Bearer ')
        ? req.headers['authorization'].slice(7)
        : '';
    return (header || bearer || req.query.accessToken || (req.body && req.body.accessToken) || '').toString();
}

function isExpired(date) {
    if (!date) return false;
    try { return new Date(date).getTime() < Date.now(); } catch { return true; }
}

async function validateAccessTokenForTournament(tokenStr, tournamentId) {
    if (!tokenStr) return null;
    const doc = await TournamentAccessToken.findOne({ token: tokenStr, tournament_id: tournamentId, revoked: { $ne: true } });
    if (!doc) return null;
    if (isExpired(doc.expires_at)) return null;
    return doc;
}

function makeRandomToken() {
    return crypto.randomBytes(24).toString('hex');
}

// Create an organiser magic link (host-only via auth)
app.post('/api/tournaments/:id/organiser-link', auth, async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (!req.user || tournament.host_id !== req.user.email) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        const { organiser_email, organiser_name, expires_in_hours = 72 } = req.body || {};
        const token = makeRandomToken();
        const expiresAt = new Date(Date.now() + Number(expires_in_hours) * 3600 * 1000);
        const created = await TournamentAccessToken.create({
            tournament_id: tournament._id.toString(),
            role: 'organiser',
            email: organiser_email || null,
            name: organiser_name || null,
            token,
            can_publish: false,
            expires_at: expiresAt,
        });
        const base = getDefaultFrontendBase();
        const url = `${base}/Organiser?tournamentId=${tournament._id.toString()}&token=${token}`;
        res.status(201).json({ token: created.token, url, expires_at: expiresAt.toISOString() });
    } catch (e) {
        console.error('organiser-link error', e);
        res.status(500).json({ message: 'Server error' });
    }
});

// Validate an access token for a tournament
app.get('/api/tournaments/:id/validate-access', async (req, res) => {
    try {
        const tokenStr = getAccessTokenFromReq(req);
        const doc = await validateAccessTokenForTournament(tokenStr, req.params.id);
        if (!doc) return res.status(401).json({ valid: false });
        res.json({ valid: true, role: doc.role, email: doc.email, name: doc.name, can_publish: !!doc.can_publish });
    } catch (e) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Validate organiser via authenticated session (host account)
app.get('/api/tournaments/:id/validate-organiser', auth, async (req, res) => {
    try {
        const t = await Tournament.findById(req.params.id);
        if (!t) return res.status(404).json({ message: 'Tournament not found' });
        if (!req.user || String(req.user.email) !== String(t.host_id)) {
            return res.status(403).json({ valid: false });
        }
        return res.json({ valid: true, role: 'organiser', email: req.user.email, name: req.user.full_name || req.user.name || null, can_publish: false });
    } catch (e) {
        return res.status(500).json({ message: 'Server error' });
    }
});

// Invite a judge (host via host_email or organiser via token)
app.post('/api/tournaments/:id/invite-judge', async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        let allowed = false;
        const tokenDoc = await validateAccessTokenForTournament(getAccessTokenFromReq(req), req.params.id);
        if (tokenDoc && tokenDoc.role === 'organiser') allowed = true;
        const { host_email } = req.body || {};
        if (!allowed && host_email && host_email === tournament.host_id) allowed = true;
        if (!allowed) return res.status(403).json({ message: 'Forbidden' });

        const { email, name, expires_in_hours = 72, frontendUrl } = req.body || {};
        if (!email) return res.status(400).json({ message: 'Missing judge email' });
        const token = makeRandomToken();
        const expiresAt = new Date(Date.now() + Number(expires_in_hours) * 3600 * 1000);
        const created = await TournamentAccessToken.create({
            tournament_id: tournament._id.toString(),
            role: 'judge',
            email,
            name: name || null,
            token,
            can_publish: false,
            expires_at: expiresAt,
        });

        // Track judges on tournament doc
        const exists = (tournament.judges || []).some(j => j.email === email);
        if (!exists) {
            tournament.judges = [...(tournament.judges || []), { email, name: name || null, status: 'invited', invited_at: new Date() }];
            await tournament.save();
        }

        const base = (frontendUrl && /^https?:\/\//i.test(frontendUrl)) ? frontendUrl : getDefaultFrontendBase();
        const inviteUrl = `${base}/JudgePanel?tournamentId=${tournament._id.toString()}&token=${token}`;
        try {
            await sendJudgeInviteEmail({ to: email, judgeName: name, tournament, inviteUrl });
        } catch (e) {
            console.warn('sendJudgeInviteEmail failed', e && e.message ? e.message : e);
        }
        res.status(201).json({ token: created.token, inviteUrl, expires_at: expiresAt.toISOString() });
    } catch (e) {
        console.error('invite-judge error', e);
        res.status(500).json({ message: 'Server error' });
    }
});

// Send custom time slot emails
app.post('/api/tournaments/:id/send-time-slot', async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        let allowed = false;
        const tokenDoc = await validateAccessTokenForTournament(getAccessTokenFromReq(req), req.params.id);
        if (tokenDoc && tokenDoc.role === 'organiser') allowed = true;
        const { host_email } = req.body || {};
        if (!allowed && host_email && host_email === tournament.host_id) allowed = true;
        if (!allowed) return res.status(403).json({ message: 'Forbidden' });

        const { registration_id, user_email, group_number, room_code, time_slot } = req.body || {};
        if (!time_slot) return res.status(400).json({ message: 'Missing time_slot' });

        const sendOne = async (reg) => {
            try {
                await sendTimeSlotEmail({
                    to: reg.user_email || reg.user_id,
                    userName: reg.user_name || reg.user_id,
                    tournament,
                    groupNumber: reg.group_number,
                    roomCode: room_code,
                    timeSlot: time_slot,
                });
            } catch (e) {
                console.warn('sendTimeSlotEmail failed for', reg.user_id, e && e.message ? e.message : e);
            }
        };

        if (registration_id) {
            const reg = await TournamentRegistration.findById(registration_id);
            if (!reg) return res.status(404).json({ message: 'Registration not found' });
            await sendOne(reg);
            return res.json({ success: true, sent: 1 });
        }

        if (user_email) {
            const regs = await TournamentRegistration.find({ tournament_id: tournament._id.toString(), user_id: user_email });
            await Promise.all(regs.map(sendOne));
            return res.json({ success: true, sent: regs.length });
        }

        if (group_number != null) {
            const regs = await TournamentRegistration.find({ tournament_id: tournament._id.toString(), group_number: Number(group_number) });
            await Promise.all(regs.map(sendOne));
            return res.json({ success: true, sent: regs.length });
        }

        return res.status(400).json({ message: 'Provide registration_id or user_email or group_number' });
    } catch (e) {
        console.error('send-time-slot error', e);
        res.status(500).json({ message: 'Server error' });
    }
});

async function hasOrganiserOrHostAccess(req, tournamentId) {
    const tokenDoc = await validateAccessTokenForTournament(getAccessTokenFromReq(req), tournamentId);
    if (tokenDoc && tokenDoc.role === 'organiser') return true;
    const { host_email } = req.body || {};
    if (host_email) {
        const t = await Tournament.findById(tournamentId);
        if (t && t.host_id === host_email) return true;
    }
    return false;
}

// Lobby controls for GD rooms
app.post('/api/gd-rooms/:id/start', async (req, res) => {
    const room = await GDRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Not found' });
    if (!(await hasOrganiserOrHostAccess(req, room.tournament_id))) return res.status(403).json({ message: 'Forbidden' });
    room.status = 'active';
    room.started_at = new Date();
    await room.save();
    res.json(room);
});

app.post('/api/gd-rooms/:id/stop', async (req, res) => {
    const room = await GDRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Not found' });
    if (!(await hasOrganiserOrHostAccess(req, room.tournament_id))) return res.status(403).json({ message: 'Forbidden' });
    room.status = 'completed';
    await room.save();
    res.json(room);
});

app.post('/api/gd-rooms/:id/restart', async (req, res) => {
    const room = await GDRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Not found' });
    if (!(await hasOrganiserOrHostAccess(req, room.tournament_id))) return res.status(403).json({ message: 'Forbidden' });
    room.status = 'lobby';
    room.started_at = null;
    await room.save();
    res.json(room);
});

app.post('/api/gd-rooms/:id/force-close', async (req, res) => {
    const room = await GDRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Not found' });
    if (!(await hasOrganiserOrHostAccess(req, room.tournament_id))) return res.status(403).json({ message: 'Forbidden' });
    room.status = 'completed';
    room.locked = true;
    await room.save();
    res.json(room);
});

// Lobby controls for Debate rooms
app.post('/api/debate-rooms/:id/start', async (req, res) => {
    const room = await DebateRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Not found' });
    if (!(await hasOrganiserOrHostAccess(req, room.tournament_id))) return res.status(403).json({ message: 'Forbidden' });
    room.status = 'active';
    await room.save();
    res.json(room);
});

app.post('/api/debate-rooms/:id/stop', async (req, res) => {
    const room = await DebateRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Not found' });
    if (!(await hasOrganiserOrHostAccess(req, room.tournament_id))) return res.status(403).json({ message: 'Forbidden' });
    room.status = 'completed';
    await room.save();
    res.json(room);
});

app.post('/api/debate-rooms/:id/restart', async (req, res) => {
    const room = await DebateRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Not found' });
    if (!(await hasOrganiserOrHostAccess(req, room.tournament_id))) return res.status(403).json({ message: 'Forbidden' });
    room.status = 'pending';
    await room.save();
    res.json(room);
});

app.post('/api/debate-rooms/:id/force-close', async (req, res) => {
    const room = await DebateRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Not found' });
    if (!(await hasOrganiserOrHostAccess(req, room.tournament_id))) return res.status(403).json({ message: 'Forbidden' });
    room.status = 'completed';
    await room.save();
    res.json(room);
});

app.use((err, req, res, next) => {
    res.status(500).json({ message: 'Server error' });
});

const http = require('http');
const { Server } = require('socket.io');

const { createDeepgramSession } = require('./services/deepgramRealtime');

const start = async () => {
    await connectDB(config.mongoUri);

    const server = http.createServer(app);
    const io = new Server(server, {
        cors: {
            origin: config.corsOrigins,
            methods: ["GET", "POST"],
            credentials: true
        }
    });

    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);
        // Track Deepgram sessions per socket
        const dgSessions = new Map(); // key: `${roomId}:${userId}` -> session

        socket.on('join_room', (room) => {
            socket.join(room);
            console.log(`User ${socket.id} joined room ${room}`);
        });

        socket.on('register_user', (userId) => {
            if (!userId) return;
            const roomName = `user:${userId}`;
            socket.join(roomName);
            console.log(`User ${socket.id} registered room ${roomName}`);
        });

        socket.on('friend_request_notification', (payload) => {
            if (!payload || !payload.to_user_id) return;
            const roomName = `user:${payload.to_user_id}`;
            io.to(roomName).emit('friend_request_notification', payload);
        });

        socket.on('room_invite_notification', (payload) => {
            if (!payload || !payload.to_user_id) return;
            const roomName = `user:${payload.to_user_id}`;
            io.to(roomName).emit('room_invite_notification', payload);
        });

        socket.on('send_message', (data) => {
            io.to(data.room).emit('receive_message', data);
            if (data && data.to_user_id) {
                const userRoom = `user:${data.to_user_id}`;
                io.to(userRoom).emit('chat_message_notification', data);
            }
        });

        socket.on('message_read', (payload = {}) => {
            const { message_id, from_user_id, to_user_id } = payload;
            if (!message_id || !from_user_id || !to_user_id) return;
            const fromRoom = `user:${from_user_id}`;
            const toRoom = `user:${to_user_id}`;
            io.to(fromRoom).emit('message_read', payload);
            io.to(toRoom).emit('message_read', payload);
        });

        // ==== GD Realtime Audio → Deepgram ====
        socket.on('gd_audio_start', async (payload = {}) => {
            try {
                const { roomId, userId, userName, language, mimeType } = payload;
                if (!roomId || !userId) return;
                const key = `${roomId}:${userId}`;
                if (dgSessions.has(key)) return;
                let topic;
                try { const r = await GDRoom.findById(roomId); topic = r?.topic; } catch { }
                // Always use Flux (v2). Map mimeType -> encoding
                const mt = String(mimeType || '').toLowerCase();
                let version = 'v2';
                let encoding = 'opus';
                let sampleRate = 48000;
                if (mt.includes('ogg')) encoding = 'ogg-opus';
                else if (mt.includes('webm')) encoding = 'opus';
                else if (mt.includes('linear16') || mt.includes('pcm')) { encoding = 'linear16'; sampleRate = 16000; }
                console.log(`[gd] audio_start room=${roomId} user=${userId} ver=${version} enc=${encoding} mime=${mimeType}`);
                const session = createDeepgramSession({ io, roomId, userId, userName, language, topic, version, encoding, sampleRate });
                dgSessions.set(key, session);
                socket.join(`gd:${roomId}`);
            } catch (e) {
                console.warn('[gd] audio_start error', e && e.message ? e.message : e);
            }
        });

        socket.on('gd_audio_chunk', (payload = {}) => {
            try {
                const { roomId, userId, data } = payload;
                if (!roomId || !userId || data === undefined || data === null) return;
                const key = `${roomId}:${userId}`;
                const session = dgSessions.get(key);
                if (!session) return;
                // socket.io may deliver Buffer, ArrayBuffer, or Uint8Array
                let buf;
                if (Buffer.isBuffer(data)) buf = data;
                else if (data?.buffer) buf = Buffer.from(data.buffer);
                else buf = Buffer.from(data);
                session.send(buf);
                if (buf && buf.length) {
                    if (Math.random() < 0.02) console.log(`[gd] chunk ${roomId}/${userId} bytes=${buf.length}`);
                }
            } catch { }
        });

        socket.on('gd_audio_stop', (payload = {}) => {
            try {
                const { roomId, userId } = payload;
                if (!roomId || !userId) return;
                const key = `${roomId}:${userId}`;
                const session = dgSessions.get(key);
                if (session) {
                    try { session.close(); } catch { }
                    dgSessions.delete(key);
                }
                console.log(`[gd] audio_stop room=${roomId} user=${userId}`);
            } catch { }
        });

        socket.on('disconnect', () => {
            try {
                for (const [, s] of dgSessions) {
                    try { s.close(); } catch { }
                }
                dgSessions.clear();
            } catch { }
        });
    });

    // Make io accessible in routes if needed
    app.set('io', io);

    server.listen(config.port, () => {
        console.log(`Server listening on http://localhost:${config.port}`);
    });
};

start();
