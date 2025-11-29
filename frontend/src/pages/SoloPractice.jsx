import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { api } from '@/api/apiClient';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Mic, MicOff, Sparkles, ArrowRight, RefreshCw, Volume2, VolumeX, Square, Play, Edit3, ArrowLeft } from 'lucide-react';
import TopNav from '../components/navigation/TopNav';

export default function SoloPractice() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentTopic, setCurrentTopic] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [transcript, setTranscript] = useState('');
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionData, setSessionData] = useState({ messages: [], startTime: null });
  const [aiMuted, setAiMuted] = useState(false);
  const [autoMic, setAutoMic] = useState(true);
  
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);

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
    initSpeechRecognition();
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      synthRef.current.cancel();
    };
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await api.auth.me();
      setUser(currentUser);
    } catch (error) {
      console.error('Error loading user:', error);
    }
  };

  const initSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        setTranscript(prev => prev + finalTranscript);
        setUserInput(prev => prev + finalTranscript);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        if (isListening) {
          recognitionRef.current.start();
        }
      };
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setTranscript('');
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const speakText = (text) => {
    if (aiMuted) {
      // If muted, don't speak but still trigger auto-mic if enabled
      if (autoMic && recognitionRef.current) {
        setTranscript('');
        recognitionRef.current.start();
        setIsListening(true);
      }
      return;
    }
    
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // Auto-start mic when AI stops speaking if enabled
      if (autoMic && recognitionRef.current) {
        setTranscript('');
        recognitionRef.current.start();
        setIsListening(true);
      }
    };
    synthRef.current.speak(utterance);
  };

  const stopSpeaking = () => {
    synthRef.current.cancel();
    setIsSpeaking(false);
  };

  const selectTopic = (topic) => {
    setCurrentTopic(topic);
    setSessionStarted(true);
    setSessionData({ messages: [], startTime: new Date() });
    setConversation([]);
    
    const greeting = `Great choice! Let's discuss: "${topic}". Please share your thoughts on this topic. Take your time and speak naturally.`;
    setConversation([{ role: 'ai', content: { feedback: greeting } }]);
    speakText(greeting);
  };

  const setCustomTopicAndStart = () => {
    if (customTopic.trim()) {
      selectTopic(customTopic.trim());
      setShowCustomInput(false);
      setCustomTopic('');
    }
  };

  const getAIFeedback = async (userMessage) => {
    if (!userMessage.trim()) return;
    
    setLoading(true);
    const newConversation = [...conversation, { role: 'user', content: userMessage }];
    setConversation(newConversation);
    setUserInput('');

    try {
      const response = await api.integrations.Core.InvokeLLM({
        prompt: `You are an expert communication coach helping someone practice their speaking skills in a real-time voice conversation.

Topic: "${currentTopic}"
User said: "${userMessage}"
Conversation so far: ${JSON.stringify(newConversation.slice(-4))}

Provide helpful feedback in JSON format:
1. feedback: A brief, encouraging response (2-3 sentences). Be conversational like you're actually talking to them.
2. tips: An array of 1-2 quick tips to improve (keep them short for voice)
3. followUp: A follow-up question to keep the conversation going

Keep responses concise as they will be spoken aloud.`,
        response_json_schema: {
          type: "object",
          properties: {
            feedback: { type: "string" },
            tips: { type: "array", items: { type: "string" } },
            followUp: { type: "string" }
          }
        }
      });

      setConversation(prev => [...prev, { role: 'ai', content: response }]);
      setSessionData(prev => ({
        ...prev,
        messages: [...prev.messages, { role: 'user', content: userMessage }, { role: 'ai', content: response }]
      }));

      // Speak the AI response
      const spokenText = `${response.feedback} ${response.followUp}`;
      speakText(spokenText);
    } catch (error) {
      console.error('Error getting AI feedback:', error);
    }
    setLoading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (userInput.trim()) {
      // Stop listening when user sends response
      if (isListening) {
        recognitionRef.current?.stop();
        setIsListening(false);
      }
      getAIFeedback(userInput);
    }
  };

  const endSession = async () => {
    synthRef.current.cancel();
    recognitionRef.current?.stop();
    
    navigate(createPageUrl(`SoloAnalysis?topic=${encodeURIComponent(currentTopic)}&messages=${encodeURIComponent(JSON.stringify(sessionData.messages))}`));
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

            {/* Conversation */}
            <div className="space-y-4 mb-6 max-h-[400px] overflow-y-auto">
              {conversation.map((msg, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-2xl p-5 ${
                    msg.role === 'user' 
                      ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white ml-8' 
                      : 'bg-white border-2 border-gray-100 shadow-lg mr-8'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p>{msg.content}</p>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Bot className="w-5 h-5 text-cyan-500" />
                          <span className="font-bold text-cyan-600">AI Coach</span>
                        </div>
                        <button
                          onClick={() => isSpeaking ? stopSpeaking() : speakText(`${msg.content.feedback} ${msg.content.followUp || ''}`)}
                          className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"
                        >
                          {isSpeaking ? <Square className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-gray-800 mb-4">{msg.content.feedback}</p>
                      
                      {msg.content.tips && msg.content.tips.length > 0 && (
                        <div className="bg-cyan-50 rounded-xl p-4 mb-4">
                          <p className="font-bold text-cyan-700 mb-2 flex items-center gap-2">
                            <Sparkles className="w-4 h-4" /> Quick Tips
                          </p>
                          <ul className="space-y-1">
                            {msg.content.tips.map((tip, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-2 flex-shrink-0"></span>
                                {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {msg.content.followUp && (
                        <div className="bg-purple-50 rounded-xl p-4">
                          <p className="text-gray-700 font-medium">{msg.content.followUp}</p>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}

              {loading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl p-5 border-2 border-gray-100 shadow-lg mr-8">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-cyan-100 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-cyan-600 animate-pulse" />
                    </div>
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></span>
                      <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                      <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input Area with Voice */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-4 shadow-xl border-2 border-gray-100 sticky bottom-4">
              <form onSubmit={handleSubmit} className="flex gap-3">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`p-4 rounded-2xl font-bold transition-all flex-shrink-0 ${
                    isListening 
                      ? 'bg-red-500 text-white animate-pulse' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder={isListening ? "Listening..." : "Type or speak your response..."}
                  className="flex-1 px-5 py-4 rounded-2xl bg-gray-50 border-2 border-gray-200 focus:border-cyan-400 focus:outline-none text-gray-800 font-medium"
                />
                <button
                  type="submit"
                  disabled={!userInput.trim() || loading}
                  className="px-6 py-4 rounded-2xl bg-gradient-to-r from-cyan-400 to-teal-500 text-white font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </form>
              
              {/* Controls Row */}
              <div className="flex items-center justify-between mt-3 px-2">
                <div className="flex items-center gap-4">
                  {/* Auto Mic Checkbox */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoMic}
                      onChange={(e) => setAutoMic(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-500"
                    />
                    <span className="text-xs text-gray-600 font-medium">Auto Mic</span>
                  </label>
                  
                  {/* Mute AI Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setAiMuted(!aiMuted);
                      if (!aiMuted) {
                        synthRef.current.cancel();
                        setIsSpeaking(false);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      aiMuted 
                        ? 'bg-orange-100 text-orange-600' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {aiMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    {aiMuted ? 'AI Muted' : 'Mute AI'}
                  </button>
                </div>
                
                <p className="text-xs text-gray-500">
                  {isListening ? '🎤 Listening...' : autoMic ? 'Auto mic when AI stops' : 'Click mic to speak'}
                </p>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}