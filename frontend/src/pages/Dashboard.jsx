import { api } from '@/api/apiClient';
import { useEffect, useState } from 'react';

import { motion } from 'framer-motion';
import { Award, Bell, Bot, MessageSquare, Mic, Sparkles, Swords, TrendingUp, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import TopNav from '../components/navigation/TopNav';
import { createPageUrl } from '../utils';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [testingNotification, setTestingNotification] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentUser = await api.auth.me();

      setUser(currentUser);

      const profiles = await api.entities.UserProfile.filter({ user_id: currentUser.id });

      if (profiles.length > 0) {
        setProfile(profiles[0]);
      } else {
        const newProfile = await api.entities.UserProfile.create({
          user_id: currentUser.id,
          xp_points: 0,
          level: 1
        });
        setProfile(newProfile);
      }

      // Fetch all types of sessions for recent activity
      const [gdSessions, extemporeSessions, gdRooms, aiInterviews] = await Promise.all([
        api.entities.GDSession.list('-created_date', 20),
        api.entities.ExtemporeSession.list('-created_date', 20),
        api.entities.GDRoom.filter({ status: 'completed' }, '-created_date', 20),
        api.entities.AIInterview.filter({ status: 'completed' }, '-created_date', 20)
      ]);

      // Filter sessions that belong to current user
      const userGdSessions = gdSessions.filter(s => 
        s.participants?.some(p => p.user_id === currentUser.email || p.user_id === currentUser.id) ||
        s.created_by === currentUser.email
      );
      
      const userExtemporeSessions = extemporeSessions.filter(s => 
        s.user_id === currentUser.email || s.user_id === currentUser.id || s.created_by === currentUser.email
      );
      
      const userGdRooms = gdRooms.filter(s => 
        s.host_id === currentUser.email || 
        s.participants?.some(p => p.user_id === currentUser.email || p.user_id === currentUser.id)
      );
      
      const userAiInterviews = aiInterviews.filter(s => 
        s.host_id === currentUser.email ||
        s.participants?.some(p => p.user_id === currentUser.email)
      );

      // Combine and sort all sessions
      const allSessions = [
        ...userGdSessions.map(s => ({ ...s, type: 'gd', date: s.completed_at || s.created_date })),
        ...userExtemporeSessions.map(s => ({ ...s, type: 'extempore', date: s.created_date })),
        ...userGdRooms.map(s => ({ ...s, type: 'gd_room', date: s.started_at || s.created_date })),
        ...userAiInterviews.map(s => ({ ...s, type: 'interview', date: s.created_date }))
      ].sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();
        return dateB - dateA;
      }).slice(0, 10);

      setRecentSessions(allSessions);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const testNotification = async () => {
    if (testingNotification) return;
    
    setTestingNotification(true);
    try {
      // Test notification with format like the screenshot
      const result = await api.push.test({
        title: 'New message: SpeakUp',
        body: `Test notification • ${new Date().toLocaleTimeString()} • ${new Date().toLocaleDateString()}`,
        url: '/Dashboard',
        actions: [
          { action: 'open', title: 'Open Admin' },
          { action: 'dismiss', title: 'Dismiss' }
        ]
      });
      
      if (result && result.success) {
        toast.success(`Notification sent! ${result.result?.sent || 0} delivered`);
      } else {
        toast.error(result?.message || 'Failed to send notification. Please ensure notifications are enabled.');
      }
    } catch (error) {
      console.error('Test notification error:', error);
      toast.error('Failed to send test notification. Please check console for details.');
    } finally {
      setTestingNotification(false);
    }
  };

  return (
    <div className="min-h-screen pb-20 bg-gradient-to-br from-gray-50 to-blue-50">
      <TopNav activePage="Dashboard" user={profile} />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Welcome Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-8"
        >
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 shadow-xl border-2 border-gray-100">
            <div className="flex items-start sm:items-center gap-4 mb-6">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black mb-1">
                  Welcome back! 👋
                </h1>
                <p className="text-gray-600 text-sm sm:text-base">Ready to practice and improve your skills?</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <div className="px-4 sm:px-6 py-2 sm:py-3 rounded-full bg-white shadow-md border-2 border-gray-100 flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                <span className="font-bold text-gray-700 text-sm sm:text-base">Level {profile?.level || 1}</span>
              </div>
              <div className="px-4 sm:px-6 py-2 sm:py-3 rounded-full bg-gradient-to-r from-yellow-50 to-orange-50 shadow-md border-2 border-yellow-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-yellow-600" />
                <span className="font-bold text-gray-700 text-sm sm:text-base">{profile?.xp_points || 0} XP</span>
              </div>
              <div className="px-4 sm:px-6 py-2 sm:py-3 rounded-full bg-gradient-to-r from-orange-50 to-red-50 shadow-md border-2 border-orange-200 flex items-center gap-2">
                <span className="text-base sm:text-lg">🔥</span>
                <span className="font-bold text-gray-700 text-sm sm:text-base">{profile?.current_streak || 0} Day Streak</span>
              </div>
              <button
                onClick={testNotification}
                disabled={testingNotification}
                className="px-4 sm:px-6 py-2 sm:py-3 rounded-full bg-gradient-to-r from-blue-50 to-purple-50 shadow-md border-2 border-blue-200 hover:border-blue-300 hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Bell className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-gray-700 text-sm sm:text-base">
                  {testingNotification ? 'Sending...' : 'Test Notification'}
                </span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Quick Action Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
          <Link to={createPageUrl('GDArena')}>
            <motion.div whileHover={{ y: -4 }} className="bg-white rounded-3xl p-5 sm:p-6 shadow-lg border-2 border-gray-100 hover:border-cyan-200 hover:shadow-xl transition-all h-full">
              <div className="w-12 h-12 sm:w-14 sm:h-14 mb-3 sm:mb-4 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg">
                <MessageSquare className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <h3 className="font-black text-base sm:text-lg mb-1 sm:mb-2">Quick Start GD</h3>
              <p className="text-xs sm:text-sm text-gray-600 leading-snug">Jump into a random group discussion</p>
            </motion.div>
          </Link>

          <Link to={createPageUrl('ExtemporePractice')}>
            <motion.div whileHover={{ y: -4 }} className="bg-white rounded-3xl p-5 sm:p-6 shadow-lg border-2 border-gray-100 hover:border-purple-200 hover:shadow-xl transition-all h-full">
              <div className="w-12 h-12 sm:w-14 sm:h-14 mb-3 sm:mb-4 rounded-2xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center shadow-lg">
                <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <h3 className="font-black text-base sm:text-lg mb-1 sm:mb-2">Practice Solo</h3>
              <p className="text-xs sm:text-sm text-gray-600 leading-snug">Improve with AI-powered practice</p>
            </motion.div>
          </Link>

          <Link to={createPageUrl('Leaderboard')}>
            <motion.div whileHover={{ y: -4 }} className="bg-white rounded-3xl p-5 sm:p-6 shadow-lg border-2 border-gray-100 hover:border-pink-200 hover:shadow-xl transition-all h-full">
              <div className="w-12 h-12 sm:w-14 sm:h-14 mb-3 sm:mb-4 rounded-2xl bg-gradient-to-br from-pink-400 to-red-500 flex items-center justify-center shadow-lg">
                <Award className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <h3 className="font-black text-base sm:text-lg mb-1 sm:mb-2">Leaderboard</h3>
              <p className="text-xs sm:text-sm text-gray-600 leading-snug">See where you rank globally</p>
            </motion.div>
          </Link>

          <Link to={createPageUrl('Progress')}>
            <motion.div whileHover={{ y: -4 }} className="bg-white rounded-3xl p-5 sm:p-6 shadow-lg border-2 border-gray-100 hover:border-yellow-200 hover:shadow-xl transition-all h-full">
              <div className="w-12 h-12 sm:w-14 sm:h-14 mb-3 sm:mb-4 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg">
                <TrendingUp className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <h3 className="font-black text-base sm:text-lg mb-1 sm:mb-2">My Progress</h3>
              <p className="text-xs sm:text-sm text-gray-600 leading-snug">Track your improvement journey</p>
            </motion.div>
          </Link>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-lg border-2 border-gray-100">
          <h3 className="text-xl sm:text-2xl font-black mb-4 sm:mb-6">Recent Activity</h3>
          {recentSessions.length > 0 ? (
            <div className="space-y-3">
              {recentSessions.map((session) => {
                const typeConfig = {
                  gd: { icon: MessageSquare, color: 'from-cyan-400 to-blue-500', label: 'Group Discussion' },
                  gd_room: { icon: Users, color: 'from-cyan-400 to-blue-500', label: 'GD Room' },
                  extempore: { icon: Mic, color: 'from-purple-400 to-pink-500', label: 'Extempore' },
                  debate: { icon: Swords, color: 'from-red-400 to-orange-500', label: 'Debate' },
                  interview: { icon: Bot, color: 'from-green-400 to-teal-500', label: 'AI Interview' }
                };
                const config = typeConfig[session.type] || typeConfig.gd;
                const Icon = config.icon;

                return (
                  <div key={session.id} className="p-4 bg-white/50 rounded-2xl flex items-center gap-4 hover:bg-white/70 transition-colors">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${config.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{session.topic || config.label}</p>
                      <p className="text-sm text-gray-600">
                        {session.type === 'extempore' 
                          ? `Score: ${session.fluency_score || 0}%` 
                          : session.participants?.length 
                            ? `${session.participants.length} participants` 
                            : config.label}
                      </p>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(session.date).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                <MessageSquare className="w-10 h-10 text-gray-400" />
              </div>
              <p className="text-gray-500 mb-2">No recent activity yet</p>
              <p className="text-sm text-gray-400">Start practicing to see your progress here!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}