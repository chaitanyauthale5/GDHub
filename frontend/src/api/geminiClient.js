const GEMINI_API_KEY = (typeof import.meta !== 'undefined' && import.meta && import.meta['env'] && import.meta['env']['VITE_GEMINI_API_KEY']) || undefined;
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

function stripCodeFence(s) {
    const t = String(s || '');
    if (t.startsWith('```')) {
        return t.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
    }
    return t.trim();
}

function buildInterviewHighlights(raw) {
    const text = String(raw || '');
    if (!text) return [];
    const lower = text.toLowerCase();

    const mkRegex = (phrase) => {
        const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const wb = /\w$/.test(phrase[0]) ? '\\b' : '';
        const we = /\w$/.test(phrase[phrase.length - 1]) ? '\\b' : '';
        return new RegExp(`${wb}${esc}${we}`, 'gi');
    };

    const badFillers = ['um', 'uh', 'you know', 'like', 'actually', 'basically', 'literally', 'so', 'well', 'right', 'okay', 'ok'];
    const weakTransitions = ['anyway', 'moving on', 'so yeah'];
    const hedgePhrases = ['maybe', 'perhaps', 'i think', 'i guess', 'sort of', 'kind of', 'probably', 'somewhat', 'a bit', 'i feel like', 'in my opinion'];
    const weaselWords = ['very', 'really', 'stuff', 'things', 'just'];

    const goodSignposts = ['first', 'second', 'third', 'to begin with', 'next', 'finally', 'in conclusion', 'to summarize', 'overall', 'also', 'additionally', 'moreover', 'furthermore', 'another'];
    const goodExamples = ['for example', 'for instance', 'e.g.', 'example'];
    const goodAssertive = ['i will', 'i can', 'i did', 'we will', 'we can', 'therefore'];
    const goodTransitions = ['however', 'on the other hand', 'nevertheless'];
    const engagement = ['imagine', 'consider', 'what if', 'have you ever'];
    const causality = ['because', 'as a result', 'consequently', 'thus'];

    const collect = (phrases, label, reason, category, suggestion, pointAction) => {
        const out = [];
        for (const p of phrases) {
            const re = mkRegex(p);
            let m;
            while ((m = re.exec(lower)) !== null) {
                out.push({ start: m.index, end: m.index + m[0].length, label, reason: `${reason}: "${p}"`, category, suggestion, pointAction });
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
        ...collect(badFillers, 'bad', 'Filler or weak phrasing', 'filler', 'Pause 1–2s or use a connector (e.g., “Therefore,” “Next,”).'),
        ...collect(weakTransitions, 'bad', 'Abrupt transition', 'transition', 'Use a specific signpost (e.g., “Next,” “Another point,” “However,”).', 'cut'),
        ...collect(hedgePhrases, 'bad', 'Hedging/uncertain phrasing', 'hedge', 'Be more direct or briefly pause instead.'),
        ...collect(weaselWords, 'bad', 'Vague/weasel word', 'weasel', 'Replace with a specific descriptor or remove intensifier.'),

        ...collect(goodSignposts, 'good', 'Signposting/structure', 'signpost', 'Good signpost; keep guiding the listener.', 'added'),
        ...collect(goodExamples, 'good', 'Example indicator', 'example', 'Good example; add a concise metric to strengthen it.'),
        ...collect(goodAssertive, 'good', 'Assertive/clarifying phrase', 'assertive', 'Confident tone; pair with a specific fact.'),
        ...collect(goodTransitions, 'good', 'Contrast/transition', 'transition', 'Good contrast; briefly summarize the shift.', 'cut'),
        ...collect(engagement, 'good', 'Audience engagement', 'engagement', 'Good engagement; follow with a concise example.'),
        ...collect(causality, 'good', 'Causal reasoning', 'causality', 'Clear causal link; ensure cause→effect is explicit.'),

        // Data/metrics and years
        ...collectRegex(/\b(\d+(?:\.\d+)?)\s?(%|percent|years?|mins?|minutes?|hrs?|hours|rupees|rs|₹|\$)\b/gi, 'good', 'Specific data/metric', 'data', 'Good specifics; tie it to your main point.'),
        ...collectRegex(/\b(19|20)\d{2}\b/gi, 'good', 'Specific year', 'data', 'Add why this date matters.'),

        // Approx passive voice
        ...collectRegex(/\b(was|were|is|are|be|been|being)\s+[a-z]+(?:ed|en)\b(?:\s+by\b)?/gi, 'bad', 'Possible passive voice', 'passive', 'Prefer active voice (e.g., “We completed X”).'),

        // Repetition
        ...collectRegex(/\b(\w+)\b(?:\s+\1){2,}/gi, 'bad', 'Word repeated many times', 'repetition', 'Reduce repetition or use synonyms.'),

        // Etc.
        ...collectRegex(/\betc\./gi, 'bad', 'Vague ending “etc.”', 'weasel', 'Replace “etc.” with concrete items or remove.'),
    ];

    // Long sentences and weak starts
    try {
        const sentenceRegex = /[^.!?]+[.!?]?/g;
        let m;
        while ((m = sentenceRegex.exec(text)) !== null) {
            const s = m[0];
            const start = m.index;
            const end = start + s.length;
            const wc = (s.toLowerCase().match(/\b[a-z']+\b/g) || []).length;
            if (wc > 35) items.push({ start, end, label: 'bad', reason: 'Very long sentence (possible run-on)', category: 'runon', suggestion: 'Split into two sentences.', pointAction: undefined });
            const leading = s.trimStart();
            const off = s.length - leading.length;
            const m2 = leading.match(/^(and|but|so)\b/i);
            if (m2) {
                const w = m2[0];
                items.push({ start: start + off, end: start + off + w.length, label: 'bad', reason: 'Weak sentence start', category: 'weakStart', suggestion: 'Use a clearer transition (e.g., “However,” “Therefore,”).', pointAction: undefined });
            }
            if (sentenceRegex.lastIndex === m.index) sentenceRegex.lastIndex++;
        }
    } catch { }

    // Sort and resolve overlaps
    items.sort((a, b) => a.start - b.start || b.end - a.end);
    const merged = [];
    for (const it of items) {
        const last = merged[merged.length - 1];
        if (!last || it.start >= last.end) { merged.push(it); continue; }
        if (last.label === 'bad' || it.label === 'good') { continue; } else { merged[merged.length - 1] = it; }
    }
    return merged;
}

function summarizeInterviewHighlights(highlights) {
    const stats = { goodCount: 0, badCount: 0, categories: {} };
    for (const h of highlights || []) {
        if (h.label === 'good') stats.goodCount++;
        else if (h.label === 'bad') stats.badCount++;
        if (h.category) stats.categories[h.category] = (stats.categories[h.category] || 0) + 1;
    }
    return stats;
}

function safeJsonParse(s) {
    try {
        return JSON.parse(stripCodeFence(s));
    } catch {
        return null;
    }
}

async function callGeminiJson(prompt) {
    if (!GEMINI_API_KEY) return null;
    try {
        const res = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    response_mime_type: 'application/json',
                },
            }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return safeJsonParse(text);
    } catch {
        return null;
    }
}

export async function analyzeTranscript({ transcript, topic = 'General Practice' }) {
    try {
        const text = String(transcript || '').trim();
        if (!text) {
            return {
                summary: 'No transcript provided. Start a session and try again.',
                strengths: [],
                improvements: ['Record a short response so we can analyze it.'],
                suggestions: ['Speak for 30–60 seconds on the topic, then click Analyze.'],
                stats: {
                    words: 0,
                    sentences: 0,
                    fillerCount: 0,
                    fillerWordsFound: [],
                    avgSentenceLen: 0,
                    vocabRichness: 0,
                    topicSignal: 0,
                },
                overallScore: 0,
                fluencyScore: 0,
                clarityScore: 0,
                vocabularyScore: 0,
                confidenceScore: 0,
            };
        }

        // Try Gemini JSON analysis first
        if (GEMINI_API_KEY) {
            const geminiPrompt = [
                'You are a communication coach. Analyze the following speaking practice transcript and output strict JSON only.',
                'Return keys: overallScore (0-100), fluencyScore, clarityScore, vocabularyScore, confidenceScore,',
                'strengths (array of strings), improvements (array of strings), fillerWordsFound (array of strings),',
                'detailedFeedback (string), practiceExercises (array of strings).',
                `Topic: ${topic}`,
                'Transcript starts below (speaker: text):',
                text,
            ].join('\n\n');
            const gemini = await callGeminiJson(geminiPrompt);
            if (gemini && typeof gemini === 'object') {
                // Basic normalization and guardrails
                const normalizeNum = (v, def = 0) => Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Math.round(Number(v)))) : def;
                return {
                    summary: gemini.summary || gemini.detailedFeedback || '',
                    strengths: Array.isArray(gemini.strengths) ? gemini.strengths : [],
                    improvements: Array.isArray(gemini.improvements) ? gemini.improvements : [],
                    suggestions: Array.isArray(gemini.practiceExercises) ? gemini.practiceExercises : (Array.isArray(gemini.suggestions) ? gemini.suggestions : []),
                    stats: gemini.stats || undefined,
                    overallScore: normalizeNum(gemini.overallScore ?? gemini.overall_score),
                    fluencyScore: normalizeNum(gemini.fluencyScore),
                    clarityScore: normalizeNum(gemini.clarityScore),
                    vocabularyScore: normalizeNum(gemini.vocabularyScore),
                    confidenceScore: normalizeNum(gemini.confidenceScore),
                    fillerWordsFound: Array.isArray(gemini.fillerWordsFound) ? gemini.fillerWordsFound : [],
                    detailedFeedback: gemini.detailedFeedback || '',
                    practiceExercises: Array.isArray(gemini.practiceExercises) ? gemini.practiceExercises : [],
                };
            }
        }

        const userOnly = extractUserUtterances(text) || text;
        const sentences = splitSentences(userOnly);
        const words = tokenize(userOnly);
        const uniqueWords = new Set(words.filter(w => /[a-z]/i.test(w)));

        const avgSentenceLen = sentences.length ? (words.length / sentences.length) : 0;
        const vocabRichness = uniqueWords.size / Math.max(1, words.length);
        const fillerList = ['um', 'uh', 'like', 'you know', 'actually', 'basically', 'literally', 'so', 'well', 'right', 'okay', 'ok'];
        const fillerCount = countPhrases(userOnly.toLowerCase(), fillerList);
        const hasExamples = /(for example|for instance|e\.g\.|example)/i.test(userOnly);
        const hasSignposts = /(first|second|third|finally|in conclusion|to summarize|overall)/i.test(userOnly);
        const hasClosure = /(in conclusion|to conclude|to summarize|overall)/i.test(userOnly);
        const assertivePhrases = /(i believe|i think|i will|i can|i did|my view|in my opinion)/i.test(userOnly);

        const topicTokens = tokenize(String(topic || ''));
        const topicSignal = topicTokens.length
            ? topicTokens.reduce((acc, t) => acc + (countPhrase(userOnly.toLowerCase(), t) > 0 ? 1 : 0), 0)
            : 0;

        const strengths = [];
        if (vocabRichness >= 0.35 && uniqueWords.size >= 50) strengths.push('Good variety of vocabulary.');
        if (avgSentenceLen >= 10 && avgSentenceLen <= 25) strengths.push('Clear pacing with well-sized sentences.');
        if (hasExamples) strengths.push('Used concrete examples to support points.');
        if (hasSignposts) strengths.push('Used signposting to organize ideas.');
        if (assertivePhrases) strengths.push('Confident and assertive tone in parts.');
        if (topicSignal >= Math.max(1, Math.ceil(topicTokens.length * 0.6))) strengths.push('Stayed focused on the topic.');
        if (strengths.length === 0) strengths.push('Delivered ideas with understandable flow.');

        const improvements = [];
        if (fillerCount > 0) improvements.push(`Reduce filler words (≈${fillerCount} found) to sound more confident.`);
        if (avgSentenceLen > 25) improvements.push('Shorten long sentences for clarity.');
        if (avgSentenceLen < 8 && sentences.length > 1) improvements.push('Combine very short sentences to improve flow.');
        if (!hasExamples) improvements.push('Add concrete examples to make points memorable.');
        if (!hasSignposts) improvements.push('Use signposts (first, next, finally) to structure your response.');
        if (!hasClosure) improvements.push('End with a brief conclusion to reinforce your main message.');

        const suggestions = [
            'Record a 60-second response. Pause 1–2 seconds between ideas to reduce fillers.',
            'Use the pattern: opening line → 2–3 key points → short conclusion.',
            'Practice with signposts: “First… Next… Finally… Therefore…”.',
            'Replace fillers with silence. Count “ums” and retry to cut them by half.',
            'Add one specific example or metric to each main point.',
        ];

        const summary = buildSummary({
            topic,
            sentences: sentences.length,
            words: words.length,
            fillerCount,
            strengths,
            improvements,
        });

        const fillerWordsFound = fillerList
            .map(word => ({ word, count: countPhrase(userOnly.toLowerCase(), word) }))
            .filter(item => item.count > 0)
            .map(item => item.word);

        const fluencyScore = clampScore(100 - (fillerCount * 3) - Math.max(0, Math.abs(avgSentenceLen - 18) * 2), 45, 98);
        const clarityScore = clampScore(60 + (hasSignposts ? 15 : 0) + (hasClosure ? 10 : 0) + (hasExamples ? 10 : 0) - (avgSentenceLen > 28 ? 10 : 0) - (avgSentenceLen < 8 ? 10 : 0), 45, 98);
        const vocabularyScore = clampScore(50 + Math.min(uniqueWords.size, 150) * 0.3 + vocabRichness * 100 * 0.4, 45, 97);
        const confidenceScore = clampScore(55 + (assertivePhrases ? 12 : 0) - Math.min(fillerCount * 2, 30) + Math.min(words.length / 20, 25), 40, 96);
        const overallScore = Math.round((fluencyScore + clarityScore + vocabularyScore + confidenceScore) / 4);

        return {
            summary,
            strengths,
            improvements,
            suggestions,
            stats: {
                words: words.length,
                sentences: sentences.length,
                fillerCount,
                fillerWordsFound,
                avgSentenceLen,
                vocabRichness,
                topicSignal,
            },
            overallScore,
            fluencyScore,
            clarityScore,
            vocabularyScore,
            confidenceScore,
            fillerWordsFound,
            detailedFeedback: buildDetailedFeedback({
                summary,
                strengths,
                improvements,
                fillerCount,
            }),
            practiceExercises: buildExercises({
                strengths,
                improvements,
            }),
        };
    } catch {
        return {
            summary: 'Analysis failed due to an unexpected error. Please try again.',
            strengths: [],
            improvements: [],
            suggestions: ['Retry the analysis in a few seconds.'],
            stats: {
                words: 0,
                sentences: 0,
                fillerCount: 0,
                fillerWordsFound: [],
                avgSentenceLen: 0,
                vocabRichness: 0,
                topicSignal: 0,
            },
            overallScore: 0,
            fluencyScore: 0,
            clarityScore: 0,
            vocabularyScore: 0,
            confidenceScore: 0,
            fillerWordsFound: [],
            detailedFeedback: 'Analysis unavailable. Please retry your session.',
            practiceExercises: [],
        };
    }
}

export async function analyzeInterview({ transcript, interview_type = 'hr', role = '', company = '', duration_minutes = 10 }) {
    const text = String(transcript || '').trim();
    if (!text) return null;
    if (GEMINI_API_KEY) {
        const prompt = [
            'You are an interview performance coach. Analyze the interview transcript and return STRICT JSON only.',
            'Required keys: overall_score (0-100), communication_score (0-100), confidence_score (0-100), content_score (0-100),',
            'strengths (string[]), improvements (string[]), summary (string).',
            `Interview type: ${interview_type}`,
            `Role: ${role}`,
            `Company: ${company || 'N/A'}`,
            `Duration (min): ${duration_minutes}`,
            'Transcript:',
            text,
        ].join('\n\n');
        const json = await callGeminiJson(prompt);
        if (json && typeof json === 'object') {
            const nn = (v, d = 0) => Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Math.round(Number(v)))) : d;
            const userOnly = extractUserUtterances(text) || text;
            const hl = buildInterviewHighlights(userOnly);
            const hs = summarizeInterviewHighlights(hl);
            const communication_score = nn(json.communication_score ?? json.communicationScore);
            const confidence_score = nn(json.confidence_score ?? json.confidenceScore);
            const content_score = nn(json.content_score ?? json.contentScore);
            const overall_score = computeCalibratedInterviewOverall(communication_score, confidence_score, content_score, hs);
            return {
                overall_score,
                communication_score,
                confidence_score,
                content_score,
                strengths: Array.isArray(json.strengths) ? json.strengths : [],
                improvements: Array.isArray(json.improvements) ? json.improvements : [],
                summary: json.summary || '',
                rawTranscript: userOnly,
                highlights: hl,
                highlightStats: hs,
            };
        }
    }
    // Simple fallback using local heuristic if Gemini is unavailable
    const userOnly = extractUserUtterances(text) || text;
    const words = tokenize(userOnly);
    const sentences = splitSentences(userOnly);
    const fillerList = ['um', 'uh', 'like', 'you know', 'actually', 'basically'];
    const fillerCount = countPhrases(userOnly.toLowerCase(), fillerList);
    const avgSent = sentences.length ? words.length / sentences.length : 0;
    const communication_score = clampScore(70 - fillerCount * 2 - Math.max(0, Math.abs(avgSent - 18)), 40, 90);
    const confidence_score = clampScore(65 - Math.min(fillerCount * 2, 20) + Math.min(words.length / 25, 25), 40, 90);
    const content_score = clampScore(60 + Math.min(words.length / 30, 30), 45, 90);
    const hl = buildInterviewHighlights(userOnly);
    const hs = summarizeInterviewHighlights(hl);
    const overall_score = computeCalibratedInterviewOverall(communication_score, confidence_score, content_score, hs);
    return {
        overall_score,
        communication_score,
        confidence_score,
        content_score,
        strengths: ['Clear points in parts of the interview'],
        improvements: ['Reduce filler words and add concrete examples'],
        summary: 'Baseline interview assessment generated locally.',
        rawTranscript: userOnly,
        highlights: hl,
        highlightStats: hs,
    };
}

function clampScore(value, min, max) {
    return Math.round(Math.max(min, Math.min(max, value)));
}

function computeCalibratedInterviewOverall(communication, confidence, content, highlightStats) {
    const wComm = 0.38;
    const wContent = 0.40;
    const wConf = 0.22;
    const base = (communication * wComm) + (content * wContent) + (confidence * wConf);
    const good = Math.max(0, (highlightStats && highlightStats.goodCount) || 0);
    const bad = Math.max(0, (highlightStats && highlightStats.badCount) || 0);
    const adj = Math.max(-12, Math.min(8, good * 0.5 - bad * 1));
    return clampScore(Math.round(base + adj), 0, 100);
}

function extractUserUtterances(text) {
    const lines = String(text).split(/\r?\n/);
    const userLines = lines
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => {
            const match = /^you\s*:\s*(.*)$/i.exec(l);
            return match ? match[1] : null;
        })
        .filter(Boolean);
    return userLines.length ? userLines.join('\n') : null;
}

function splitSentences(text) {
    return String(text)
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(Boolean);
}

function tokenize(text) {
    return String(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s']/gi, ' ')
        .split(/\s+/)
        .filter(Boolean);
}

function countPhrase(text, phrase) {
    if (!phrase) return 0;
    const pattern = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'gi');
    return (text.match(pattern) || []).length;
}

function countPhrases(text, phrases) {
    return phrases.reduce((sum, phrase) => sum + countPhrase(text, phrase), 0);
}

function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSummary({ topic, sentences, words, fillerCount, strengths, improvements }) {
    const parts = [];
    parts.push(`This practice focused on “${topic}”.`);
    if (words > 0) parts.push(`You spoke roughly ${words} words across ${sentences} sentence${sentences === 1 ? '' : 's'}.`);
    if (fillerCount > 0) parts.push(`About ${fillerCount} filler word${fillerCount === 1 ? '' : 's'} were detected.`);

    const topStrength = strengths[0];
    const topImprove = improvements[0];
    if (topStrength) parts.push(`Strength: ${topStrength}`);
    if (topImprove) parts.push(`Next step: ${topImprove}`);

    return parts.join(' ');
}

function buildDetailedFeedback({ summary, strengths, improvements, fillerCount }) {
    const details = [];
    details.push(summary);
    if (strengths.length) {
        details.push(`Highlights: ${strengths.slice(0, 2).join(' | ')}.`);
    }
    if (improvements.length) {
        details.push(`Focus areas: ${improvements.slice(0, 2).join(' | ')}.`);
    }
    if (fillerCount > 0) {
        details.push('Keep an eye on filler words—pause briefly instead of saying “um” or “uh”.');
    }
    return details.join(' ');
}

function buildExercises({ strengths, improvements }) {
    const exercises = [];
    exercises.push('Record yourself answering the same topic again and compare pacing.');
    exercises.push('Outline three bullet points before speaking to organize thoughts.');

    if (improvements.some(item => item.toLowerCase().includes('filler'))) {
        exercises.push('Practice a 60-second response focusing on silent pauses instead of fillers.');
    }

    if (strengths.some(item => item.toLowerCase().includes('example'))) {
        exercises.push('Add one statistic or story to each key point to reinforce examples.');
    } else {
        exercises.push('Draft a quick anecdote to illustrate your main idea before speaking.');
    }

    return exercises.slice(0, 3);
}
