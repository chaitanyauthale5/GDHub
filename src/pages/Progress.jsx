import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { TrendingUp, MessageSquare, Mic, Bot, Flame, Award, Target, Calendar, Clock, BarChart3 } from 'lucide-react';
import TopNav from '../components/navigation/TopNav';
import ClayCard from '../components/shared/ClayCard';

export default function Progress() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({
    totalGDSessions: 0,
    totalExtemporeSessions: 0,
    totalInterviews: 0,
    avgGDScore: 0,
    avgExtemporeScore: 0,
    thisWeekSessions: 0,
    thisMonthSessions: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      // Get user profile
      let profiles = await base44.entities.UserProfile.filter({ user_id: currentUser.email });
      if (profiles.length === 0) {
        profiles = await base44.entities.UserProfile.filter({ user_id: currentUser.id });
      }
      if (profiles.length > 0) {
        setProfile(profiles[0]);
      }

      // Fetch all session types
      const [gdSessions, extemporeSessions, aiInterviews, gdRooms] = await Promise.all([
        base44.entities.GDSession.list('-created_date', 100),
        base44.entities.ExtemporeSession.list('-created_date', 100),
        base44.entities.AIInterview.list('-created_date', 100),
        base44.entities.GDRoom.filter({ status: 'completed' }, '-created_date', 100)
      ]);

      // Filter user sessions
      const userGDSessions = gdSessions.filter(s => 
        s.participants?.some(p => p.user_id === currentUser.email || p.user_id === currentUser.id) ||
        s.created_by === currentUser.email
      );

      const userExtemporeSessions = extemporeSessions.filter(s => 
        s.user_id === currentUser.email || s.user_id === currentUser.id || s.created_by === currentUser.email
      );

      const userInterviews = aiInterviews.filter(s => 
        s.host_id === currentUser.email || 
        s.participants?.some(p => p.user_id === currentUser.email)
      );

      const userGDRooms = gdRooms.filter(s => 
        s.host_id === currentUser.email || 
        s.participants?.some(p => p.user_id === currentUser.email || p.user_id === currentUser.id)
      );

      // Calculate stats
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const allUserSessions = [
        ...userGDSessions.map(s => ({ ...s, date: s.completed_at || s.created_date })),
        ...userExtemporeSessions.map(s => ({ ...s, date: s.created_date })),
        ...userInterviews.map(s => ({ ...s, date: s.created_date })),
        ...userGDRooms.map(s => ({ ...s, date: s.started_at || s.created_date }))
      ];

      const thisWeekSessions = allUserSessions.filter(s => new Date(s.date) >= weekAgo).length;
      const thisMonthSessions = allUserSessions.filter(s => new Date(s.date) >= monthAgo).length;

      // Calculate average scores
      const extemporeScores = userExtemporeSessions
        .filter(s => s.fluency_score)
        .map(s => s.fluency_score);
      const avgExtemporeScore = extemporeScores.length > 0 
        ? Math.round(extemporeScores.reduce((a, b) => a + b, 0) / extemporeScores.length)
        : 0;

      setStats({
        totalGDSessions: userGDSessions.length + userGDRooms.length,
        totalExtemporeSessions: userExtemporeSessions.length,
        totalInterviews: userInterviews.length,
        avgExtemporeScore,
        thisWeekSessions,
        thisMonthSessions
      });

      // Recent activity
      const recent = allUserSessions
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);
      setRecentActivity(recent);

    } catch (error) {
      console.error('Error loading progress data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <TopNav activePage="Progress" user={profile} />
      
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-2xl">
            <TrendingUp className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-black mb-2 gradient-text">My Progress</h1>
          <p className="text-gray-600 text-lg">Track your improvement journey</p>
        </motion.div>

        {/* Level & XP Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <ClayCard className="bg-gradient-to-r from-purple-100 to-blue-100 border-2 border-purple-200">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-4xl font-black text-white">
                  {profile?.level || 1}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-gray-900">Level {profile?.level || 1}</h2>
                  <p className="text-gray-700 text-lg font-medium">{profile?.xp_points || 0} XP earned</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Flame className="w-5 h-5 text-orange-500" />
                    <span className="font-bold text-gray-800">{profile?.current_streak || 0} Day Streak</span>
                  </div>
                </div>
              </div>
              <div className="text-center md:text-right">
                <p className="text-gray-600 font-medium">Next level at</p>
                <p className="text-2xl font-bold text-purple-600">{((profile?.level || 1) * 100)} XP</p>
              </div>
            </div>
          </ClayCard>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
        >
          <ClayCard className="text-center py-6">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 text-cyan-500" />
            <p className="text-3xl font-black text-gray-900">{stats.totalGDSessions}</p>
            <p className="text-sm text-gray-700 font-medium">GD Sessions</p>
          </ClayCard>
          <ClayCard className="text-center py-6">
            <Mic className="w-10 h-10 mx-auto mb-3 text-purple-500" />
            <p className="text-3xl font-black text-gray-900">{stats.totalExtemporeSessions}</p>
            <p className="text-sm text-gray-700 font-medium">Extempore</p>
          </ClayCard>
          <ClayCard className="text-center py-6">
            <Bot className="w-10 h-10 mx-auto mb-3 text-green-500" />
            <p className="text-3xl font-black text-gray-900">{stats.totalInterviews}</p>
            <p className="text-sm text-gray-700 font-medium">Interviews</p>
          </ClayCard>
          <ClayCard className="text-center py-6">
            <Target className="w-10 h-10 mx-auto mb-3 text-orange-500" />
            <p className="text-3xl font-black text-gray-900">{stats.avgExtemporeScore}%</p>
            <p className="text-sm text-gray-700 font-medium">Avg Score</p>
          </ClayCard>
        </motion.div>

        {/* Activity Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6"
        >
          <ClayCard className="bg-gradient-to-br from-green-50 to-teal-50">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center">
                <Calendar className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">This Week</p>
                <p className="text-3xl font-black">{stats.thisWeekSessions} Sessions</p>
              </div>
            </div>
          </ClayCard>
          <ClayCard className="bg-gradient-to-br from-blue-50 to-indigo-50">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center">
                <BarChart3 className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">This Month</p>
                <p className="text-3xl font-black">{stats.thisMonthSessions} Sessions</p>
              </div>
            </div>
          </ClayCard>
        </motion.div>

        {/* Badges */}
        {profile?.badges?.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mb-6"
          >
            <ClayCard>
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Award className="w-6 h-6 text-yellow-500" />
                Earned Badges
              </h3>
              <div className="flex flex-wrap gap-3">
                {profile.badges.map((badge, index) => (
                  <span
                    key={index}
                    className="px-4 py-2 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold text-sm"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </ClayCard>
          </motion.div>
        )}

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <ClayCard>
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Clock className="w-6 h-6 text-purple-500" />
              Recent Activity
            </h3>
            {recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center flex-shrink-0">
                      {activity.topic ? (
                        <MessageSquare className="w-5 h-5 text-white" />
                      ) : activity.fluency_score ? (
                        <Mic className="w-5 h-5 text-white" />
                      ) : (
                        <Bot className="w-5 h-5 text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{activity.topic || activity.interview_type || 'Practice Session'}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(activity.date).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    {activity.fluency_score && (
                      <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 font-bold text-sm">
                        {activity.fluency_score}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No activity yet. Start practicing to track your progress!</p>
              </div>
            )}
          </ClayCard>
        </motion.div>
      </div>
    </div>
  );
}