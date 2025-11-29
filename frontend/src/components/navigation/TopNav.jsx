import { api } from '@/api/apiClient';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check, LogOut, MessageCircle, User, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import XPBadge from '../shared/XPBadge';

export default function TopNav({ activePage = 'Dashboard', user }) {
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [myProfile, setMyProfile] = useState(null);

  const navItems = ['Dashboard', 'Explore', 'Progress', 'Leaderboard', 'About'];

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    try {
      const me = await api.auth.me();

      if (!me) {
        setCurrentUser(null);
        setFriendRequests([]);
        setNotifications([]);
        setFriends([]);
        return;
      }

      setCurrentUser(me);

      // Get pending friend requests
      const pendingRequests = await api.entities.FriendRequest.filter({
        to_user_id: me.email,
        status: 'pending'
      });
      setFriendRequests(pendingRequests);

      // Get notifications
      const notifs = await api.entities.Notification.filter({
        user_id: me.email,
        is_read: false
      });
      setNotifications(notifs);

      // Get friends for chat - check both email and id
      let profileData = await api.entities.UserProfile.filter({ user_id: me.email });
      if (profileData.length === 0) {
        profileData = await api.entities.UserProfile.filter({ user_id: me.id });
      }

      if (profileData.length > 0) {
        setMyProfile(profileData[0]);
        if (profileData[0].friends && profileData[0].friends.length > 0) {
          const allUsers = await api.entities.User.list();
          const friendList = allUsers.filter(u =>
            profileData[0].friends.includes(u.email) || profileData[0].friends.includes(u.id)
          );
          setFriends(friendList);
        } else {
          setFriends([]);
        }
      } else {
        setFriends([]);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const acceptFriendRequest = async (request) => {
    // Update request status
    await api.entities.FriendRequest.update(request.id, { status: 'accepted' });

    // Add to both users' friends lists
    let myProfiles = await api.entities.UserProfile.filter({ user_id: currentUser.email });
    if (myProfiles.length === 0) {
      myProfiles = await api.entities.UserProfile.filter({ user_id: currentUser.id });
    }
    let theirProfiles = await api.entities.UserProfile.filter({ user_id: request.from_user_id });
    if (theirProfiles.length === 0) {
      // create their profile if missing
      const created = await api.entities.UserProfile.create({ user_id: request.from_user_id, xp_points: 0, level: 1, friends: [] });
      theirProfiles = [created];
    }
    if (myProfiles.length === 0) {
      const createdMine = await api.entities.UserProfile.create({ user_id: currentUser.email, xp_points: 0, level: 1, friends: [] });
      myProfiles = [createdMine];
    }

    const myFriends = Array.from(new Set([...(myProfiles[0].friends || []), request.from_user_id]));
    await api.entities.UserProfile.update(myProfiles[0].id, { friends: myFriends });

    const theirFriends = Array.from(new Set([...(theirProfiles[0].friends || []), currentUser.email]));
    await api.entities.UserProfile.update(theirProfiles[0].id, { friends: theirFriends });

    // Send notification to the requester
    await api.entities.Notification.create({
      user_id: request.from_user_id,
      type: 'friend_request',
      title: 'Friend Request Accepted',
      message: `${currentUser.full_name} accepted your friend request`,
      from_user_id: currentUser.email,
      is_read: false
    });

    loadNotifications();
  };

  const rejectFriendRequest = async (request) => {
    await api.entities.FriendRequest.update(request.id, { status: 'rejected' });
    loadNotifications();
  };

  const openChat = (friendId) => {
    navigate(createPageUrl(`Chat?friendId=${friendId}`));
    setShowChat(false);
  };

  const toggleNotifications = async () => {
    const willOpen = !showNotifications;
    setShowNotifications(willOpen);
    setShowChat(false);
    setShowProfileMenu(false);
    if (willOpen && currentUser) {
      try {
        const unread = await api.entities.Notification.filter({ user_id: currentUser.email, is_read: false });
        await Promise.all(unread.map(n => api.entities.Notification.update(n.id, { is_read: true })));
        // refresh counts
        loadNotifications();
      } catch (e) { }
    }
  };

  return (
    <nav className="sticky top-0 left-0 right-0 z-50 bg-white border-b-2 border-gray-100 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
              <span className="text-white font-black text-lg sm:text-xl">SU</span>
            </div>
            <span className="text-xl sm:text-2xl font-black text-gray-900">SpeakUp</span>
          </div>

          {/* Nav Items */}
          <div className="hidden md:flex items-center gap-3">
            {navItems.map((item) => (
              <Link
                key={item}
                to={createPageUrl(item)}
                className={`px-6 py-2.5 rounded-full font-bold transition-all ${activePage === item
                    ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-xl'
                    : 'text-gray-700 hover:bg-gray-100'
                  }`}
              >
                {item}
              </Link>
            ))}
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <XPBadge xp={user?.xp_points || 0} level={user?.level || 1} />
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={toggleNotifications}
                className="p-2.5 sm:p-3 rounded-full bg-gray-100 hover:bg-gray-200 transition-all relative"
              >
                <Bell className="w-5 h-5 text-gray-700" />
                {(friendRequests.length > 0 || notifications.length > 0) && (
                  <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
                    {friendRequests.length + notifications.length}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl p-4 shadow-2xl border border-gray-100 z-50 max-h-96 overflow-y-auto"
                  >
                    <h3 className="font-bold text-lg mb-3">Notifications</h3>

                    {/* Friend Requests */}
                    {friendRequests.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-bold text-gray-500 uppercase mb-2">Friend Requests</p>
                        <div className="space-y-2">
                          {friendRequests.map((request) => (
                            <div key={request.id} className="p-3 bg-purple-50 rounded-xl border border-purple-200">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold">
                                  {request.from_user_name?.charAt(0) || 'U'}
                                </div>
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{request.from_user_name}</p>
                                  <p className="text-xs text-gray-600">Wants to be your friend</p>
                                </div>
                              </div>
                              <div className="flex gap-2 mt-3">
                                <button
                                  onClick={() => acceptFriendRequest(request)}
                                  className="flex-1 py-2 rounded-lg bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-1 hover:bg-green-600"
                                >
                                  <Check className="w-4 h-4" />
                                  Accept
                                </button>
                                <button
                                  onClick={() => rejectFriendRequest(request)}
                                  className="flex-1 py-2 rounded-lg bg-gray-200 text-gray-700 font-bold text-sm flex items-center justify-center gap-1 hover:bg-gray-300"
                                >
                                  <X className="w-4 h-4" />
                                  Decline
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Other Notifications */}
                    {notifications.length > 0 ? (
                      <div className="space-y-2">
                        {notifications.map((notif) => (
                          <div key={notif.id} className="p-3 bg-gray-50 rounded-xl">
                            <p className="text-sm font-medium">{notif.title}</p>
                            <p className="text-xs text-gray-600">{notif.message}</p>
                          </div>
                        ))}
                      </div>
                    ) : friendRequests.length === 0 ? (
                      <div className="text-center py-6 text-gray-400">
                        <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No new notifications</p>
                      </div>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Chat */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowChat(!showChat);
                  setShowNotifications(false);
                  setShowProfileMenu(false);
                }}
                className="p-2.5 sm:p-3 rounded-full bg-gray-100 hover:bg-gray-200 transition-all"
              >
                <MessageCircle className="w-5 h-5 text-gray-700" />
              </button>

              <AnimatePresence>
                {showChat && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 mt-2 w-72 sm:w-80 bg-white rounded-2xl p-4 shadow-2xl border border-gray-100 z-50"
                  >
                    <h3 className="font-bold text-lg mb-3">Chat with Friends</h3>
                    {friends.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {friends.map((friend) => (
                          <button
                            key={friend.id}
                            onClick={() => openChat(friend.email)}
                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all"
                          >
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold">
                              {friend.full_name?.charAt(0) || 'U'}
                            </div>
                            <div className="text-left">
                              <p className="font-medium">{friend.full_name}</p>
                              <p className="text-xs text-gray-500">Click to chat</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No friends yet</p>
                        <p className="text-xs mt-1">Add friends from the leaderboard!</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowProfileMenu(!showProfileMenu);
                  setShowNotifications(false);
                  setShowChat(false);
                }}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden bg-gradient-to-r from-purple-500 to-blue-500 text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-all"
              >
                {myProfile?.avatar ? (
                  <img src={myProfile.avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5" />
                )}
              </button>

              <AnimatePresence>
                {showProfileMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 mt-2 w-48 bg-white rounded-2xl p-2 shadow-2xl border border-gray-100 z-50"
                  >
                    <Link
                      to={createPageUrl('Profile')}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors"
                      onClick={() => setShowProfileMenu(false)}
                    >
                      <User className="w-5 h-5 text-gray-600" />
                      <span className="font-medium">Profile</span>
                    </Link>
                    <button
                      onClick={() => {
                        api.auth.logout();
                        setShowProfileMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 text-red-600 transition-colors"
                    >
                      <LogOut className="w-5 h-5" />
                      <span className="font-medium">Logout</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}