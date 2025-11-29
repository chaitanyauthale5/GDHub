import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Mail, Award, TrendingUp, Users, LogOut, Crown, Camera } from 'lucide-react';
import TopNav from '../components/navigation/TopNav';
import ClayCard from '../components/shared/ClayCard';
import XPBadge from '../components/shared/XPBadge';
import AvatarSelector from '../components/shared/AvatarSelector';

export default function Profile() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      const profiles = await base44.entities.UserProfile.filter({ user_id: currentUser.id });
      if (profiles.length > 0) {
        setProfile(profiles[0]);
      }

      const gdSessions = await base44.entities.GDSession.list('-created_date', 5);
      const extemporeSessions = await base44.entities.ExtemporeSession.filter(
        { user_id: currentUser.id },
        '-created_date',
        5
      );
      setRecentSessions([...gdSessions, ...extemporeSessions].slice(0, 5));
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  const handleAvatarSelect = async (avatarUrl) => {
    if (!profile) return;
    await base44.entities.UserProfile.update(profile.id, { avatar: avatarUrl });
    setProfile({ ...profile, avatar: avatarUrl });
    setShowAvatarSelector(false);
  };

  return (
    <div className="min-h-screen pb-20">
      <TopNav activePage="Profile" user={profile} />
      
      <div className="max-w-5xl mx-auto px-6 pt-28">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <ClayCard className="bg-gradient-to-br from-purple-100 via-blue-100 to-pink-100">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="relative group">
                {profile?.avatar ? (
                  <img 
                    src={profile.avatar} 
                    alt="Avatar" 
                    className="w-32 h-32 rounded-full object-cover shadow-2xl bg-gray-100"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-5xl shadow-2xl">
                    {user?.full_name?.charAt(0) || 'U'}
                  </div>
                )}
                <button
                  onClick={() => setShowAvatarSelector(true)}
                  className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                >
                  <Camera className="w-8 h-8 text-white" />
                </button>
              </div>
              <div className="flex-1 text-center md:text-left">
                <h1 className="text-4xl font-bold mb-2">{user?.full_name}</h1>
                <div className="flex flex-col md:flex-row items-center gap-4 text-gray-600">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    <span>{user?.email}</span>
                  </div>
                  {user?.role === 'admin' && (
                    <span className="px-3 py-1 bg-yellow-400 text-yellow-900 rounded-full text-sm font-bold flex items-center gap-1">
                      <Crown className="w-4 h-4" />
                      Admin
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <XPBadge xp={profile?.xp_points || 0} level={profile?.level || 1} />
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="px-6 py-3 rounded-full bg-red-500 hover:bg-red-600 text-white font-bold flex items-center gap-2 shadow-lg transition-all"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </button>
            </div>
          </ClayCard>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <ClayCard gradient>
            <TrendingUp className="w-8 h-8 text-purple-600 mb-2" />
            <p className="text-sm text-gray-600">Streak</p>
            <p className="text-3xl font-bold gradient-text">{profile?.current_streak || 0}</p>
          </ClayCard>

          <ClayCard gradient>
            <Users className="w-8 h-8 text-blue-600 mb-2" />
            <p className="text-sm text-gray-600">GD Sessions</p>
            <p className="text-3xl font-bold gradient-text">{profile?.total_gd_sessions || 0}</p>
          </ClayCard>

          <ClayCard gradient>
            <Award className="w-8 h-8 text-orange-600 mb-2" />
            <p className="text-sm text-gray-600">Extempore</p>
            <p className="text-3xl font-bold gradient-text">{profile?.total_extempore_sessions || 0}</p>
          </ClayCard>

          <ClayCard gradient>
            <TrendingUp className="w-8 h-8 text-green-600 mb-2" />
            <p className="text-sm text-gray-600">Avg Rating</p>
            <p className="text-3xl font-bold gradient-text">
              {profile?.average_rating ? profile.average_rating.toFixed(1) : 'N/A'}
            </p>
          </ClayCard>
        </div>

        {/* Badges */}
        {profile?.badges && profile.badges.length > 0 && (
          <ClayCard className="mb-8">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Award className="w-6 h-6 text-purple-600" />
              Badges Earned
            </h2>
            <div className="flex flex-wrap gap-3">
              {profile.badges.map((badge, index) => (
                <div key={index} className="clay-card p-4 text-center">
                  <div className="w-16 h-16 mx-auto mb-2 rounded-full bg-gradient-to-br from-yellow-400 to-orange-400 flex items-center justify-center">
                    <Award className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-sm font-semibold">{badge}</p>
                </div>
              ))}
            </div>
          </ClayCard>
        )}

        {/* Recent Activity */}
        <ClayCard>
          <h2 className="text-2xl font-bold mb-4">Recent Activity</h2>
          {recentSessions.length > 0 ? (
            <div className="space-y-3">
              {recentSessions.map((session) => (
                <div key={session.id} className="p-4 bg-white/50 rounded-2xl flex justify-between items-center">
                  <div>
                    <p className="font-semibold">
                      {session.topic || `${session.room_code ? 'GD Session' : 'Extempore Session'}`}
                    </p>
                    <p className="text-sm text-gray-600">
                      {session.room_code ? 'Group Discussion' : 'Extempore Practice'}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(session.completed_at || session.created_date).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No recent activity yet</p>
              <p className="text-sm">Start practicing to see your progress here!</p>
            </div>
          )}
        </ClayCard>
      </div>

      <AnimatePresence>
        {showAvatarSelector && (
          <AvatarSelector
            selectedAvatar={profile?.avatar}
            onSelect={handleAvatarSelect}
            onClose={() => setShowAvatarSelector(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}