import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { api } from '@/api/apiClient';

import { motion } from 'framer-motion';
import { Award, TrendingUp, AlertCircle, CheckCircle, Users, Clock, MessageSquare, Home, RotateCcw } from 'lucide-react';
import TopNav from '../components/navigation/TopNav';

export default function GDAnalysis() {
  const [session, setSession] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [perUser, setPerUser] = useState([]);
  const [loading, setLoading] = useState(true);

  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');
  const roomId = urlParams.get('roomId');

  useEffect(() => {
    loadSessionAndAnalyze();
  }, []);

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
        }
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
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

  const generateAnalysis = async (sessionData) => {
    try {
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
  };

  const generateParticipantAnalyses = async (sessionData) => {
    try {
      const transcripts = await api.entities.GDTranscript.filter({ room_id: sessionData.room_id });
      const grouped = groupTranscriptsByUser(transcripts);
      const participants = sessionData.participants || [];
      const index = {};
      participants.forEach(p => { index[p.user_id] = p; });

      const results = [];
      for (const [userId, items] of grouped.entries()) {
        const name = index[userId]?.name || items[0]?.user_name || 'Participant';
        const totalMs = items.reduce((sum, t) => sum + Math.max(0, (t.end_ms || 0) - (t.start_ms || 0)), 0);
        const text = items.map(t => t.text).join(' ').slice(0, 4000);
        let ai;
        try {
          ai = await api.integrations.Core.InvokeLLM({
            prompt: `Analyze the following participant's contributions in a group discussion. Provide scores and feedback.\n\nParticipant: ${name}\nTopic: ${sessionData.topic}\nTranscript (may be partial):\n${text}\n\nReturn JSON with keys: overallScore (0-100), communicationScore (0-100), knowledgeScore (0-100), participationSummary (1-2 sentences), strengths (3 items), improvements (3 items).`,
            response_json_schema: {
              type: 'object',
              properties: {
                overallScore: { type: 'number' },
                communicationScore: { type: 'number' },
                knowledgeScore: { type: 'number' },
                participationSummary: { type: 'string' },
                strengths: { type: 'array', items: { type: 'string' } },
                improvements: { type: 'array', items: { type: 'string' } },
              },
            },
          });
        } catch (e) {
          ai = null;
        }
        results.push({ userId, name, talkTimeSec: Math.round(totalMs / 1000), ai });
      }
      for (const p of participants) {
        if (!results.find(r => r.userId === p.user_id)) {
          results.push({ userId: p.user_id, name: p.name, talkTimeSec: 0, ai: null });
        }
      }
      setPerUser(results);
    } catch (error) {
      console.error('Error generating participant analyses:', error);
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

        {/* Session Info */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-6 shadow-xl border-2 border-gray-100 mb-6"
        >
          <h2 className="font-bold text-lg mb-4 text-purple-600">Session Details</h2>
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

        {analysis && (
          <>
            {/* Overall Score */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="bg-gradient-to-r from-purple-500 to-blue-500 rounded-3xl p-8 shadow-xl mb-6 text-white text-center"
            >
              <p className="text-lg opacity-90 mb-2">Overall Performance</p>
              <div className="text-7xl font-black mb-2">{analysis.overallScore}</div>
              <p className="text-lg opacity-90">out of 100</p>
            </motion.div>

            {/* Score Breakdown */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="bg-white rounded-3xl p-6 shadow-xl border-2 border-gray-100 mb-6"
            >
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
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="bg-white rounded-3xl p-6 shadow-xl border-2 border-green-100"
              >
                <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" /> Strengths
                </h2>
                <ul className="space-y-3">
                  {analysis.strengths?.map((strength, i) => (
                    <li key={i} className="flex items-start gap-3 text-gray-700">
                      <span className="w-2 h-2 rounded-full bg-green-500 mt-2 flex-shrink-0"></span>
                      {strength}
                    </li>
                  ))}
                </ul>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                className="bg-white rounded-3xl p-6 shadow-xl border-2 border-orange-100"
              >
                <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-orange-600">
                  <AlertCircle className="w-5 h-5" /> Areas to Improve
                </h2>
                <ul className="space-y-3">
                  {analysis.improvements?.map((improvement, i) => (
                    <li key={i} className="flex items-start gap-3 text-gray-700">
                      <span className="w-2 h-2 rounded-full bg-orange-500 mt-2 flex-shrink-0"></span>
                      {improvement}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>

            {/* Detailed Feedback */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
              className="bg-white rounded-3xl p-6 shadow-xl border-2 border-gray-100 mb-6"
            >
              <h2 className="font-bold text-lg mb-4">Detailed Feedback</h2>
              <p className="text-gray-700 leading-relaxed">{analysis.detailedFeedback}</p>
            </motion.div>

            {/* Tips */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
              className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-3xl p-6 shadow-xl border-2 border-cyan-100 mb-6"
            >
              <h2 className="font-bold text-lg mb-4 text-cyan-700">💡 Tips for Next Time</h2>
              <ul className="space-y-3">
                {analysis.tips?.map((tip, i) => (
                  <li key={i} className="flex items-start gap-3 text-gray-700">
                    <span className="w-6 h-6 rounded-full bg-cyan-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">{i + 1}</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </motion.div>
          </>
        )}

        {/* Per-Participant Analysis */}
        {perUser.length > 0 && (
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
                            <ul className="list-disc pl-5 text-gray-700">
                              {(u.ai.strengths || []).map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-orange-700 mb-1">Improvements</div>
                            <ul className="list-disc pl-5 text-gray-700">
                              {(u.ai.improvements || []).map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
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

        {/* Action Buttons */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
          className="flex flex-col sm:flex-row gap-4"
        >
          <Link to={createPageUrl('Dashboard')} className="flex-1">
            <button className="w-full py-4 rounded-2xl bg-white border-2 border-gray-200 font-bold flex items-center justify-center gap-2 hover:bg-gray-50 transition-all">
              <Home className="w-5 h-5" /> Back to Dashboard
            </button>
          </Link>
          <Link to={createPageUrl('GDArena')} className="flex-1">
            <button className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all">
              <RotateCcw className="w-5 h-5" /> Practice Again
            </button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}