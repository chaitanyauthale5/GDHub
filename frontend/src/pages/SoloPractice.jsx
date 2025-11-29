import useVapi from '@/hooks/useVapi';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Bot, Edit3, Mic, MicOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopNav from '../components/navigation/TopNav';
import { createPageUrl } from '../utils';

export default function SoloPractice() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentTopic, setCurrentTopic] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  
  const chatEndRef = useRef(null);
  
  const {
    volumeLevel,
    isSessionActive,
    conversation,
    toggleCall,
    stopCall,
    resetConversation,
  } = useVapi({
    publicKey: import.meta.env.VITE_VAPI_PRACTICE_PUBLIC_KEY,
    assistantId: import.meta.env.VITE_VAPI_PRACTICE_ASSISTANT_ID,
  });

  const practiceTopics = [
    "Tell me about yourself and your career goals",
    "What are the advantages and disadvantages of remote work?",
    "How can technology improve education?",
    "Discuss the importance of work-life balance",
    "What qualities make a good leader?",
    "How should we address climate change?",
    "Describe a challenge you overcame and what you learned",
    "Should social media be regulated?",
    "The future of artificial intelligence in daily life",
    "How to maintain mental health in a busy world"
  ];

  useEffect(() => {
    loadUser();
    return () => {
      resetConversation();
    };
  }, []);

  useEffect(() => {
    setIsSpeaking(volumeLevel > 0.08);
  }, [volumeLevel]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  const loadUser = async () => {
    try {
      // auth.me is optional for this page; ignore failures
      const currentUser = await import('@/api/apiClient').then(m => m.api.auth.me());
      setUser(currentUser);
    } catch (error) {
      console.error('Error loading user:', error);
    }
  };

  const selectTopic = (topic) => {
    setCurrentTopic(topic);
    setSessionStarted(true);
    resetConversation();
    try {
      toggleCall();
    } catch (e) {
      console.error('Error starting Vapi practice session:', e);
    }
  };

  const setCustomTopicAndStart = () => {
    if (customTopic.trim()) {
      selectTopic(customTopic.trim());
      setShowCustomInput(false);
      setCustomTopic('');
    }
  };

  const endSession = async () => {
    // Stop Vapi call if active
    if (isSessionActive) {
      try {
        await stopCall();
      } catch (e) {
        console.error('Error stopping Vapi practice session:', e);
      }
    }

    const messages = conversation.map(m => ({ role: m.role, content: m.content }));
    navigate(createPageUrl(`SoloAnalysis?topic=${encodeURIComponent(currentTopic)}&messages=${encodeURIComponent(JSON.stringify(messages))}`));
  };

  return (
    <div className="min-h-screen pb-20 bg-gradient-to-br from-gray-50 to-cyan-50">
      <TopNav activePage="Explore" user={user} />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium mb-4 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
          <div className="text-center">
            <div className={`w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center shadow-xl ${isSpeaking ? 'animate-pulse' : ''}`}>
              <Bot className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-black mb-2">AI Voice Coach</h1>
            <p className="text-gray-600">Practice speaking with real-time AI voice feedback</p>
          </div>
        </motion.div>

        {!sessionStarted ? (
          <>
            {/* Topic Selection */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-6 shadow-xl border-2 border-gray-100 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Choose a Topic</h2>
                <button
                  onClick={() => setShowCustomInput(!showCustomInput)}
                  className="px-4 py-2 rounded-xl bg-purple-100 text-purple-700 font-bold text-sm flex items-center gap-2 hover:bg-purple-200 transition-all"
                >
                  <Edit3 className="w-4 h-4" />
                  Custom Topic
                </button>
              </div>

              <AnimatePresence>
                {showCustomInput && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-4 overflow-hidden">
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={customTopic}
                        onChange={(e) => setCustomTopic(e.target.value)}
                        placeholder="Enter your own topic..."
                        className="flex-1 px-4 py-3 rounded-xl bg-gray-50 border-2 border-gray-200 focus:border-purple-400 focus:outline-none"
                      />
                      <button
                        onClick={setCustomTopicAndStart}
                        disabled={!customTopic.trim()}
                        className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold disabled:opacity-50"
                      >
                        Start
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {practiceTopics.map((topic, index) => (
                  <motion.button
                    key={index}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => selectTopic(topic)}
                    className="p-4 rounded-2xl bg-gray-50 hover:bg-cyan-50 border-2 border-gray-100 hover:border-cyan-200 text-left transition-all"
                  >
                    <p className="font-medium text-gray-800">{topic}</p>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </>
        ) : (
          <>
            {/* Active Session */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-6 shadow-xl border-2 border-gray-100 mb-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-bold text-cyan-600 mb-2">CURRENT TOPIC</p>
                  <h2 className="text-xl font-bold text-gray-900">{currentTopic}</h2>
                </div>
                <button
                  onClick={endSession}
                  className="px-4 py-2 rounded-xl bg-red-100 text-red-600 font-bold hover:bg-red-200 transition-all"
                >
                  End Session
                </button>
              </div>
            </motion.div>

            {/* Conversation (from Vapi transcripts) */}
            <div className="mb-6 h-[400px] overflow-y-auto">
              <div className="rounded-3xl p-5 bg-white border-2 border-gray-100 shadow-inner text-sm text-gray-800 whitespace-pre-wrap">
                {conversation.length === 0 && !loading && (
                  <p className="text-gray-400">
                    Your conversation transcript with the AI Coach will appear here.
                  </p>
                )}
                {conversation.length > 0 && (
                  conversation.map((msg, index) => (
                    <p key={index} className="mb-2">
                      <span className="font-semibold">
                        {msg.role === 'ai' ? 'AI Coach' : 'You'}:
                      </span>{' '}
                      {msg.content}
                    </p>
                  ))
                )}
                {loading && (
                  <div className="mt-2 flex gap-1">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Input Area with Vapi Voice */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-4 shadow-xl border-2 border-gray-100 sticky bottom-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={toggleCall}
                  className={`p-4 rounded-2xl font-bold transition-all flex-shrink-0 ${
                    isSessionActive 
                      ? 'bg-red-500 text-white animate-pulse' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {isSessionActive ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>
                <div className="flex-1">
                  <p className="text-sm text-gray-700 font-medium">Talk with your AI Voice Coach</p>
                  <p className="text-xs text-gray-500">Use your microphone to practice speaking. Transcripts will appear above.</p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}