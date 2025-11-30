import { api } from '@/api/apiClient';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '../utils';

import { motion } from 'framer-motion';
import { AlertCircle, Bot, CheckCircle, Home, MessageSquare, Mic, RotateCcw, TrendingUp } from 'lucide-react';
import TopNav from '../components/navigation/TopNav';

export default function SoloAnalysis() {
  const location = useLocation();
  const [analysis, setAnalysis] = useState(location.state?.analysis || null);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState('');
  const [messages, setMessages] = useState([]);

  const urlParams = new URLSearchParams(window.location.search);

  useEffect(() => {
    const topicParam = urlParams.get('topic');
    const messagesParam = urlParams.get('messages');
    
    setTopic(topicParam || 'General Practice');

    const useAnalysisPayload = (payload) => {
      if (!payload?.analysis) return false;
      setAnalysis(payload.analysis);
      setLoading(false);
      return true;
    };

    if (location.state?.analysis) {
      if (useAnalysisPayload({ analysis: location.state.analysis })) {
        return;
      }
    }

    if (typeof window !== 'undefined' && window.sessionStorage) {
      const cached = window.sessionStorage.getItem('soloAnalysisPayload');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const topicMatches = !parsed.topic || !topicParam || parsed.topic === topicParam;
          if (topicMatches && useAnalysisPayload(parsed)) {
            window.sessionStorage.removeItem('soloAnalysisPayload');
            return;
          }
        } catch (e) {
          console.warn('Invalid solo analysis cache:', e);
        }
      }
    }
    try {
      const parsedMessages = JSON.parse(messagesParam || '[]');
      setMessages(parsedMessages);
      if (parsedMessages.length > 0) {
        generateAnalysis(topicParam, parsedMessages);
      } else {
        setLoading(false);
      }
    } catch (e) {
      setLoading(false);
    }
  }, [location.state]);

  const generateAnalysis = async (topicData, messagesData) => {
    try {
      const userMessages = messagesData.filter(m => m.role === 'user').map(m => m.content).join(' ');
      
      const response = await api.integrations.Core.InvokeLLM({
        prompt: `Analyze this solo speaking practice session and provide detailed feedback:

Topic: ${topicData}
User's responses: ${userMessages}
Number of exchanges: ${messagesData.length / 2}

Generate a comprehensive speaking analysis in JSON format with:
1. overallScore: A score out of 100
2. fluencyScore: Score for speaking fluency (out of 100)
3. clarityScore: Score for clarity and coherence (out of 100)
4. vocabularyScore: Score for vocabulary usage (out of 100)
5. confidenceScore: Estimated confidence level (out of 100)
6. strengths: Array of 3-4 things the user did well
7. improvements: Array of 3-4 areas to improve
8. fillerWordsFound: Array of any filler words detected (um, uh, like, you know)
9. detailedFeedback: A paragraph of personalized feedback
10. practiceExercises: Array of 3 specific exercises to improve`,
        response_json_schema: {
          type: "object",
          properties: {
            overallScore: { type: "number" },
            fluencyScore: { type: "number" },
            clarityScore: { type: "number" },
            vocabularyScore: { type: "number" },
            confidenceScore: { type: "number" },
            strengths: { type: "array", items: { type: "string" } },
            improvements: { type: "array", items: { type: "string" } },
            fillerWordsFound: { type: "array", items: { type: "string" } },
            detailedFeedback: { type: "string" },
            practiceExercises: { type: "array", items: { type: "string" } }
          }
        }
      });
      setAnalysis(response);
    } catch (error) {
      console.error('Error generating analysis:', error);
    }
    setLoading(false);
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
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center animate-pulse">
            <TrendingUp className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-600 font-medium">Analyzing your speaking performance...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-gradient-to-br from-gray-50 to-cyan-50">
      <TopNav activePage="Explore" />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center shadow-xl">
            <Bot className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black mb-2">Speaking Analysis</h1>
          <p className="text-gray-600">Your AI-powered performance review</p>
        </motion.div>

        {/* Topic */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-6 shadow-xl border-2 border-gray-100 mb-6"
        >
          <div className="flex items-center gap-3">
            <MessageSquare className="w-6 h-6 text-cyan-600" />
            <div>
              <p className="text-sm text-gray-500">Topic Practiced</p>
              <p className="font-bold text-lg">{topic}</p>
            </div>
          </div>
        </motion.div>

        {analysis ? (
          <>
            {/* Overall Score */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="bg-gradient-to-r from-cyan-500 to-teal-500 rounded-3xl p-8 shadow-xl mb-6 text-white text-center"
            >
              <p className="text-lg opacity-90 mb-2">Overall Speaking Score</p>
              <div className="text-7xl font-black mb-2">{analysis.overallScore}</div>
              <p className="text-lg opacity-90">out of 100</p>
            </motion.div>

            {/* Score Breakdown */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="bg-white rounded-3xl p-6 shadow-xl border-2 border-gray-100 mb-6"
            >
              <h2 className="font-bold text-lg mb-6">Skill Breakdown</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <ScoreRing score={analysis.fluencyScore} label="Fluency" color="#06b6d4" />
                <ScoreRing score={analysis.clarityScore} label="Clarity" color="#8b5cf6" />
                <ScoreRing score={analysis.vocabularyScore} label="Vocabulary" color="#10b981" />
                <ScoreRing score={analysis.confidenceScore} label="Confidence" color="#f59e0b" />
              </div>
            </motion.div>

            {/* Filler Words */}
            {analysis.fillerWordsFound?.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                className="bg-yellow-50 rounded-3xl p-6 shadow-xl border-2 border-yellow-100 mb-6"
              >
                <h2 className="font-bold text-lg mb-3 text-yellow-700">⚠️ Filler Words Detected</h2>
                <div className="flex flex-wrap gap-2">
                  {analysis.fillerWordsFound.map((word, i) => (
                    <span key={i} className="px-3 py-1 bg-yellow-200 text-yellow-800 rounded-full text-sm font-medium">
                      "{word}"
                    </span>
                  ))}
                </div>
                <p className="text-sm text-yellow-700 mt-3">Try to minimize these in your next practice session.</p>
              </motion.div>
            )}

            {/* Strengths & Improvements */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="bg-white rounded-3xl p-6 shadow-xl border-2 border-green-100"
              >
                <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" /> What You Did Well
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
                  <AlertCircle className="w-5 h-5" /> Areas to Work On
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
              <h2 className="font-bold text-lg mb-4">Personalized Feedback</h2>
              <p className="text-gray-700 leading-relaxed">{analysis.detailedFeedback}</p>
            </motion.div>

            {/* Practice Exercises */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
              className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-3xl p-6 shadow-xl border-2 border-purple-100 mb-6"
            >
              <h2 className="font-bold text-lg mb-4 text-purple-700">🎯 Recommended Exercises</h2>
              <ul className="space-y-3">
                {analysis.practiceExercises?.map((exercise, i) => (
                  <li key={i} className="flex items-start gap-3 text-gray-700 bg-white/50 p-3 rounded-xl">
                    <span className="w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">{i + 1}</span>
                    {exercise}
                  </li>
                ))}
              </ul>
            </motion.div>
          </>
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-8 shadow-xl border-2 border-gray-100 text-center"
          >
            <Mic className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-bold mb-2">No Practice Data</h2>
            <p className="text-gray-600 mb-6">Start a practice session to get your performance analysis.</p>
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
          <Link to={createPageUrl('SoloPractice')} className="flex-1">
            <button className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all">
              <RotateCcw className="w-5 h-5" /> Practice Again
            </button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}