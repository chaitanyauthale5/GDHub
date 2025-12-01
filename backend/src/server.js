const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const connectDB = require('./db');
const createCrudRouter = require('./routes/crud');
const { sendTournamentRegistrationEmail } = require('./utils/mailer');

const User = require('./models/User');
const UserProfile = require('./models/UserProfile');
const FriendRequest = require('./models/FriendRequest');
const Notification = require('./models/Notification');
const Tournament = require('./models/Tournament');
const TournamentRegistration = require('./models/TournamentRegistration');
const GDRoom = require('./models/GDRoom');
const GDTranscript = require('./models/GDTranscript');
const DebateRoom = require('./models/DebateRoom');
const GDSession = require('./models/GDSession');
const ExtemporeSession = require('./models/ExtemporeSession');
const AIInterview = require('./models/AIInterview');
const ChatMessage = require('./models/ChatMessage');
const ExtemporeTopic = require('./models/ExtemporeTopic');
const SoloPracticeSession = require('./models/SoloPracticeSession');
const AIInterviewSession = require('./models/AIInterviewSession');

const authRoutes = require('./routes/auth');
const tokenRoutes = require('./routes/token');

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
    const exists = (room.participants || []).some(p => p.user_id === user_id);
    if (!exists) {
        room.participants.push({ user_id, name: user_name });
        await room.save();
    }
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

app.post('/api/tournament-registrations/:id/join', async (req, res) => {
    const reg = await TournamentRegistration.findById(req.params.id);
    if (!reg) return res.status(404).json({ message: 'Not found' });
    reg.status = 'joined';
    await reg.save();
    res.json(reg);
});

app.use((err, req, res, next) => {
    res.status(500).json({ message: 'Server error' });
});

const http = require('http');
const { Server } = require('socket.io');

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
    });

    // Make io accessible in routes if needed
    app.set('io', io);

    server.listen(config.port, () => {
        console.log(`Server listening on http://localhost:${config.port}`);
    });
};

start();
