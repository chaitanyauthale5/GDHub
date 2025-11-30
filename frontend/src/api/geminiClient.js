export async function analyzeTranscript({ transcript, topic = 'General Practice' }) {
    try {
        const text = String(transcript || '').trim();
        if (!text) {
            return {
                summary: 'No transcript provided. Start a session and try again.',
                strengths: [],
                improvements: ['Record a short response so we can analyze it.'],
                suggestions: ['Speak for 30–60 seconds on the topic, then click Analyze.'],
            };
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

        return { summary, strengths, improvements, suggestions };
    } catch {
        return {
            summary: 'Analysis failed due to an unexpected error. Please try again.',
            strengths: [],
            improvements: [],
            suggestions: ['Retry the analysis in a few seconds.'],
        };
    }
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
