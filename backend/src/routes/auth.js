const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const config = require('../config');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(cookieParser());

const signToken = (user) => jwt.sign({ id: user._id.toString(), email: user.email }, config.jwtSecret, { expiresIn: '7d' });

router.post('/register', async (req, res) => {
    try {
        const { email, password, full_name } = req.body || {};
        if (!email || !password || !full_name) return res.status(400).json({ message: 'Missing fields' });
        const exists = await User.findOne({ email });
        if (exists) return res.status(409).json({ message: 'Email already registered' });
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ email, passwordHash, full_name });
        await UserProfile.create({ user_id: user.email });
        const token = signToken(user);
        res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
        res.json({ token, user: { id: user._id.toString(), email: user.email, full_name: user.full_name, avatar: user.avatar, xp_points: user.xp_points, level: user.level } });
    } catch (e) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) return res.status(400).json({ message: 'Missing fields' });
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ message: 'Invalid credentials' });
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
        const token = signToken(user);
        res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
        res.json({ token, user: { id: user._id.toString(), email: user.email, full_name: user.full_name, avatar: user.avatar, xp_points: user.xp_points, level: user.level } });
    } catch (e) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/logout', auth, async (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

router.get('/me', auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Not found' });
    res.json({ id: user._id.toString(), email: user.email, full_name: user.full_name, avatar: user.avatar, xp_points: user.xp_points, level: user.level });
});

module.exports = router;
