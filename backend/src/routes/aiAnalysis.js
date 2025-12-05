const express = require('express');
const router = express.Router();
const { analyzeGDParticipantWithGemini } = require('../utils/geminiClient');

router.post('/gd-participant', async (req, res) => {
    try {
        const { topic, transcript, durationSec } = req.body || {};
        const apiKey = req.headers['x-gemini-key'] || process.env.GEMINI_API_KEY;
        console.log(`[AI Analysis] Request for topic "${topic}". Duration: ${durationSec}s. Key present: ${!!apiKey}`);

        const analysis = await analyzeGDParticipantWithGemini({
            topic: topic || 'Group Discussion',
            transcript: transcript || '',
            durationSec: Number(durationSec || 0),
            apiKey
        });

        return res.json(analysis);
    } catch (e) {
        console.error('GD participant analysis route error', e);
        return res.status(500).json({ message: 'Analysis failed' });
    }
});

module.exports = router;
