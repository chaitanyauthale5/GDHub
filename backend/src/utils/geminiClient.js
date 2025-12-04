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

function isTooShort(durationSec, transcript) {
    const raw = String(transcript || '').trim();
    const words = raw.toLowerCase().match(/\b[a-z']+\b/g) || [];
    const dur = Number(durationSec) || 0;
    return raw.length < 10 || words.length < 5 || dur < 5;
}

function buildZeroAnalysis({ topic, transcript }) {
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
            'Record a short response so we can analyze it.',
            'Aim for at least 10–15 seconds and ~20+ words.'
        ],
        detailedFeedback: 'Input was too short to evaluate. Please speak longer to get a proper score.',
        practiceTopics: ['Public speaking basics', 'Structuring short talks', 'Reducing filler words'],
        rawTranscript: String(transcript || ''),
        highlights: []
    };
}

function buildTranscriptHighlights(raw) {
    const text = String(raw || '');
    if (!text) return [];

    const lower = text.toLowerCase();
    const mkRegex = (phrase) => {
        const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const wb = /\w$/.test(phrase[0]) ? '\\b' : '';
        const we = /\w$/.test(phrase[phrase.length - 1]) ? '\\b' : '';
        return new RegExp(`${wb}${esc}${we}`, 'gi');
    };

    const badPhrases = ['um', 'uh', 'you know', 'like', 'actually', 'basically', 'literally', 'so', 'well', 'right', 'okay', 'ok'];
    const goodSignposts = ['first', 'second', 'third', 'to begin with', 'next', 'finally', 'in conclusion', 'to summarize', 'overall', 'also', 'additionally', 'moreover', 'furthermore', 'another'];
    const goodExamples = ['for example', 'for instance', 'e.g.', 'example'];
    const goodAssertive = ['i will', 'i can', 'i did', 'we will', 'we can', 'therefore'];
    const goodTransitions = ['however', 'on the other hand', 'nevertheless'];
    const weakTransitions = ['anyway', 'moving on', 'so yeah'];
    const hedgePhrases = ['maybe', 'perhaps', 'i think', 'i guess', 'sort of', 'kind of', 'probably', 'somewhat', 'a bit', 'i feel like', 'in my opinion'];
    const weaselWords = ['very', 'really', 'basically', 'literally', 'stuff', 'things', 'just'];

    const collect = (phrases, label, reason, category, suggestion, pointAction) => {
        const out = [];
        for (const p of phrases) {
            const re = mkRegex(p);
            let m;
            while ((m = re.exec(lower)) !== null) {
                out.push({
                    start: m.index,
                    end: m.index + m[0].length,
                    label,
                    reason: `${reason}: "${p}"`,
                    category,
                    suggestion,
                    pointAction
                });
                // Avoid zero-width loops
                if (re.lastIndex === m.index) re.lastIndex++;
            }
        }
        return out;
    };

    const collectRegex = (regex, label, reason, category, suggestion, pointAction) => {
        const out = [];
        let m;
        regex.lastIndex = 0;
        while ((m = regex.exec(lower)) !== null) {
            const start = m.index;
            const end = m.index + m[0].length;
            out.push({ start, end, label, reason, category, suggestion, pointAction });
            if (regex.lastIndex === m.index) regex.lastIndex++;
        }
        return out;
    };

    const items = [
        ...collect(badPhrases, 'bad', 'Filler or weak phrasing', 'filler', 'Replace the filler with a brief 1–2s pause or use a clear connector (e.g., “Therefore,” “Next,”).'),
        ...collect(goodSignposts, 'good', 'Signposting/structure', 'signpost', 'Good signpost. Keep guiding the listener with clear structure.', 'added'),
        ...collect(goodExamples, 'good', 'Example indicator', 'example', 'Nice example. Consider adding a concise metric or detail to strengthen it.'),
        ...collect(goodAssertive, 'good', 'Assertive/clarifying phrase', 'assertive', 'Confident tone. Balance with one specific fact or example.'),
        ...collect(goodTransitions, 'good', 'Contrast/transition', 'transition', 'Good contrast marker. Briefly summarize the shift (e.g., “However, a challenge is…”).', 'cut'),
        ...collect(weakTransitions, 'bad', 'Abrupt transition', 'transition', 'Use a specific signpost instead (e.g., “Next,” “Another point,” “However,”).', 'cut'),
        ...collect(hedgePhrases, 'bad', 'Hedging/uncertain phrasing', 'hedge', 'Be more direct. Replace with a clear statement or a short pause.'),
        ...collect(weaselWords, 'bad', 'Vague/weasel word', 'weasel', 'Replace with a specific descriptor or remove extraneous intensifiers.'),
        // Data, metrics, and numbers
        ...collectRegex(/\b(\d+(?:\.\d+)?)\s?(%|percent|years?|mins?|minutes?|hrs?|hours|rupees|rs|₹|\$)\b/gi, 'good', 'Specific data or metric', 'data', 'Good use of specifics. Tie it to your main point.'),
        ...collectRegex(/\b(19|20)\d{2}\b/gi, 'good', 'Specific year', 'data', 'Contextualize the date with its significance.'),
        // Passive voice (approximate)
        ...collectRegex(/\b(was|were|is|are|be|been|being)\s+[a-z]+(?:ed|en)\b(?:\s+by\b)?/gi, 'bad', 'Possible passive voice', 'passive', 'Prefer active voice where possible (e.g., “We completed the report”).'),
        // Repetition of same word 3+ times
        ...collectRegex(/\b(\w+)\b(?:\s+\1){2,}/gi, 'bad', 'Word repeated many times', 'repetition', 'Reduce repetition or replace with synonyms.'),
        // Engagement cues
        ...collect(['imagine', 'consider', 'what if', 'have you ever'], 'good', 'Audience engagement', 'engagement', 'Good engagement. Follow with a concise example.'),
        // Causality connectors
        ...collect(['because', 'as a result', 'consequently', 'thus'], 'good', 'Causal reasoning', 'causality', 'Good causal link. Ensure the cause-effect is clear.')
    ].sort((a, b) => a.start - b.start || b.end - a.end);

    // Run-on sentences: highlight very long sentences (> 35 words)
    try {
        const sentenceRegex = /[^.!?]+[.!?]?/g;
        let sm;
        let idx = 0;
        while ((sm = sentenceRegex.exec(text)) !== null) {
            const s = sm[0];
            const start = sm.index;
            const end = start + s.length;
            const wc = (s.toLowerCase().match(/\b[a-z']+\b/g) || []).length;
            if (wc > 35) {
                items.push({ start, end, label: 'bad', reason: 'Very long sentence (possible run-on)', category: 'runon', suggestion: 'Split into two or more sentences for clarity.' });
            }
            // Weak sentence starts ('and', 'but', 'so')
            const leading = s.trimStart();
            const off = s.length - leading.length;
            const m = leading.match(/^(and|but|so)\b/i);
            if (m) {
                const w = m[0];
                items.push({ start: start + off, end: start + off + w.length, label: 'bad', reason: 'Weak sentence start', category: 'weakStart', suggestion: 'Use a clearer transition (e.g., “However,” “Next,” “Therefore,”).' });
            }
            idx = end;
            if (sentenceRegex.lastIndex === sm.index) sentenceRegex.lastIndex++;
        }
    } catch { }

    // Generic 'etc.' usage
    try {
        const etcRe = /\betc\./gi;
        let m;
        while ((m = etcRe.exec(lower)) !== null) {
            items.push({ start: m.index, end: m.index + m[0].length, label: 'bad', reason: 'Vague ending “etc.”', category: 'weasel', suggestion: 'Replace “etc.” with one or two concrete items or remove.' });
            if (etcRe.lastIndex === m.index) etcRe.lastIndex++;
        }
    } catch { }

    // Deconflict overlaps: prioritize 'bad' over 'good', keep earlier range when same label
    const merged = [];
    for (const it of items) {
        const last = merged[merged.length - 1];
        if (!last || it.start >= last.end) {
            merged.push(it);
            continue;
        }
        // Overlap
        if (last.label === 'bad' || it.label === 'good') {
            // keep last (bad has priority), ignore it
            continue;
        } else {
            // replace last with bad
            merged[merged.length - 1] = it;
        }
    }
    return merged;
}

function summarizeHighlights(highlights) {
    const stats = { goodCount: 0, badCount: 0, categories: {} };
    for (const h of highlights || []) {
        if (h.label === 'good') stats.goodCount++;
        else if (h.label === 'bad') stats.badCount++;
        if (h.category) stats.categories[h.category] = (stats.categories[h.category] || 0) + 1;
    }
    return stats;
}

function computeHybridDebug(durationSec, transcript) {
    const raw = String(transcript || '');
    const words = (raw.toLowerCase().match(/\b[a-z']+\b/g) || []).length;
    const idealDur = 60;
    const idealWords = 120;
    const durFactor = Math.max(0, Math.min(1, 1 - Math.abs((Number(durationSec) || 0) - idealDur) / idealDur));
    const lenFactor = Math.max(0, Math.min(1, 1 - Math.abs(words - idealWords) / idealWords));
    const durDelta = (durFactor - 0.5) * 20;
    const lenDelta = (lenFactor - 0.5) * 20;
    return { durationSec: Number(durationSec) || 0, words, idealDur, idealWords, durFactor, lenFactor, durDelta, lenDelta };
}

function buildHeuristicExtemporeAnalysis({ topic, durationSec, transcript }) {
    const raw = String(transcript || '').trim();
    if (!raw) {
        return buildZeroAnalysis({ topic, transcript });
    }

    const lower = raw.toLowerCase();
    const words = lower.match(/\b[a-z']+\b/gi) || [];
    if (words.length < 5 || (Number(durationSec) || 0) < 5) {
        return buildZeroAnalysis({ topic, transcript: raw });
    }
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

    const highlights = buildTranscriptHighlights(raw);
    const highlightStats = summarizeHighlights(highlights);
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
        practiceTopics,
        rawTranscript: raw,
        highlights,
        highlightStats,
        hybridDebug: computeHybridDebug(durationSec, raw)
    };
}

function applyHybridScoring(base, durationSec, transcript) {
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const clamp = (v) => (v < 0 ? 0 : v > 100 ? 100 : Math.round(v));
    const raw = String(transcript || '');
    const words = (raw.toLowerCase().match(/\b[a-z']+\b/g) || []).length;
    if (isTooShort(durationSec, transcript)) {
        return {
            overallScore: 0,
            fluencyScore: 0,
            structureScore: 0,
            contentScore: 0,
            deliveryScore: 0,
        };
    }
    const idealDur = 60;
    const idealWords = 120;
    const durFactor = Math.max(0, Math.min(1, 1 - Math.abs((Number(durationSec) || 0) - idealDur) / idealDur));
    const lenFactor = Math.max(0, Math.min(1, 1 - Math.abs(words - idealWords) / idealWords));
    const durDelta = (durFactor - 0.5) * 20;
    const lenDelta = (lenFactor - 0.5) * 20;

    const flu = clamp(num(base.fluencyScore) + durDelta + lenDelta);
    const str = clamp(num(base.structureScore) + durDelta + lenDelta * 0.5);
    const con = clamp(num(base.contentScore) + lenDelta * 1.5 + durDelta * 0.5);
    const del = clamp(num(base.deliveryScore) + durDelta * 1.2 + lenDelta * 0.8);
    const overall = Math.round((flu + str + con + del) / 4);

    return {
        overallScore: overall,
        fluencyScore: flu,
        structureScore: str,
        contentScore: con,
        deliveryScore: del,
    };
}

async function analyzeExtemporeWithGemini({ topic, difficulty, category, durationSec, transcript, apiKey }) {
    const key = apiKey || process.env.GEMINI_API_KEY;

    // Short-input gating: return zero scores immediately
    if (isTooShort(durationSec, transcript)) {
        return buildZeroAnalysis({ topic, transcript });
    }

    const prompt = buildPrompt({ topic, difficulty, category, durationSec, transcript });

    if (!key) {
        const base = buildHeuristicExtemporeAnalysis({ topic, durationSec, transcript });
        const hybrid = applyHybridScoring(base, durationSec, transcript);
        const highlights = base.highlights || buildTranscriptHighlights(transcript);
        const highlightStats = base.highlightStats || summarizeHighlights(highlights);
        const hybridDebug = computeHybridDebug(durationSec, transcript);
        return { ...base, ...hybrid, highlights, highlightStats, hybridDebug };
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
        if (parsed && typeof parsed === 'object') {
            const hybrid = applyHybridScoring(parsed, durationSec, transcript);
            const highlights = buildTranscriptHighlights(transcript);
            const highlightStats = summarizeHighlights(highlights);
            const hybridDebug = computeHybridDebug(durationSec, transcript);
            return { ...parsed, ...hybrid, rawTranscript: String(transcript || ''), highlights, highlightStats, hybridDebug };
        }

        const base = buildHeuristicExtemporeAnalysis({ topic, durationSec, transcript });
        const hybrid = applyHybridScoring(base, durationSec, transcript);
        const highlights = base.highlights || buildTranscriptHighlights(transcript);
        const highlightStats = base.highlightStats || summarizeHighlights(highlights);
        const hybridDebug = computeHybridDebug(durationSec, transcript);
        return { ...base, ...hybrid, rawTranscript: String(transcript || ''), highlights, highlightStats, hybridDebug };
    } catch (e) {
        const base = buildHeuristicExtemporeAnalysis({ topic, durationSec, transcript });
        const hybrid = applyHybridScoring(base, durationSec, transcript);
        const highlights = base.highlights || buildTranscriptHighlights(transcript);
        const highlightStats = base.highlightStats || summarizeHighlights(highlights);
        const hybridDebug = computeHybridDebug(durationSec, transcript);
        return { ...base, ...hybrid, rawTranscript: String(transcript || ''), highlights, highlightStats, hybridDebug };
    }
}

module.exports = { analyzeExtemporeWithGemini };
