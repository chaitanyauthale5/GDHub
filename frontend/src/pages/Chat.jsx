import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { ArrowLeft, Send, User } from 'lucide-react';
import TopNav from '../components/navigation/TopNav';
import ClayCard from '../components/shared/ClayCard';
import { Input } from '@/components/ui/input';

export default function Chat() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const friendId = urlParams.get('friendId');
  
  const [user, setUser] = useState(null);
  const [friend, setFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [friendId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadData = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      const allUsers = await base44.entities.User.list();
      const friendUser = allUsers.find(u => u.id === friendId || u.email === friendId);
      setFriend(friendUser);

      await loadMessages();
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    if (!friendId) return;
    
    try {
      const currentUser = await base44.auth.me();
      
      // Get messages between the two users
      const allMessages = await base44.entities.ChatMessage.list('-created_date', 100);
      
      const conversation = allMessages.filter(m => 
        (m.from_user_id === currentUser.email && m.to_user_id === friendId) ||
        (m.from_user_id === friendId && m.to_user_id === currentUser.email)
      ).reverse();

      setMessages(conversation);

      // Mark messages as read
      const unreadMessages = conversation.filter(m => 
        m.to_user_id === currentUser.email && !m.is_read
      );
      for (const msg of unreadMessages) {
        await base44.entities.ChatMessage.update(msg.id, { is_read: true });
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !user || !friend) return;

    await base44.entities.ChatMessage.create({
      from_user_id: user.email,
      from_user_name: user.full_name,
      to_user_id: friend.email,
      message: inputMessage,
      is_read: false
    });

    setInputMessage('');
    await loadMessages();
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
      <TopNav activePage="Dashboard" />
      
      <div className="max-w-3xl mx-auto px-4 pt-24">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold">
              {friend?.full_name?.charAt(0) || 'U'}
            </div>
            <div>
              <h2 className="font-bold text-lg">{friend?.full_name || 'Unknown'}</h2>
              <p className="text-sm text-gray-500">{friend?.email}</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <ClayCard className="h-[60vh] flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400">
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((message, index) => (
                <motion.div
                  key={message.id || index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${message.from_user_id === user?.email ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] p-3 rounded-2xl ${
                      message.from_user_id === user?.email
                        ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    <p>{message.message}</p>
                    <p className={`text-xs mt-1 ${
                      message.from_user_id === user?.email ? 'text-white/70' : 'text-gray-400'
                    }`}>
                      {new Date(message.created_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 p-4">
            <div className="flex gap-2">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                className="flex-1"
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={sendMessage}
                disabled={!inputMessage.trim()}
                className="p-3 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
              </motion.button>
            </div>
          </div>
        </ClayCard>
      </div>
    </div>
  );
}