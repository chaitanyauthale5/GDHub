const express = require('express');
const router = express.Router();
const ExtemporeSession = require('../models/ExtemporeSession');
const ExtemporeMessage = require('../models/ExtemporeMessage');
const { analyzeExtemporeWithGemini } = require('../utils/geminiClient');

router.post('/sessions/:id/analyze', async (req, res) => {
    try {
        const id = req.params.id;
        const session = await ExtemporeSession.findById(id);
        if (!session) return res.status(404).json({ message: 'Session not found' });

        const sid = session._id?.toString() || id;
        let transcript = (session.transcript || '').trim();
        if (!transcript) {
            const msgs = await ExtemporeMessage.find({ session_id: sid }).sort('createdAt');
            transcript = msgs.map((m) => (m.text || '')).join(' ').trim();
        }

        const apiKey = req.body?.apiKey || req.headers['x-gemini-key'] || process.env.GEMINI_API_KEY;
        const analysis = await analyzeExtemporeWithGemini({
            topic: session.topic || 'Extempore',
            difficulty: session.difficulty || 'medium',
            category: session.category || 'General',
            durationSec: Number(session.speaking_duration || 0),
            transcript,
            apiKey,
        });

        try {
            session.ai_feedback = JSON.stringify(analysis);
            session.strengths = Array.isArray(analysis.strengths) ? analysis.strengths : [];
            session.improvements = Array.isArray(analysis.improvements) ? analysis.improvements : [];
            await session.save();
        } catch { }

        return res.json({ success: true, analysis });
    } catch (e) {
        console.error('Gemini analysis error', e);
        return res.status(500).json({ message: 'Failed to analyze extempore' });
    }
});

module.exports = router;
