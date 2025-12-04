import { api, API_BASE_URL } from '@/api/apiClient';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

import { motion } from 'framer-motion';
import { AlertCircle, Award, CheckCircle, Clock, Home, MessageSquare, Mic, RotateCcw, TrendingUp } from 'lucide-react';
import TopNav from '../components/navigation/TopNav';

export default function ExtemporeAnalysis() {
  const [session, setSession] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);

  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');

  useEffect(() => {
    loadSessionAndAnalyze();
  }, []);

  const loadSessionAndAnalyze = async () => {
    try {
      const sessions = await api.entities.ExtemporeSession.filter({ id: sessionId });

      if (sessions.length > 0) {
        setSession(sessions[0]);
        await generateAnalysis(sessions[0]);
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
    setLoading(false);
  };

  const loadSavedAnalysis = async (sid) => {
    try {
      const [s] = await api.entities.ExtemporeSession.filter({ id: sid });
      if (s && s.ai_feedback) {
        try { setAnalysis(JSON.parse(s.ai_feedback)); return; } catch {}
      }
    } catch {}
    setAnalysis(null);
  };

  const generateAnalysis = async (sessionData) => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const key = (import.meta?.env && import.meta.env.VITE_GEMINI_API_KEY) || '';
      if (key) headers['x-gemini-key'] = key;
      const resp = await fetch(`${API_BASE_URL}/api/extempore/sessions/${sessionData.id}/analyze`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({})
      });
      if (!resp.ok) { await loadSavedAnalysis(sessionData.id); return; }
      const data = await resp.json();
      if (data && data.analysis) setAnalysis(data.analysis); else await loadSavedAnalysis(sessionData.id);
    } catch (error) {
      console.error('Error generating analysis:', error);
      await loadSavedAnalysis(sessionData.id);
    }
  };

  const ScoreRing = ({ score, label, color }) => (
    <div className="text-center">
      <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-2">
        <svg className="w-full h-full transform -rotate-90">
          <circle cx="50%" cy="50%" r="40%" stroke="#e5e7eb" strokeWidth="8" fill="none" />
          <circle
            cx="50%" cy="50%" r="40%"
            stroke={color}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 251.2} 251.2`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl sm:text-2xl font-black">{score}</span>
        </div>
      </div>
      <p className="text-xs sm:text-sm font-medium text-gray-600">{label}</p>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center animate-pulse">
            <TrendingUp className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-600 font-medium">Analyzing your extempore performance...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-gradient-to-br from-gray-50 to-orange-50">
      <TopNav activePage="Explore" />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center shadow-xl">
            <Mic className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black mb-2">Extempore Analysis</h1>
          <p className="text-gray-600">Your speaking performance breakdown</p>
        </motion.div>

        {/* Session Info */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-6 shadow-xl border-2 border-gray-100 mb-6"
        >
          <h2 className="font-bold text-lg mb-4 text-orange-600">Session Details</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-orange-50 rounded-2xl">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 text-orange-600" />
              <p className="text-xs text-gray-600">Topic</p>
              <p className="font-bold text-sm">{session?.topic?.slice(0, 25)}...</p>
            </div>
            <div className="text-center p-4 bg-pink-50 rounded-2xl">
              <Clock className="w-6 h-6 mx-auto mb-2 text-pink-600" />
              <p className="text-xs text-gray-600">Duration</p>
              <p className="font-bold">{Math.round((session?.speaking_duration || 60) / 60)} min</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-2xl">
              <Award className="w-6 h-6 mx-auto mb-2 text-purple-600" />
              <p className="text-xs text-gray-600">Difficulty</p>
              <p className="font-bold capitalize">{session?.difficulty}</p>
            </div>
          </div>
        </motion.div>

        {analysis && (
          <>
            {/* Overall Score */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="bg-gradient-to-r from-orange-500 to-pink-500 rounded-3xl p-8 shadow-xl mb-6 text-white text-center"
            >
              <p className="text-lg opacity-90 mb-2">Overall Performance</p>
              <div className="text-7xl font-black mb-2">{analysis.overallScore}</div>
              <p className="text-lg opacity-90">out of 100</p>
            </motion.div>

            {/* Score Breakdown */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="bg-white rounded-3xl p-6 shadow-xl border-2 border-gray-100 mb-6"
            >
              <h2 className="font-bold text-lg mb-6">Performance Breakdown</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <ScoreRing score={analysis.fluencyScore} label="Fluency" color="#f97316" />
                <ScoreRing score={analysis.structureScore} label="Structure" color="#ec4899" />
                <ScoreRing score={analysis.contentScore} label="Content" color="#8b5cf6" />
                <ScoreRing score={analysis.deliveryScore} label="Delivery" color="#06b6d4" />
              </div>
            </motion.div>

            {/* Opening & Closing Tips */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-3xl p-6 shadow-xl border-2 border-blue-100"
              >
                <h2 className="font-bold text-lg mb-3 text-blue-700">🎬 Opening Tip</h2>
                <p className="text-gray-700">{analysis.openingTips}</p>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-6 shadow-xl border-2 border-purple-100"
              >
                <h2 className="font-bold text-lg mb-3 text-purple-700">🎯 Closing Tip</h2>
                <p className="text-gray-700">{analysis.closingTips}</p>
              </motion.div>
            </div>

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

            {/* Practice Topics */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
              className="bg-gradient-to-r from-orange-50 to-pink-50 rounded-3xl p-6 shadow-xl border-2 border-orange-100 mb-6"
            >
              <h2 className="font-bold text-lg mb-4 text-orange-700">📚 Recommended Topics to Practice</h2>
              <div className="space-y-3">
                {analysis.practiceTopics?.map((topic, i) => (
                  <div key={i} className="bg-white/70 p-4 rounded-xl flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold">{i + 1}</span>
                    <span className="text-gray-700">{topic}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
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
          <Link to={createPageUrl('ExtemporePractice')} className="flex-1">
            <button className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-pink-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all">
              <RotateCcw className="w-5 h-5" /> Practice Again
            </button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}