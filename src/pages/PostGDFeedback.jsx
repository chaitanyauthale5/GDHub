import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { ThumbsUp, UserPlus, Sparkles, TrendingUp, Award } from 'lucide-react';
import TopNav from '../components/navigation/TopNav';
import ClayCard from '../components/shared/ClayCard';

export default function PostGDFeedback() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [likedUsers, setLikedUsers] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);

  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      const sessionData = await base44.entities.GDSession.filter({ id: sessionId });
      if (sessionData.length > 0) {
        setSession(sessionData[0]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const handleLike = (userId) => {
    setLikedUsers([...likedUsers, userId]);
  };

  const handleAddFriend = (userId) => {
    setFriendRequests([...friendRequests, userId]);
  };

  return (
    <div className="min-h-screen pb-20">
      <TopNav activePage="Dashboard" />
      
      <div className="max-w-7xl mx-auto px-6 pt-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <h1 className="text-5xl font-bold mb-2 gradient-text">Session Complete! 🎉</h1>
          <p className="text-gray-600 text-lg">Great discussion! Here's your feedback</p>
        </motion.div>

        {/* Participants Feedback */}
        <ClayCard className="mb-6">
          <h2 className="text-2xl font-bold mb-6">Rate Your Peers</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {session?.participants?.filter(p => p.user_id !== user?.id).map((participant) => (
              <div key={participant.user_id} className="clay-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white font-bold text-lg">
                      {participant.name?.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold">{participant.name}</p>
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => handleLike(participant.user_id)}
                          disabled={likedUsers.includes(participant.user_id)}
                          className={`p-2 rounded-full ${
                            likedUsers.includes(participant.user_id)
                              ? 'bg-green-500 text-white'
                              : 'bg-white/50 text-gray-600 hover:bg-green-100'
                          } transition-all`}
                        >
                          <ThumbsUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleAddFriend(participant.user_id)}
                          disabled={friendRequests.includes(participant.user_id)}
                          className={`p-2 rounded-full ${
                            friendRequests.includes(participant.user_id)
                              ? 'bg-blue-500 text-white'
                              : 'bg-white/50 text-gray-600 hover:bg-blue-100'
                          } transition-all`}
                        >
                          <UserPlus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ClayCard>

        {/* Paid Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <ClayCard className="bg-gradient-to-br from-purple-50 to-blue-50">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center shadow-lg">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-2">AI Analysis</h3>
                <p className="text-gray-600 mb-4">Get detailed AI-powered performance analysis</p>
                <button className="px-6 py-2 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold shadow-lg">
                  Unlock for $4.99
                </button>
              </div>
            </div>
          </ClayCard>

          <ClayCard className="bg-gradient-to-br from-orange-50 to-pink-50">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center shadow-lg">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-2">AI Feedback</h3>
                <p className="text-gray-600 mb-4">Personalized improvement suggestions</p>
                <button className="px-6 py-2 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white font-bold shadow-lg">
                  Unlock for $2.99
                </button>
              </div>
            </div>
          </ClayCard>
        </div>

        {/* Leaderboard Preview */}
        <ClayCard className="mb-6">
          <h3 className="text-2xl font-bold mb-4 gradient-text">Session Leaderboard</h3>
          <div className="space-y-3">
            {session?.participants?.map((participant, index) => (
              <div key={participant.user_id} className="flex items-center gap-4 p-4 bg-white/50 rounded-2xl">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${
                  index === 0 ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-white' :
                  index === 1 ? 'bg-gradient-to-r from-gray-300 to-gray-400 text-white' :
                  index === 2 ? 'bg-gradient-to-r from-orange-300 to-orange-400 text-white' :
                  'bg-gray-200 text-gray-600'
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="font-bold">{participant.name}</p>
                  <p className="text-sm text-gray-600">Score: {Math.floor(Math.random() * 50 + 50)}/100</p>
                </div>
                {index < 3 && (
                  <Award className={`w-6 h-6 ${
                    index === 0 ? 'text-yellow-500' :
                    index === 1 ? 'text-gray-400' :
                    'text-orange-400'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </ClayCard>

        {/* Feedback Questions */}
        <ClayCard className="mb-6">
          <h3 className="text-xl font-bold mb-4">Quick Feedback</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How was your experience?
              </label>
              <div className="flex gap-2">
                {['😞', '😐', '🙂', '😊', '🤩'].map((emoji, index) => (
                  <button
                    key={index}
                    className="w-14 h-14 rounded-full clay-card hover:scale-110 transition-transform text-2xl"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ClayCard>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => navigate(createPageUrl('Dashboard'))}
            className="flex-1 py-4 rounded-3xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold text-lg shadow-xl hover:shadow-2xl transition-all"
          >
            Back to Dashboard
          </button>
          <button
            onClick={() => navigate(createPageUrl('GDModes'))}
            className="flex-1 py-4 rounded-3xl bg-white text-purple-600 font-bold text-lg shadow-lg hover:shadow-xl transition-all"
          >
            Practice Again
          </button>
        </div>
      </div>
    </div>
  );
}