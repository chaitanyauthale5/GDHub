import { motion } from 'framer-motion';
import { Bot, CheckCircle, Home, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopNav from '../components/navigation/TopNav';
import ClayCard from '../components/shared/ClayCard';
import { createPageUrl } from '../utils';

export default function AIInterviewAnalysis() {
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const data = urlParams.get('data');
    if (data) {
      try {
        setAnalysis(JSON.parse(decodeURIComponent(data)));
      } catch (e) {
        console.error('Error parsing analysis data:', e);
      }
    }
  }, []);

  if (!analysis) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreBg = (score) => {
    if (score >= 80) return 'from-green-400 to-teal-500';
    if (score >= 60) return 'from-yellow-400 to-orange-500';
    return 'from-red-400 to-pink-500';
  };

  return (
    <div className="min-h-screen pb-20">
      <TopNav activePage="Explore" />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center shadow-xl">
            <Bot className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black mb-2 gradient-text">Interview Analysis</h1>
          <p className="text-gray-600">Here's how you performed in your AI interview</p>
        </motion.div>

        {/* Overall Score */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <ClayCard className={`bg-gradient-to-br ${getScoreBg(analysis.overall_score)} text-white text-center py-12`}>
            <p className="text-lg font-medium mb-2 text-white/80">Overall Score</p>
            <p className="text-7xl font-black">{analysis.overall_score || 75}</p>
            <p className="text-xl mt-2">out of 100</p>
          </ClayCard>
        </motion.div>

        {/* Score Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Communication', score: analysis.communication_score || 70 },
            { label: 'Confidence', score: analysis.confidence_score || 75 },
            { label: 'Content Quality', score: analysis.content_score || 80 }
          ].map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.1 }}
            >
              <ClayCard className="text-center py-6">
                <p className="text-gray-600 font-medium mb-2">{item.label}</p>
                <p className={`text-4xl font-black ${getScoreColor(item.score)}`}>{item.score}</p>
              </ClayCard>
            </motion.div>
          ))}
        </div>

        {/* Strengths & Improvements */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
          >
            <ClayCard className="h-full bg-gradient-to-br from-green-50 to-teal-50 border-2 border-green-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-green-700">Strengths</h3>
              </div>
              <ul className="space-y-2">
                {(analysis.strengths || ['Good communication skills', 'Clear articulation', 'Confident responses']).map((strength, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700">
                    <span className="text-green-500 mt-1">✓</span>
                    {strength}
                  </li>
                ))}
              </ul>
            </ClayCard>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
          >
            <ClayCard className="h-full bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-orange-700">Areas to Improve</h3>
              </div>
              <ul className="space-y-2">
                {(analysis.improvements || ['Add more specific examples', 'Reduce filler words', 'Structure answers better']).map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700">
                    <span className="text-orange-500 mt-1">→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </ClayCard>
          </motion.div>
        </div>

        {/* Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mb-8"
        >
          <ClayCard>
            <h3 className="text-xl font-bold mb-3">Summary</h3>
            <p className="text-gray-600 leading-relaxed">
              {analysis.summary || 'You demonstrated good interview skills overall. Continue practicing to improve your confidence and content delivery. Focus on providing more specific examples from your experience.'}
            </p>
          </ClayCard>
        </motion.div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(createPageUrl('AIInterviewHub'))}
            className="px-8 py-4 rounded-2xl bg-gradient-to-r from-green-400 to-teal-500 text-white font-bold shadow-xl flex items-center justify-center gap-2"
          >
            <Bot className="w-5 h-5" />
            Practice Again
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(createPageUrl('Dashboard'))}
            className="px-8 py-4 rounded-2xl bg-gray-200 text-gray-700 font-bold flex items-center justify-center gap-2"
          >
            <Home className="w-5 h-5" />
            Back to Dashboard
          </motion.button>
        </div>
      </div>
    </div>
  );
}