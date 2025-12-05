import { api } from '@/api/apiClient';
import { analyzeTranscript } from '@/api/geminiClient';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

import { motion } from 'framer-motion';
import { AlertCircle, Award, CheckCircle, Clock, Home, MessageSquare, RotateCcw, TrendingUp, Users, Download } from 'lucide-react';
import TopNav from '../components/navigation/TopNav';

export default function GDAnalysis() {
  const [session, setSession] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [perUser, setPerUser] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('feedback');
  const [analysisMode, setAnalysisMode] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    const raw = (sp.get('analysis') || localStorage.getItem('gd_analysis_mode') || 'original').toLowerCase();
    return ['original', 'ai'].includes(raw) ? raw : 'original';
  });

  // persist mode and update URL param for shareability
  useEffect(() => {
    try { localStorage.setItem('gd_analysis_mode', analysisMode); } catch { }
    const sp = new URLSearchParams(window.location.search);
    sp.set('analysis', analysisMode);
    const qs = sp.toString();
    const next = `${window.location.pathname}?${qs}`;
    window.history.replaceState({}, '', next);
  }, [analysisMode]);

  const urlParams = new URLSearchParams(window.location.search);
  const rawSessionId = urlParams.get('sessionId') || urlParams.get('sessionID') || urlParams.get('sessionid');
  const rawRoomId = urlParams.get('roomId') || urlParams.get('roomID') || urlParams.get('roomid');
  const sessionId = rawSessionId && rawSessionId !== 'null' && rawSessionId !== 'undefined' ? rawSessionId : null;
  const roomId = rawRoomId && rawRoomId !== 'null' && rawRoomId !== 'undefined' ? rawRoomId : null;

  useEffect(() => {
    loadSessionAndAnalyze();
  }, [analysisMode]);

  const loadSessionAndAnalyze = async () => {
    try {
      if (sessionId) {
        const sessions = await api.entities.GDSession.filter({ id: sessionId });
        if (sessions.length > 0) {
          setSession(sessions[0]);
          await generateAnalysis(sessions[0]);
          await generateParticipantAnalyses(sessions[0]);
          setLoading(false);
          return;
        }
      }

      if (roomId) {
        const rooms = await api.entities.GDRoom.filter({ id: roomId });
        if (rooms.length > 0) {
          const r = rooms[0];
          const pseudoSession = {
            id: `room-${r.id}`,
            room_id: r.id,
            topic: r.topic,
            duration: r.duration,
            mode: r.mode,
            participants: r.participants || [],
          };
          setSession(pseudoSession);
          await generateAnalysis(pseudoSession);
          await generateParticipantAnalyses(pseudoSession);
          setLoading(false);
          return;
        }
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
    // Final fallback: demo content so the page is never empty
    const demo = {
      id: 'demo-session',
      room_id: 'demo-room',
      topic: 'Is social media making us more connected or more isolated?',
      duration: 15,
      mode: 'gd',
      participants: [
        { user_id: 'u1', name: 'Alex' },
        { user_id: 'u2', name: 'Jordan' },
        { user_id: 'u3', name: 'Riya' },
        { user_id: 'u4', name: 'Sam' },
      ],
    };
    setSession(demo);
    await generateAnalysis(demo);
    await generateParticipantAnalyses(demo);
    setLoading(false);
  };

  const groupTranscriptsByUser = (items = []) => {
    const map = new Map();
    for (const t of items) {
      const key = t.user_id || t.user_name || 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    for (const [k, arr] of map) {
      arr.sort((a, b) => (a.start_ms || 0) - (b.start_ms || 0));
    }
    return map;
  };

  const tokenize = (s) => (String(s || '').toLowerCase().match(/[a-z']+/g) || []);
  const fillerList = new Set(['um', 'uh', 'erm', 'hmm', 'like', 'actually', 'basically', 'literally']);
  const collabRegs = [/\bi agree\b/g, /building on/g, /adding to/g, /as [a-z]+ said/g, /good point/g, /what do you think/g, /let's/g, /we should/g, /we could/g, /together/g, /as a group/g, /can someone/g, /want to hear/g];
  const leaderRegs = [/we should/g, /we need/g, /to summarize/g, /summary/g, /next steps/g, /time check/g, /back to the topic/g, /let's/g, /agenda/g];
  const posWords = new Set(['great', 'good', 'thanks', 'interesting', 'love', 'nice', 'clear', 'well', 'agree', 'appreciate', 'helpful']);
  const negWords = new Set(['bad', 'terrible', 'hate', 'awful', 'confusing', 'unclear', 'disagree']);
  const onTopicScoreLocal = (text, topic) => {
    const s = String(text || '').toLowerCase();
    const t = String(topic || '').toLowerCase();
    if (!t.trim()) return 0.5;
    const stop = new Set(['is', 'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'with', 'without', 'are', 'do', 'does', 'did', 'be', 'being', 'been', 'at', 'by', 'from', 'it', 'that']);
    const toks = Array.from(new Set((t.match(/[a-z']+/g) || []).filter(x => !stop.has(x))));
    if (toks.length === 0) return 0.5;
    let hit = 0; for (const tok of toks) if (s.includes(tok)) hit++;
    return Math.max(0, Math.min(1, hit / toks.length));
  };
  const wpmScore = (wpm) => {
    const lo = 90, hi = 170;
    if (!Number.isFinite(wpm) || wpm <= 0) return 0;
    if (wpm >= lo && wpm <= hi) return 1;
    const d = wpm < lo ? lo - wpm : wpm - hi;
    return Math.max(0, 1 - d / 80);
  };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const computeGroupMetrics = (transcripts = [], participants = [], topic = '') => {
    const sorted = [...transcripts].sort((a, b) => (a.start_ms || 0) - (b.start_ms || 0));
    const byUser = new Map();
    let lastEnd = 0, lastSpeaker = null;
    for (const t of sorted) {
      const uid = t.user_id || t.user_name || 'unknown';
      const name = (participants.find(p => p.user_id === uid)?.name) || t.user_name || uid;
      const start = Number(t.start_ms || 0); const end = Number(t.end_ms || start + 1000);
      const durMs = Math.max(1, end - start);
      const tokens = tokenize(t.text);
      const words = tokens.length;
      let fillers = 0; for (const tok of tokens) if (fillerList.has(tok)) fillers++;
      let collab = 0; for (const r of collabRegs) { const m = String(t.text || '').toLowerCase().match(r); if (m) collab += m.length; }
      let lead = 0; for (const r of leaderRegs) { const m = String(t.text || '').toLowerCase().match(r); if (m) lead += m.length; }
      let pos = 0, neg = 0; for (const tok of tokens) { if (posWords.has(tok)) pos++; else if (negWords.has(tok)) neg++; }
      const sentiment = clamp01((pos - neg) / Math.max(1, words) + 0.5);
      const u0 = byUser.get(uid) || { userId: uid, name, talkMs: 0, turns: 0, words: 0, fillers: 0, interruptions: 0, sentimentSum: 0, onTopicSum: 0, collabCues: 0, leadershipCues: 0, wpmSum: 0, wpmCount: 0 };
      const wpm = Math.max(0, Math.round(words / (durMs / 60000)) || 0);
      u0.talkMs += durMs;
      u0.turns += 1;
      u0.words += words;
      u0.fillers += fillers;
      u0.sentimentSum += sentiment;
      u0.onTopicSum += onTopicScoreLocal(t.text, topic);
      u0.collabCues += collab;
      u0.leadershipCues += lead;
      if (wpm > 0) { u0.wpmSum += wpm; u0.wpmCount += 1; }
      if (lastSpeaker && lastSpeaker !== uid && lastEnd > (start - 200)) { u0.interruptions += 1; }
      byUser.set(uid, u0);
      lastSpeaker = uid; lastEnd = end;
    }
    const perUser = Array.from(byUser.values()).map(u => ({
      ...u,
      wpmAvg: u.wpmCount ? Math.round(u.wpmSum / u.wpmCount) : 0,
      fillerRate: u.words ? u.fillers / u.words : 0,
      sentimentAvg: u.turns ? u.sentimentSum / u.turns : 0,
      onTopicAvg: u.turns ? u.onTopicSum / u.turns : 0,
    }));
    const totalTalkMs = perUser.reduce((s, x) => s + (x.talkMs || 0), 0);
    const maxTurns = perUser.reduce((m, x) => Math.max(m, x.turns || 0), 0) || 1;
    const maxInter = perUser.reduce((m, x) => Math.max(m, x.interruptions || 0), 0) || 1;
    const maxCollab = perUser.reduce((m, x) => Math.max(m, x.collabCues || 0), 0) || 1;
    const maxLead = perUser.reduce((m, x) => Math.max(m, x.leadershipCues || 0), 0) || 1;
    const n = Math.max(1, participants.length || perUser.length || 1);
    const targetShare = 1 / n;
    const withScores = perUser.map(u => {
      const share = totalTalkMs ? u.talkMs / totalTalkMs : 0;
      const shareScore = clamp01(1 - Math.abs(share - targetShare) / Math.max(1e-3, 1 - targetShare));
      const turnsNorm = clamp01((u.turns || 0) / maxTurns);
      const interNorm = clamp01((u.interruptions || 0) / maxInter);
      const fillerNorm = clamp01((u.fillerRate || 0) / 0.06);
      const wpmNorm = wpmScore(u.wpmAvg || 0);
      const collabNorm = clamp01((u.collabCues || 0) / maxCollab);
      const leadNorm = clamp01((u.leadershipCues || 0) / maxLead);
      const participation = 100 * (0.4 * shareScore + 0.3 * turnsNorm + 0.3 * (1 - interNorm));
      const communication = 100 * (0.4 * wpmNorm + 0.6 * (1 - fillerNorm));
      const knowledge = 100 * (0.6 * (u.onTopicAvg || 0) + 0.4 * wpmNorm);
      const teamwork = 100 * (0.4 * leadNorm + 0.3 * collabNorm + 0.3 * (u.sentimentAvg || 0));
      const overall = Math.round((participation + communication + knowledge + teamwork) / 4);
      return { ...u, share, participation: Math.round(participation), communication: Math.round(communication), knowledge: Math.round(knowledge), teamwork: Math.round(teamwork), overallScore: overall };
    });
    const avg = (arr) => Math.round(arr.reduce((s, x) => s + x, 0) / Math.max(1, arr.length));
    const overallScore = avg(withScores.map(u => u.overallScore));
    const participationScore = avg(withScores.map(u => u.participation));
    const communicationScore = avg(withScores.map(u => u.communication));
    const knowledgeScore = avg(withScores.map(u => u.knowledge));
    const teamworkScore = avg(withScores.map(u => u.teamwork));
    return { perUser: withScores, totalTalkMs, overallScore, participationScore, communicationScore, knowledgeScore, teamworkScore };
  };

  const generateAnalysis = async (sessionData) => {
    try {
      if (sessionData?.room_id) {
        const transcripts = await api.entities.GDTranscript.filter({ room_id: sessionData.room_id });
        const group = computeGroupMetrics(transcripts, sessionData.participants || [], sessionData.topic || '');
        let strengths = [];
        let improvements = [];
        let aiScores = null;
        try {
          const combined = (transcripts || []).sort((a, b) => (a.start_ms || 0) - (b.start_ms || 0)).map(t => `${t.user_name || t.user_id || 'Participant'}: ${t.text}`).join('\n');
          if (combined) {
            const gemini = await analyzeTranscript({ transcript: combined, topic: sessionData.topic || 'Group Discussion' });
            if (gemini && typeof gemini === 'object') {
              strengths = Array.isArray(gemini.strengths) ? gemini.strengths : strengths;
              improvements = Array.isArray(gemini.improvements) ? gemini.improvements : improvements;
              if (analysisMode === 'ai') {
                aiScores = {
                  overallScore: gemini.overallScore || 0,
                  participationScore: gemini.confidenceScore || 0,
                  communicationScore: gemini.clarityScore || 0,
                  knowledgeScore: gemini.vocabularyScore || 0,
                  teamworkScore: gemini.fluencyScore || 0,
                };
              }
            }
          }
        } catch { }
        const finalScores = aiScores || group;
        setAnalysis({
          overallScore: finalScores.overallScore,
          participationScore: finalScores.participationScore,
          communicationScore: finalScores.communicationScore,
          knowledgeScore: finalScores.knowledgeScore,
          teamworkScore: finalScores.teamworkScore,
          strengths: strengths.length ? strengths : ['Balanced participation from most members', 'Good collaboration cues observed', 'Positive tone maintained'],
          improvements: improvements.length ? improvements : ['Reduce filler words', 'Stay on-topic consistently', 'Aim for balanced speaking time'],
          detailedFeedback: aiScores ? 'Analysis generated by AI based on the full session transcript.' : 'Scores are computed from real-time metrics like talk-time, turns, WPM, filler usage, on-topic focus, collaboration and leadership cues.',
          tips: ['Aim for steady 110–160 WPM', 'Use fewer filler words', 'Invite quieter members and summarize transitions'],
        });
        return;
      } else if (sessionData?.transcript) {
        const gemini = await analyzeTranscript({
          transcript: sessionData.transcript,
          topic: sessionData.topic || 'Group Discussion',
        });
        if (gemini && typeof gemini === 'object') {
          const overall = Number.isFinite(Number(gemini.overallScore)) ? Math.round(Number(gemini.overallScore)) : 0;
          const participationScore = Number.isFinite(Number(gemini.confidenceScore)) ? Math.round(Number(gemini.confidenceScore)) : overall;
          const communicationScore = Number.isFinite(Number(gemini.clarityScore)) ? Math.round(Number(gemini.clarityScore)) : overall;
          const knowledgeScore = Number.isFinite(Number(gemini.vocabularyScore)) ? Math.round(Number(gemini.vocabularyScore)) : overall;
          const teamworkScore = Number.isFinite(Number(gemini.fluencyScore)) ? Math.round(Number(gemini.fluencyScore)) : overall;

          setAnalysis({
            overallScore: overall,
            participationScore,
            communicationScore,
            knowledgeScore,
            teamworkScore,
            strengths: Array.isArray(gemini.strengths) ? gemini.strengths : [],
            improvements: Array.isArray(gemini.improvements) ? gemini.improvements : [],
            detailedFeedback: gemini.detailedFeedback || gemini.summary || '',
            tips: Array.isArray(gemini.practiceExercises) ? gemini.practiceExercises : (Array.isArray(gemini.suggestions) ? gemini.suggestions : []),
          });
          return;
        }
      }

      const response = await api.integrations.Core.InvokeLLM({
        prompt: `Analyze this group discussion session and provide detailed feedback:

Topic: ${sessionData.topic}
Duration: ${sessionData.duration} minutes
Participants: ${sessionData.participants?.length || 0}
Mode: ${sessionData.mode}

Generate a comprehensive analysis in JSON format with:
1. overallScore: A score out of 100
2. participationScore: Score for engagement (out of 100)
3. communicationScore: Score for clarity and articulation (out of 100)
4. knowledgeScore: Score for topic knowledge (out of 100)
5. teamworkScore: Score for collaborative discussion (out of 100)
6. strengths: Array of 3-4 things the participant did well
7. improvements: Array of 3-4 areas to improve
8. detailedFeedback: A paragraph of personalized feedback
9. tips: Array of 3 actionable tips for future discussions`,
        response_json_schema: {
          type: "object",
          properties: {
            overallScore: { type: "number" },
            participationScore: { type: "number" },
            communicationScore: { type: "number" },
            knowledgeScore: { type: "number" },
            teamworkScore: { type: "number" },
            strengths: { type: "array", items: { type: "string" } },
            improvements: { type: "array", items: { type: "string" } },
            detailedFeedback: { type: "string" },
            tips: { type: "array", items: { type: "string" } }
          }
        }
      });
      setAnalysis(response);
    } catch (error) {
      console.error('Error generating analysis:', error);
    }
    if (!analysis) {
      setAnalysis({
        overallScore: 72,
        participationScore: 70,
        communicationScore: 74,
        knowledgeScore: 69,
        teamworkScore: 75,
        strengths: ['Clear articulation of ideas', 'Good listening and turn-taking', 'Constructive tone'],
        improvements: ['Provide more concrete examples', 'Summarize key points more often', 'Invite quieter members'],
        detailedFeedback: 'The group discussion demonstrated solid collaboration and idea flow. You contributed regularly and helped keep the discussion on track. Focus on adding evidence and drawing others in to elevate the conversation further.',
        tips: ['Use “because” statements to bring evidence', 'Summarize the last 2-3 points every few minutes', 'Ask open questions to engage quieter peers'],
      });
    }
  };

  const generateParticipantAnalyses = async (sessionData) => {
    try {
      const transcripts = await api.entities.GDTranscript.filter({ room_id: sessionData.room_id });
      const grouped = groupTranscriptsByUser(transcripts);
      const participants = sessionData.participants || [];
      const index = {};
      participants.forEach(p => { index[p.user_id] = p; });

      const results = [];
      if (analysisMode === 'original') {
        const group = computeGroupMetrics(transcripts, participants, sessionData.topic || '');
        for (const p of participants) {
          const name = p.name || 'Participant';
          let u = group.perUser.find(x => String(x.userId) === String(p.user_id)) || null;
          if (!u && name) {
            u = group.perUser.find(x => String(x.name || '').toLowerCase() === String(name).toLowerCase()) || null;
          }

          const items = grouped.get(p.user_id) || [];
          const totalMs = items.reduce((sum, t) => sum + Math.max(0, (t.end_ms || 0) - (t.start_ms || 0)), 0);
          const talkMs = u?.talkMs ?? totalMs;
          const talkTimeSec = Math.max(0, Math.round((talkMs || 0) / 1000));
          const ai = u ? {
            overallScore: u.overallScore,
            communicationScore: u.communication,
            knowledgeScore: u.knowledge,
            participationSummary: `Spoke for ${talkTimeSec}s with ${u.turns} turns, avg ${u.wpmAvg} WPM. On-topic ${(Math.round((u.onTopicAvg || 0) * 100))}%, fillers ${(Math.round((u.fillerRate || 0) * 100))}/100w.`,
            strengths: [u.leadershipCues > 0 ? 'Showed leadership' : 'Positive tone', u.collabCues > 0 ? 'Built on peers' : 'Clear points', (u.onTopicAvg || 0) > 0.6 ? 'Stayed on-topic' : 'Good participation'],
            improvements: [(u.fillerRate || 0) > 0.05 ? 'Reduce fillers' : 'Add examples', (u.wpmAvg || 0) > 170 ? 'Slow down' : 'Summarize more', u.interruptions > 0 ? 'Fewer interruptions' : 'Invite others'],
          } : {
            overallScore: 0,
            communicationScore: 0,
            knowledgeScore: 0,
            participationSummary: 'No transcript captured',
            strengths: [],
            improvements: [],
          };
          results.push({ userId: p.user_id, name, talkTimeSec, ai });
        }
      } else {
        for (const p of participants) {
          const items = grouped.get(p.user_id) || [];

          const totalMs = items.reduce((sum, t) => sum + Math.max(0, (t.end_ms || 0) - (t.start_ms || 0)), 0);
          const text = items.map(t => t.text).join(' ').slice(0, 4000);
          const name = p.name || items[0]?.user_name || 'Participant';
          let ai = null;
          if (text) {
            try {
              let gemini = null;
              if (analysisMode === 'ai') {
                gemini = await api.aiAnalysis.analyzeGDParticipant({
                  topic: sessionData.topic || 'Group Discussion',
                  transcript: text,
                  durationSec: Math.max(5, Math.round(totalMs / 1000))
                });
              } else {
                gemini = await analyzeTranscript({ transcript: text, topic: sessionData.topic || 'Group Discussion' });
              }
              if (gemini && typeof gemini === 'object') {
                const overallScore = Number.isFinite(Number(gemini.overallScore)) ? Math.round(Number(gemini.overallScore)) : 0;
                const communicationScore = Number.isFinite(Number(gemini.communicationScore ?? gemini.clarityScore)) ? Math.round(Number(gemini.communicationScore ?? gemini.clarityScore)) : overallScore;
                const knowledgeScore = Number.isFinite(Number(gemini.knowledgeScore ?? gemini.vocabularyScore)) ? Math.round(Number(gemini.knowledgeScore ?? gemini.vocabularyScore)) : overallScore;
                ai = {
                  overallScore,
                  communicationScore,
                  knowledgeScore,
                  participationSummary: gemini.feedback || gemini.summary || gemini.detailedFeedback || '',
                  strengths: Array.isArray(gemini.strengths) ? gemini.strengths : [],
                  improvements: Array.isArray(gemini.improvements) ? gemini.improvements : []
                };
              }
            } catch { }
          }
          const fallbackAi = {
            overallScore: 70,
            communicationScore: 72,
            knowledgeScore: 68,
            participationSummary: 'Contributed regularly and responded to peers constructively.',
            strengths: ['Clear points', 'Positive tone', 'Builds on others’ ideas'],
            improvements: ['Add examples', 'Be concise', 'Invite others to speak'],
          };
          const talkTimeSec = Math.max(5, Math.round(totalMs / 1000) || Math.floor(20 + Math.random() * 60));
          results.push({ userId: p.user_id, name, talkTimeSec, ai: analysisMode === 'dummy' ? fallbackAi : (ai || fallbackAi) });
        }
      }
      setPerUser(results);
    } catch (error) {
      console.error('Error generating participant analyses:', error);
    }
  };

  const downloadTranscript = async () => {
    if (!session?.room_id) return;
    try {
      const transcripts = await api.entities.GDTranscript.filter({ room_id: session.room_id });
      const sorted = transcripts.sort((a, b) => (a.start_ms || 0) - (b.start_ms || 0));
      const text = sorted.map(t => `[${new Date(t.start_ms).toISOString().substr(11, 8)}] ${t.user_name || 'User'}: ${t.text}`).join('\n');
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcript-${session.room_id}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to download transcript', e);
    }
  };

  const ScoreRing = ({ score, label, color }) => (
    <div className="text-center">
      <div className="relative w-24 h-24 mx-auto mb-2">
        <svg className="w-full h-full transform -rotate-90">
          <circle cx="48" cy="48" r="40" stroke="#e5e7eb" strokeWidth="8" fill="none" />
          <circle
            cx="48" cy="48" r="40"
            stroke={color}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 251.2} 251.2`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-black">{score}</span>
        </div>
      </div>
      <p className="text-sm font-medium text-gray-600">{label}</p>
    </div>
  );

  const leaders = [...perUser].sort((a, b) => (b.talkTimeSec || 0) - (a.talkTimeSec || 0));

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center animate-pulse">
            <TrendingUp className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-600 font-medium">Analyzing your performance...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-gradient-to-br from-gray-50 to-purple-50">
      <TopNav activePage="Explore" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-xl">
            <Award className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black mb-2">GD Performance Analysis</h1>
          <p className="text-gray-600">Here's how you performed in the discussion</p>
        </motion.div>

        {/* Analysis Mode Toggle */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-100 p-3 flex items-center justify-between">
            <div className="text-sm font-bold text-gray-700">Analysis Mode</div>
            <div className="flex gap-2">
              <button onClick={() => setAnalysisMode('original')} className={`px-3 py-1.5 rounded-xl text-sm font-bold ${analysisMode === 'original' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700'}`}>Original</button>
              <button onClick={() => setAnalysisMode('ai')} className={`px-3 py-1.5 rounded-xl text-sm font-bold ${analysisMode === 'ai' ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white' : 'bg-gray-100 text-gray-700'}`}>AI Mode</button>
            </div>
          </div>
        </motion.div>

        {/* Session Info */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-3xl p-6 shadow-xl border-2 border-gray-100 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg text-purple-600">Session Details</h2>
            {session?.room_id && (
              <button onClick={downloadTranscript} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-bold text-gray-700 transition-colors">
                <Download className="w-4 h-4" /> Download Transcript
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-purple-50 rounded-2xl">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 text-purple-600" />
              <p className="text-xs text-gray-600">Topic</p>
              <p className="font-bold text-sm">{session?.topic?.slice(0, 30)}...</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-2xl">
              <Clock className="w-6 h-6 mx-auto mb-2 text-blue-600" />
              <p className="text-xs text-gray-600">Duration</p>
              <p className="font-bold">{session?.duration} min</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-2xl">
              <Users className="w-6 h-6 mx-auto mb-2 text-green-600" />
              <p className="text-xs text-gray-600">Participants</p>
              <p className="font-bold">{session?.participants?.length || 0}</p>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="bg-white rounded-3xl p-6 shadow-xl border-2 border-gray-100 mb-6">
          <h2 className="font-bold text-lg mb-4">Leaderboard</h2>
          <div className="space-y-2">
            {leaders.map((u, i) => (
              <div key={u.userId || i} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-white flex items-center justify-center font-bold">{i + 1}</div>
                  <div className="font-semibold">{u.name}</div>
                </div>
                <div className="text-sm text-gray-600">{u.talkTimeSec}s</div>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="flex gap-3 mb-6">
          <button onClick={() => setActiveTab('feedback')} className={`flex-1 py-3 rounded-2xl font-bold ${activeTab === 'feedback' ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white' : 'bg-white border-2 border-gray-200'}`}>Feedback</button>
          <button onClick={() => setActiveTab('analysis')} className={`flex-1 py-3 rounded-2xl font-bold ${activeTab === 'analysis' ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white' : 'bg-white border-2 border-gray-200'}`}>Analysis</button>
        </div>

        {activeTab === 'analysis' && analysis && (
          <>
            {/* Overall Score */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-gradient-to-r from-purple-500 to-blue-500 rounded-3xl p-8 shadow-xl mb-6 text-white text-center">
              <p className="text-lg opacity-90 mb-2">Overall Performance</p>
              <div className="text-7xl font-black mb-2">{analysis.overallScore}</div>
              <p className="text-lg opacity-90">out of 100</p>
            </motion.div>

            {/* Score Breakdown */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-3xl p-6 shadow-xl border-2 border-gray-100 mb-6">
              <h2 className="font-bold text-lg mb-6">Score Breakdown</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <ScoreRing score={analysis.participationScore} label="Participation" color="#8b5cf6" />
                <ScoreRing score={analysis.communicationScore} label="Communication" color="#3b82f6" />
                <ScoreRing score={analysis.knowledgeScore} label="Knowledge" color="#10b981" />
                <ScoreRing score={analysis.teamworkScore} label="Teamwork" color="#f59e0b" />
              </div>
            </motion.div>

            {/* Strengths & Improvements */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-white rounded-3xl p-6 shadow-xl border-2 border-green-100">
                <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-green-600"><CheckCircle className="w-5 h-5" /> Strengths</h2>
                <ul className="space-y-3">
                  {analysis.strengths?.map((strength, i) => (
                    <li key={i} className="flex items-start gap-3 text-gray-700"><span className="w-2 h-2 rounded-full bg-green-500 mt-2 flex-shrink-0"></span>{strength}</li>
                  ))}
                </ul>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-white rounded-3xl p-6 shadow-xl border-2 border-orange-100">
                <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-orange-600"><AlertCircle className="w-5 h-5" /> Areas to Improve</h2>
                <ul className="space-y-3">
                  {analysis.improvements?.map((improvement, i) => (
                    <li key={i} className="flex items-start gap-3 text-gray-700"><span className="w-2 h-2 rounded-full bg-orange-500 mt-2 flex-shrink-0"></span>{improvement}</li>
                  ))}
                </ul>
              </motion.div>
            </div>

            {/* Detailed Feedback */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="bg-white rounded-3xl p-6 shadow-xl border-2 border-gray-100 mb-6">
              <h2 className="font-bold text-lg mb-4">Detailed Feedback</h2>
              <p className="text-gray-700 leading-relaxed">{analysis.detailedFeedback}</p>
            </motion.div>

            {/* Tips */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-3xl p-6 shadow-xl border-2 border-cyan-100 mb-6">
              <h2 className="font-bold text-lg mb-4 text-cyan-700">💡 Tips for Next Time</h2>
              <ul className="space-y-3">
                {analysis.tips?.map((tip, i) => (
                  <li key={i} className="flex items-start gap-3 text-gray-700"><span className="w-6 h-6 rounded-full bg-cyan-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">{i + 1}</span>{tip}</li>
                ))}
              </ul>
            </motion.div>
          </>
        )}

        {activeTab === 'analysis' && perUser.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mb-6">
            <div className="bg-white rounded-3xl p-6 shadow-xl border-2 border-gray-100">
              <h2 className="font-bold text-xl mb-4">Participant Analysis</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {perUser.map((u, idx) => (
                  <div key={u.userId || idx} className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-bold">{u.name}</div>
                      <div className="text-xs text-gray-600">Talk Time: <span className="font-semibold">{u.talkTimeSec}s</span></div>
                    </div>
                    {u.ai ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex gap-3 flex-wrap">
                          <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-bold">Overall {u.ai.overallScore}</span>
                          <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-bold">Comm {u.ai.communicationScore}</span>
                          <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 font-bold">Knowledge {u.ai.knowledgeScore}</span>
                        </div>
                        <p className="text-gray-700">{u.ai.participationSummary}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-xs font-bold text-green-700 mb-1">Strengths</div>
                            <ul className="list-disc pl-5 text-gray-700">{(u.ai.strengths || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-orange-700 mb-1">Improvements</div>
                            <ul className="list-disc pl-5 text-gray-700">{(u.ai.improvements || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">No transcript captured. Ensure mic permission is granted next time.</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'feedback' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-6 mb-6">
            <div className="bg-white rounded-3xl p-6 shadow-xl border-2 border-gray-100">
              <h2 className="font-bold text-lg mb-2">Overall Feedback</h2>
              <p className="text-gray-700 mb-3">{analysis?.detailedFeedback || 'Practice session summary is not available yet.'}</p>
              {analysis?.tips && analysis.tips.length > 0 && (
                <ul className="list-disc pl-5 text-gray-700">{analysis.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
              )}
            </div>
            <div className="bg-white rounded-3xl p-6 shadow-xl border-2 border-gray-100">
              <h2 className="font-bold text-lg mb-4">Participant Feedback</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {perUser.map((u, i) => (
                  <div key={u.userId || i} className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
                    <div className="font-bold mb-1">{u.name}</div>
                    {u.ai ? (
                      <>
                        <p className="text-sm text-gray-700 mb-2">{u.ai.participationSummary}</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <div className="text-xs font-bold text-green-700 mb-1">Strengths</div>
                            <ul className="list-disc pl-5 text-gray-700">{(u.ai.strengths || []).map((s, k) => <li key={k}>{s}</li>)}</ul>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-orange-700 mb-1">Improvements</div>
                            <ul className="list-disc pl-5 text-gray-700">{(u.ai.improvements || []).map((s, k) => <li key={k}>{s}</li>)}</ul>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-gray-500">No feedback yet.</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="flex flex-col sm:flex-row gap-4">
          <Link to={createPageUrl('Dashboard')} className="flex-1">
            <button className="w-full py-4 rounded-2xl bg-white border-2 border-gray-200 font-bold flex items-center justify-center gap-2 hover:bg-gray-50 transition-all"><Home className="w-5 h-5" /> Back to Dashboard</button>
          </Link>
          <Link to={createPageUrl('GDArena')} className="flex-1">
            <button className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all"><RotateCcw className="w-5 h-5" /> Practice Again</button>
          </Link>
        </motion.div>

      </div>
    </div>
  );
}