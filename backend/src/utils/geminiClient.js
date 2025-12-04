const axios = require('axios');

function tryParseJson(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch { }
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
        try { return JSON.parse(text.slice(first, last + 1)); } catch { }
    }
    return null;
}

function buildPrompt({ topic, difficulty, durationSec, category, transcript }) {
    return `You are an expert extempore speaking coach.

Analyze the following extempore speech and return STRICT JSON only. No markdown, no prose, no code fences. Use this exact schema and key names:
{
  "overallScore": number,
  "fluencyScore": number,
  "structureScore": number,
  "contentScore": number,
  "deliveryScore": number,
  "openingTips": string,
  "closingTips": string,
  "strengths": string[],
  "improvements": string[],
  "detailedFeedback": string,
  "practiceTopics": string[]
}

Topic: ${topic || 'Extempore'}
Difficulty: ${difficulty || 'medium'}
Category: ${category || 'General'}
Speaking Duration (sec): ${durationSec || 0}

Transcript:
${transcript || '(empty)'}
`;
}

function clampScore(value, min, max) {
    const v = Math.round(Number.isFinite(value) ? value : 0);
    if (v < min) return min;
    if (v > max) return max;
    return v;
}

function buildHeuristicExtemporeAnalysis({ topic, durationSec, transcript }) {
    const raw = String(transcript || '').trim();
    if (!raw) {
        return {
            overallScore: 0,
            fluencyScore: 0,
            structureScore: 0,
            contentScore: 0,
            deliveryScore: 0,
            openingTips: 'Start your speech with a clear one-line introduction of the topic.',
            closingTips: 'End with a short summary and a confident closing line.',
            strengths: [],
            improvements: [
                'Record a short response on the topic so we can analyze it.',
                'Aim for at least 45–60 seconds of speaking time.'
            ],
            detailedFeedback: 'Once you record an extempore response, you will see a detailed breakdown here.',
            practiceTopics: ['Public speaking basics', 'Structuring short talks', 'Reducing filler words']
        };
    }

    const lower = raw.toLowerCase();
    const words = lower.match(/\b[a-z']+\b/gi) || [];
    const sentences = raw.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const fillerList = ['um', 'uh', 'like', 'you know', 'actually', 'basically', 'literally', 'so', 'well', 'right', 'okay', 'ok'];

    let fillerCount = 0;
    for (const w of fillerList) {
        const re = new RegExp(`\\b${w.replace(' ', '\\s+')}\\b`, 'gi');
        const matches = lower.match(re);
        if (matches) fillerCount += matches.length;
    }

    const avgSentenceLen = sentences.length ? words.length / sentences.length : words.length;
    const hasExamples = /(for example|for instance|e\.g\.|example)/i.test(lower);
    const hasSignposts = /(first|second|third|to begin with|next|finally|in conclusion|to summarize|overall)/i.test(lower);
    const hasClosure = /(in conclusion|to conclude|to summarize|overall|therefore)/i.test(lower);

    const fluencyScore = clampScore(100 - fillerCount * 3 - Math.max(0, Math.abs(avgSentenceLen - 18) * 2), 45, 98);
    const structureScore = clampScore(60 + (hasSignposts ? 18 : 0) + (hasClosure ? 12 : 0), 40, 96);
    const contentScore = clampScore(55 + (hasExamples ? 15 : 0) + Math.min(words.length / 5, 20), 45, 96);
    const deliveryScore = clampScore(55 - Math.min(fillerCount * 2, 30) + Math.min(words.length / 10, 20), 40, 95);
    const overallScore = Math.round((fluencyScore + structureScore + contentScore + deliveryScore) / 4);

    const strengths = [];
    if (words.length >= 80) strengths.push('Good speaking length with enough content to evaluate.');
    if (hasExamples) strengths.push('Used concrete examples to support your ideas.');
    if (hasSignposts) strengths.push('Used signposting words to organize your speech.');
    if (strengths.length === 0) strengths.push('Delivered ideas with an understandable flow.');

    const improvements = [];
    if (fillerCount > 0) improvements.push(`Reduce filler words (about ${fillerCount} found) to sound more confident.`);
    if (avgSentenceLen > 26) improvements.push('Shorten very long sentences to make points clearer.');
    if (avgSentenceLen < 8 && sentences.length > 1) improvements.push('Combine very short sentences to improve flow.');
    if (!hasExamples) improvements.push('Add at least one concrete example or story to make your speech memorable.');
    if (!hasSignposts) improvements.push('Use signposting words (first, next, finally) to guide the listener.');
    if (!hasClosure) improvements.push('End with a short conclusion that restates your main message.');

    const topicLabel = topic || 'this topic';
    const minutes = durationSec ? Math.max(1, Math.round(durationSec / 60)) : 1;

    const openingTips = `Start with a single clear line like “Today I will speak about ${topicLabel}”, then give a quick overview of your 2–3 main points.`;
    const closingTips = 'Finish by summarizing your key points in one or two sentences, then add a confident closing line such as “Therefore, we can see that…”.';

    const practiceTopics = [
        'Structuring a 1-minute extempore talk',
        'Reducing filler words while speaking',
        'Using examples to support your points',
        `${minutes}-minute practice on ${topicLabel}`
    ];

    return {
        overallScore,
        fluencyScore,
        structureScore,
        contentScore,
        deliveryScore,
        openingTips,
        closingTips,
        strengths,
        improvements,
        detailedFeedback: 'This analysis was generated locally using your transcript. Configure Gemini to unlock richer AI-powered insights.',
        practiceTopics
    };
}

async function analyzeExtemporeWithGemini({ topic, difficulty, category, durationSec, transcript, apiKey }) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    const prompt = buildPrompt({ topic, difficulty, category, durationSec, transcript });

    if (!key) {
        return buildHeuristicExtemporeAnalysis({ topic, durationSec, transcript });
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${encodeURIComponent(key)}`;
        const payload = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: prompt }]
                }
            ],
            generationConfig: {
                temperature: 0.7
            }
        };

        const resp = await axios.post(url, payload, { timeout: 60000 });
        const cand = resp?.data?.candidates?.[0];
        const text = cand?.content?.parts?.[0]?.text || '';
        const parsed = tryParseJson(text);
        if (parsed && typeof parsed === 'object') return parsed;

        return buildHeuristicExtemporeAnalysis({ topic, durationSec, transcript });
    } catch (e) {
        return buildHeuristicExtemporeAnalysis({ topic, durationSec, transcript });
    }
}

module.exports = { analyzeExtemporeWithGemini };
