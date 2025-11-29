import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { Trophy, Award, TrendingUp, Crown, UserPlus, Eye, Flame, Star, Zap } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import TopNav from '../components/navigation/TopNav';
import ClayCard from '../components/shared/ClayCard';

export default function Leaderboard() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState([]);
  const [users, setUsers] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const user = await base44.auth.me();
      setCurrentUser(user);

      const [allProfiles, allUsers] = await Promise.all([
        base44.entities.UserProfile.list('-xp_points', 20),
        base44.entities.User.list()
      ]);
      
      // Create a map of user_id to user data
      const userMap = {};
      allUsers.forEach(u => {
        userMap[u.id] = u;
        userMap[u.email] = u;
      });
      setUsers(userMap);
      setProfiles(allProfiles);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const getUserName = (userId) => {
    const user = users[userId];
    return user?.full_name || 'Anonymous User';
  };

  const getProfileAvatar = (profile) => {
    return profile?.avatar;
  };

  const handleAddFriend = async (profileUserId) => {
    if (!currentUser) return;
    
    // Get the target user's email from the users map
    const targetUser = users[profileUserId];
    const targetEmail = targetUser?.email || profileUserId;
    
    // Check if already friends
    let myProfile = await base44.entities.UserProfile.filter({ user_id: currentUser.email });
    if (myProfile.length === 0) {
      myProfile = await base44.entities.UserProfile.filter({ user_id: currentUser.id });
    }
    
    if (myProfile.length > 0 && myProfile[0].friends) {
      if (myProfile[0].friends.includes(targetEmail) || myProfile[0].friends.includes(profileUserId)) {
        alert('You are already friends!');
        setSelectedUser(null);
        return;
      }
    }
    
    // Check if request already exists
    const existingRequests = await base44.entities.FriendRequest.filter({
      from_user_id: currentUser.email,
      to_user_id: targetEmail,
      status: 'pending'
    });
    
    if (existingRequests.length > 0) {
      alert('Friend request already sent!');
      setSelectedUser(null);
      return;
    }
    
    // Create friend request with recipient's email
    await base44.entities.FriendRequest.create({
      from_user_id: currentUser.email,
      from_user_name: currentUser.full_name,
      to_user_id: targetEmail,
      to_user_name: targetUser?.full_name || 'User',
      status: 'pending'
    });

    // Create notification for the recipient using their email
    await base44.entities.Notification.create({
      user_id: targetEmail,
      type: 'friend_request',
      title: 'New Friend Request',
      message: `${currentUser.full_name} sent you a friend request`,
      from_user_id: currentUser.email,
      is_read: false
    });

    alert('Friend request sent!');
    setSelectedUser(null);
  };

  const viewProfile = (userId) => {
    navigate(createPageUrl(`UserProfile?userId=${userId}`));
    setSelectedUser(null);
  };

  return (
    <div className="min-h-screen pb-20">
      <TopNav activePage="Leaderboard" user={profiles.find(p => p.user_id === currentUser?.id)} />
      
      <div className="max-w-5xl mx-auto px-6 pt-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 text-center"
        >
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-2xl">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-1 gradient-text">Leaderboard</h1>
          <p className="text-gray-600">See how you rank against others</p>
        </motion.div>

        {/* Top 3 Podium */}
        <div className="flex items-end justify-center gap-3 sm:gap-6 mb-12 px-2">
          {[1, 0, 2].map((actualIndex, displayIndex) => {
            const actualProfile = profiles[actualIndex];
            if (!actualProfile) return null;
            
            const heights = ['h-52 sm:h-64', 'h-64 sm:h-80', 'h-44 sm:h-56'];
            const avatarSizes = ['w-20 h-20 sm:w-24 sm:h-24', 'w-24 h-24 sm:w-32 sm:h-32', 'w-16 h-16 sm:w-20 sm:h-20'];
            const gradients = [
              'from-gray-400 to-gray-500',
              'from-yellow-400 to-orange-500',
              'from-amber-600 to-orange-600'
            ];

            return (
              <motion.div
                key={actualProfile.id}
                initial={{ opacity: 0, y: 80, scale: 0.7 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: displayIndex * 0.2, type: "spring", stiffness: 150, damping: 15 }}
                className="flex flex-col items-center"
              >
                {/* Avatar with ring */}
                <div className="relative mb-4">
                  {/* Crown for 1st place */}
                  {actualIndex === 0 && (
                    <motion.div 
                      initial={{ y: -10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.5, type: "spring" }}
                      className="absolute -top-6 sm:-top-8 left-1/2 -translate-x-1/2 z-10"
                    >
                      <Crown className="w-8 h-8 sm:w-10 sm:h-10 text-yellow-400 drop-shadow-lg" fill="#facc15" />
                    </motion.div>
                  )}
                  
                  {/* Avatar Ring */}
                  <motion.div 
                    className={`${avatarSizes[displayIndex]} rounded-full p-1 sm:p-1.5 bg-gradient-to-br ${gradients[actualIndex]} shadow-2xl`}
                    whileHover={{ scale: 1.05 }}
                  >
                    {getProfileAvatar(actualProfile) ? (
                      <img 
                        src={getProfileAvatar(actualProfile)} 
                        alt="Avatar"
                        className="w-full h-full rounded-full object-cover bg-white"
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-2xl sm:text-3xl font-bold text-gray-700">
                        {getUserName(actualProfile.user_id)?.charAt(0)}
                      </div>
                    )}
                  </motion.div>
                  
                  {/* Rank badge */}
                  <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br ${gradients[actualIndex]} flex items-center justify-center text-white font-bold text-sm sm:text-base shadow-xl border-3 border-white`}>
                    {actualIndex + 1}
                  </div>
                </div>
                
                {/* Podium */}
                <div className={`${heights[displayIndex]} w-28 sm:w-40 md:w-48 rounded-t-3xl bg-gradient-to-b ${gradients[actualIndex]} text-white relative overflow-hidden shadow-2xl`}>
                  {/* Shine effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                  <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/20 to-transparent" />
                  
                  <div className="h-full flex flex-col items-center justify-start pt-4 sm:pt-6 p-3 sm:p-4 relative z-10">
                    <p className="font-bold text-sm sm:text-lg mb-1 text-center truncate w-full px-1">{getUserName(actualProfile.user_id)}</p>
                    <div className="flex items-center gap-1 mb-3 opacity-90">
                      <Zap className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="text-xs sm:text-sm font-medium">Lvl {actualProfile.level || 1}</span>
                    </div>
                    
                    <div className="mt-auto bg-white/25 rounded-2xl px-4 sm:px-6 py-2 sm:py-3 backdrop-blur-sm text-center w-full">
                      <p className="text-2xl sm:text-3xl font-black leading-tight">{actualProfile.xp_points || 0}</p>
                      <p className="text-xs sm:text-sm font-medium opacity-90">XP</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Full Leaderboard */}
        <ClayCard elevated>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Star className="w-6 h-6 text-yellow-500" />
              All Rankings
            </h2>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Flame className="w-4 h-4 text-orange-500" />
              <span>{profiles.length} players</span>
            </div>
          </div>
          <div className="space-y-3">
            {profiles.map((profile, index) => (
              <motion.div
                key={profile.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                whileHover={{ scale: 1.01, x: 4 }}
                className={`flex items-center gap-3 p-3 rounded-2xl transition-all cursor-pointer ${
                  profile.user_id === currentUser?.id || profile.user_id === currentUser?.email
                    ? 'bg-gradient-to-r from-purple-100 to-blue-100 border-2 border-purple-400 shadow-lg' 
                    : 'bg-white/70 hover:bg-white hover:shadow-md'
                }`}
                onClick={() => setSelectedUser(selectedUser === profile.id ? null : profile.id)}
              >
                {/* Rank Number */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                  index < 3 
                    ? `bg-gradient-to-br ${['from-yellow-400 to-orange-400', 'from-gray-300 to-gray-400', 'from-amber-500 to-orange-400'][index]} text-white shadow-lg`
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {index + 1}
                </div>

                {/* Avatar */}
                <div className="relative flex-shrink-0 -ml-1">
                  {getProfileAvatar(profile) ? (
                    <img 
                      src={getProfileAvatar(profile)} 
                      alt="Avatar"
                      className="w-11 h-11 rounded-full object-cover bg-gray-100 border-2 border-white shadow-md"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white font-bold text-lg border-2 border-white shadow-md">
                      {getUserName(profile.user_id)?.charAt(0)}
                    </div>
                  )}
                  {index < 3 && (
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center ${
                      index === 0 ? 'bg-yellow-400' : index === 1 ? 'bg-gray-400' : 'bg-amber-600'
                    }`}>
                      {index === 0 ? <Crown className="w-2.5 h-2.5 text-white" /> : 
                       index === 1 ? <Award className="w-2.5 h-2.5 text-white" /> : 
                       <Trophy className="w-2.5 h-2.5 text-white" />}
                    </div>
                  )}
                </div>

                <div className="flex-1 relative min-w-0">
                  <div className="font-bold flex items-center gap-2 truncate">
                    <span className="truncate">{getUserName(profile.user_id)}</span>
                    {(profile.user_id === currentUser?.id || profile.user_id === currentUser?.email) && (
                      <span className="flex-shrink-0 text-xs px-2 py-0.5 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-full font-bold">You</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-purple-500" />
                      Lvl {profile.level || 1}
                    </span>
                    <span className="flex items-center gap-1">
                      <Flame className="w-3 h-3 text-orange-500" />
                      {profile.current_streak || 0} streak
                    </span>
                  </div>
                  
                  {/* User Action Popup */}
                  {selectedUser === profile.id && profile.user_id !== currentUser?.id && profile.user_id !== currentUser?.email && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="absolute left-16 top-0 bg-white rounded-xl shadow-2xl border border-gray-100 p-2 z-50 min-w-[160px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => viewProfile(profile.user_id)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg hover:bg-gray-50 text-gray-700 w-full transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        View Profile
                      </button>
                      <button
                        onClick={() => handleAddFriend(profile.user_id)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg hover:bg-green-50 text-green-600 w-full transition-colors"
                      >
                        <UserPlus className="w-4 h-4" />
                        Add Friend
                      </button>
                    </motion.div>
                  )}
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-xl font-black gradient-text">{profile.xp_points || 0}</p>
                  <p className="text-xs text-gray-500 font-medium">XP</p>
                </div>
              </motion.div>
            ))}
          </div>
        </ClayCard>
      </div>
    </div>
  );
}