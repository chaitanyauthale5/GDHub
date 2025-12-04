const WebSocket = require('ws');
const GDTranscript = require('../models/GDTranscript');
const config = require('../config');

// Simple per-room metrics (talk time). We keep it minimal for v1; consumers can compute more later.
const metricsByRoom = new Map(); // roomId -> { perUser: Map(userId -> { talkMs }), topic, lastSpeakerUserId }

function getRoomMetrics(roomId) {
  if (!metricsByRoom.has(roomId)) metricsByRoom.set(roomId, { perUser: new Map(), topic: undefined, lastSpeakerUserId: null });
  return metricsByRoom.get(roomId);
}

function updateTalkTime(roomId, userId, durationMs) {
  const m = getRoomMetrics(roomId);
  const u = m.perUser.get(userId) || { talkMs: 0 };
  u.talkMs += Math.max(0, Number(durationMs) || 0);
  m.perUser.set(userId, u);
  return m;
}

function analyzeTextBasic(text) {
  const s = String(text || '').toLowerCase();
  const tokens = s.match(/[a-z']+/g) || [];
  const words = tokens.length;
  const fillerList = ['um','uh','erm','hmm','like','actually','basically','literally'];
  let fillers = 0;
  for (const t of tokens) if (fillerList.includes(t)) fillers++;
  const collabPats = [/\bi agree\b/g, /building on/g, /adding to/g, /as [a-z]+ said/g, /good point/g, /what do you think/g, /let's/g, /we should/g, /we could/g, /together/g, /as a group/g, /can someone/g, /want to hear/g];
  const leaderPats = [/we should/g, /we need/g, /to summarize/g, /summary/g, /next steps/g, /time check/g, /back to the topic/g, /let's/g, /agenda/g];
  let collab = 0; let lead = 0;
  for (const r of collabPats) { const m = s.match(r); if (m) collab += m.length; }
  for (const r of leaderPats) { const m = s.match(r); if (m) lead += m.length; }
  const posWords = ['great','good','thanks','interesting','love','nice','clear','well','agree','appreciate','helpful'];
  const negWords = ['bad','terrible','hate','awful','confusing','unclear','disagree'];
  let pos = 0, neg = 0;
  for (const t of tokens) { if (posWords.includes(t)) pos++; else if (negWords.includes(t)) neg++; }
  const sent = Math.max(0, Math.min(1, (pos - neg) / Math.max(1, words) + 0.5));
  return { words, fillers, collab, lead, sentiment: sent };
}

function onTopicScore(text, topic) {
  const s = String(text || '').toLowerCase();
  const t = String(topic || '').toLowerCase();
  if (!t.trim()) return 0.5;
  const stop = new Set(['is','the','a','an','of','and','or','to','in','on','for','with','without','are','do','does','did','be','being','been','at','by','from','it','that']);
  const topicTokens = Array.from(new Set((t.match(/[a-z']+/g) || []).filter(x => !stop.has(x))));
  if (topicTokens.length === 0) return 0.5;
  let hit = 0;
  for (const tok of topicTokens) if (s.includes(tok)) hit++;
  return Math.max(0, Math.min(1, hit / topicTokens.length));
}

function updateUtteranceMetrics(m, userId, userName, transcript, startMs, endMs, topic) {
  const durationMs = Math.max(1, (endMs || 0) - (startMs || 0));
  const u0 = m.perUser.get(userId) || {};
  const u = Object.assign({ talkMs: 0, turns: 0, words: 0, fillers: 0, interruptions: 0, sentimentSum: 0, onTopicSum: 0, collabCues: 0, leadershipCues: 0, wpmSum: 0, wpmCount: 0, lastStart: 0, lastEnd: 0, lastText: '', userName: userName || u0.userName }, u0);
  const stats = analyzeTextBasic(transcript);
  const wpm = Math.max(0, Math.round(stats.words / (durationMs / 60000)) || 0);
  u.turns += 1;
  u.words += stats.words;
  u.fillers += stats.fillers;
  u.sentimentSum += stats.sentiment;
  u.onTopicSum += onTopicScore(transcript, topic);
  u.collabCues += stats.collab;
  u.leadershipCues += stats.lead;
  if (wpm > 0) { u.wpmSum += wpm; u.wpmCount += 1; }
  for (const [otherId, ov] of m.perUser.entries()) {
    if (otherId === userId) continue;
    if (ov && typeof ov.lastEnd === 'number' && ov.lastEnd > (startMs - 200)) { u.interruptions += 1; break; }
  }
  u.lastStart = startMs;
  u.lastEnd = endMs;
  u.lastText = transcript;
  u.userName = userName || u.userName;
  m.perUser.set(userId, u);
  m.lastSpeakerUserId = userId;
}

/**
 * Creates a Deepgram realtime session for a user. Exposes send(buffer) and close().
 * When Deepgram sends a final transcript result, we persist it and emit updated metrics via io.
 */
/**
 * Creates a Deepgram realtime session.
 * If options.version === 'v2', uses Flux (Turn-based) API at /v2/listen with model=flux-general-en.
 * Otherwise falls back to v1 /v1/listen with utterances.
 */
function createDeepgramSession({ io, roomId, userId, userName, language, topic, version = 'v1', encoding = 'webm', sampleRate = 48000 }) {
  const apiKey = config.deepgramApiKey;
  const lang = (language || config.deepgramLanguage || 'en-US');
  if (!apiKey) throw new Error('Deepgram API key missing');

  // Build endpoint and query for v1 vs v2
  let url = '';
  if (String(version).toLowerCase() === 'v2' || String(version).toLowerCase() === 'flux') {
    const q = new URLSearchParams({
      model: 'flux-general-en',
      encoding: String(encoding || 'ogg-opus'),
      sample_rate: String(sampleRate || 48000),
    });
    url = `wss://api.deepgram.com/v2/listen?${q.toString()}`;
  } else {
    const q = new URLSearchParams({
      encoding: 'opus',
      sample_rate: String(sampleRate || 48000),
      language: lang,
      smart_format: 'true',
      filler_words: 'true',
      punctuate: 'true',
      utterances: 'true',
    });
    url = `wss://api.deepgram.com/v1/listen?${q.toString()}`;
  }

  try { console.log('[dg] connect', url); } catch {}
  const dg = new WebSocket(url, { headers: { Authorization: `Token ${apiKey}` } });
  let open = false;
  const queue = [];

  const flush = () => {
    if (!open) return;
    while (queue.length) dg.send(queue.shift());
  };

  dg.on('open', () => {
    open = true;
    flush();
  });

  dg.on('message', async (data) => {
    // Deepgram sends JSON results and sometimes binary heartbeats; we only care about JSON.
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    const now = Date.now();
    const isFlux = String(version).toLowerCase() === 'v2' || String(version).toLowerCase() === 'flux';

    if (isFlux) {
      // v2 Flux messages
      const type = msg?.type;
      if (type === 'Connected') {
        return; // nothing to do
      }
      if (type === 'TurnInfo') {
        const event = msg?.event;
        const transcript = String(msg?.transcript || '');
        if (!transcript) return;
        if (event === 'Update' || event === 'TurnResumed') {
          // Interim
          try {
            io.to(`gd:${roomId}`).emit('gd_transcript', { roomId, userId, userName, text: transcript, final: false, ts: now });
          } catch {}
          return;
        }
        if (event === 'EndOfTurn' || event === 'EagerEndOfTurn') {
          // Final chunk
          // Use reported audio window for duration if available
          const startSec = Number(msg?.audio_window_start) || 0;
          const endSec = Number(msg?.audio_window_end) || 0;
          const durMs = Math.max(250, Math.round(Math.max(0, endSec - startSec) * 1000) || 1000);
          const endMs = now;
          const startMs = endMs - durMs;

          try {
            await GDTranscript.create({
              room_id: roomId,
              user_id: userId,
              user_name: userName,
              text: transcript,
              start_ms: startMs,
              end_ms: endMs,
              lang: (lang || 'en-US').slice(0, 10),
              session_type: 'gd'
            });
          } catch {}

          const m = updateTalkTime(roomId, userId, Math.max(0, endMs - startMs));
          if (topic && !m.topic) m.topic = topic;
          updateUtteranceMetrics(m, userId, userName, transcript, startMs, endMs, m.topic);
          try {
            const perUser = Array.from(m.perUser.entries()).map(([uid, v]) => ({
              userId: uid,
              userName: v.userName,
              talkMs: v.talkMs || 0,
              turns: v.turns || 0,
              words: v.words || 0,
              fillers: v.fillers || 0,
              fillerRate: v.words ? Math.round((v.fillers / v.words) * 100) : 0,
              interruptions: v.interruptions || 0,
              wpmAvg: v.wpmCount ? Math.round(v.wpmSum / v.wpmCount) : 0,
              sentimentAvg: v.turns ? Math.round((v.sentimentSum / v.turns) * 100) / 100 : 0,
              onTopicAvg: v.turns ? Math.round((v.onTopicSum / v.turns) * 100) / 100 : 0,
              collabCues: v.collabCues || 0,
              leadershipCues: v.leadershipCues || 0,
              lastText: v.lastText || ''
            }));
            const totalTalkMs = perUser.reduce((a, b) => a + (b.talkMs || 0), 0);
            const payload = { roomId, perUser, lastSpeakerUserId: m.lastSpeakerUserId, totalTalkMs };
            io.to(`gd:${roomId}`).emit('gd_metrics', payload);
          } catch {}
          try {
            io.to(`gd:${roomId}`).emit('gd_transcript', { roomId, userId, userName, text: transcript, final: true, start_ms: startMs, end_ms: endMs, lang: (lang || 'en-US').slice(0, 10) });
          } catch {}
          return;
        }
        return;
      }
      if (msg?.type === 'Error' || msg?.type === 'FatalError') {
        return;
      }
      return;
    }

    // v1 message format
    const alt = msg?.channel?.alternatives?.[0];
    const transcript = alt?.transcript || '';
    const isFinal = Boolean(msg?.is_final);
    if (!transcript) return;

    // Emit interim transcript updates as they arrive
    if (!isFinal) {
      try {
        io.to(`gd:${roomId}`).emit('gd_transcript', { roomId, userId, userName, text: transcript, final: false, ts: now });
      } catch {}
      return;
    }

    // Use wall clock times for cross-participant ordering.
    // Derive duration from word timings if present, but always anchor end to now.
    let endMs = now;
    let startMs = now - 1000; // default 1s chunk duration
    const words = Array.isArray(alt?.words) ? alt.words : [];
    if (words.length > 0) {
      const first = words[0];
      const last = words[words.length - 1];
      const durMs = (typeof first.start === 'number' && typeof last.end === 'number') ? Math.max(250, Math.round((last.end - first.start) * 1000)) : 1000;
      startMs = endMs - durMs;
    }

    try {
      await GDTranscript.create({ room_id: roomId, user_id: userId, user_name: userName, text: transcript, start_ms: startMs, end_ms: endMs, lang: (lang || 'en-US').slice(0, 10), session_type: 'gd' });
    } catch {}

    const m = updateTalkTime(roomId, userId, Math.max(0, endMs - startMs));
    if (topic && !m.topic) m.topic = topic;
    updateUtteranceMetrics(m, userId, userName, transcript, startMs, endMs, m.topic);
    try {
      const perUser = Array.from(m.perUser.entries()).map(([uid, v]) => ({
        userId: uid,
        userName: v.userName,
        talkMs: v.talkMs || 0,
        turns: v.turns || 0,
        words: v.words || 0,
        fillers: v.fillers || 0,
        fillerRate: v.words ? Math.round((v.fillers / v.words) * 100) : 0,
        interruptions: v.interruptions || 0,
        wpmAvg: v.wpmCount ? Math.round(v.wpmSum / v.wpmCount) : 0,
        sentimentAvg: v.turns ? Math.round((v.sentimentSum / v.turns) * 100) / 100 : 0,
        onTopicAvg: v.turns ? Math.round((v.onTopicSum / v.turns) * 100) / 100 : 0,
        collabCues: v.collabCues || 0,
        leadershipCues: v.leadershipCues || 0,
        lastText: v.lastText || ''
      }));
      const totalTalkMs = perUser.reduce((a, b) => a + (b.talkMs || 0), 0);
      const payload = { roomId, perUser, lastSpeakerUserId: m.lastSpeakerUserId, totalTalkMs };
      io.to(`gd:${roomId}`).emit('gd_metrics', payload);
    } catch {}
    try {
      io.to(`gd:${roomId}`).emit('gd_transcript', { roomId, userId, userName, text: transcript, final: true, start_ms: startMs, end_ms: endMs, lang: (lang || 'en-US').slice(0, 10) });
    } catch {}
  });

  dg.on('error', (err) => {
    try { console.warn('[dg] websocket error', err && err.message ? err.message : err); } catch {}
  });
  dg.on('close', (code, reason) => {
    try { console.log('[dg] websocket close', code, reason ? reason.toString() : ''); } catch {}
  });

  return {
    send(chunk) {
      if (!chunk) return;
      if (!open) { queue.push(chunk); return; }
      try { dg.send(chunk); } catch {}
    },
    close() {
      try { dg.close(); } catch {}
    }
  };
}

module.exports = { createDeepgramSession, getRoomMetrics };
