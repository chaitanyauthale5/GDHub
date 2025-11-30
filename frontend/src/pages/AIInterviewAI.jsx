import { api } from '@/api/apiClient';
import useVapi from '@/hooks/useVapi';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'framer-motion';
import { ArrowLeft, Bot, Clock, LogOut, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

export default function AIInterviewAI() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [aiMuted, setAiMuted] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [loading, setLoading] = useState(false);

  const [config, setConfig] = useState({
    interview_type: 'hr',
    company: '',
    role: 'Software Engineer',
    duration: 15
  });

  const { volumeLevel, isSessionActive, conversation, toggleCall, stopCall, resetConversation } = useVapi();
  const chatEndRef = useRef(null);

  useEffect(() => {
    loadUser();
    return () => {
      resetConversation();
    };
  }, []);

  useEffect(() => {
    if (interviewStarted) {
      const timer = setInterval(() => setTimeElapsed(prev => prev + 1), 1000);
      return () => clearInterval(timer);
    }
  }, [interviewStarted]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  useEffect(() => {
    setIsSpeaking(volumeLevel > 0.08);
  }, [volumeLevel]);

  const loadUser = async () => {
    const currentUser = await api.auth.me();
    setUser(currentUser);
  };

  const startInterview = async () => {
    setInterviewStarted(true);
    setTimeElapsed(0);
    setLoading(true);
    try {
      await toggleCall();
    } catch (e) {
      console.error('Error starting Vapi interview:', e);
    } finally {
      setLoading(false);
    }
  };

  const endInterview = async () => {
    // Stop the Vapi call if it's still active
    if (isSessionActive) {
      try {
        await stopCall();
      } catch (e) {
        console.error('Error stopping Vapi interview:', e);
      }
    }

    // Generate analysis from the transcripted conversation
    setLoading(true);
    const conversationText = conversation.map(m => `${m.role === 'ai' ? 'Interviewer' : 'Candidate'}: ${m.content}`).join('\n');
    
    const analysis = await api.integrations.Core.InvokeLLM({
      prompt: `Analyze this interview conversation and provide feedback:

${conversationText}

Provide a detailed analysis.`,
      response_json_schema: {
        type: "object",
        properties: {
          overall_score: { type: "number" },
          strengths: { type: "array", items: { type: "string" } },
          improvements: { type: "array", items: { type: "string" } },
          communication_score: { type: "number" },
          confidence_score: { type: "number" },
          content_score: { type: "number" },
          summary: { type: "string" }
        }
      }
    });

    navigate(createPageUrl(`AIInterviewAnalysis?data=${encodeURIComponent(JSON.stringify(analysis))}`));
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const interviewTypes = [
    { id: 'hr', label: 'HR Interview' },
    { id: 'technical', label: 'Technical Interview' },
    { id: 'behavioral', label: 'Behavioral Interview' },
    { id: 'case_study', label: 'Case Study' }
  ];

  if (!interviewStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-6">
        <div className="max-w-xl mx-auto pt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-8 shadow-2xl"
          >
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center">
                <Bot className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-3xl font-black mb-2">AI Voice Interview</h1>
              <p className="text-gray-600">Real-time voice conversation with AI interviewer</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block">Interview Type</label>
                <Select value={config.interview_type} onValueChange={(val) => setConfig({...config, interview_type: val})}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {interviewTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block">Company (Optional)</label>
                <Input
                  placeholder="e.g., Google, Amazon"
                  value={config.company}
                  onChange={(e) => setConfig({...config, company: e.target.value})}
                  className="h-12"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block">Role</label>
                <Input
                  placeholder="e.g., Software Engineer"
                  value={config.role}
                  onChange={(e) => setConfig({...config, role: e.target.value})}
                  className="h-12"
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={startInterview}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-green-400 to-teal-500 text-white font-bold text-lg shadow-xl"
              >
                Start AI Interview
              </motion.button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Top Bar */}
      <div className="bg-gradient-to-r from-green-600 to-teal-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-white/80 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-white" />
            <span className="text-white font-bold">AI Interview</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-black/30 px-4 py-2 rounded-full">
            <Clock className="w-5 h-5 text-white" />
            <span className="font-mono font-bold text-lg text-white">{formatTime(timeElapsed)}</span>
          </div>
          <button
            onClick={endInterview}
            className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold flex items-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            End Interview
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        {/* AI Avatar */}
        <div className="flex justify-center mb-6">
          <motion.div
            animate={isSpeaking ? { scale: [1, 1.1, 1] } : {}}
            transition={{ repeat: Infinity, duration: 0.5 }}
            className="w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center shadow-2xl"
          >
            <Bot className="w-12 h-12 text-white" />
          </motion.div>
        </div>

        {/* Conversation */}
        <div className="mb-6 h-[400px] overflow-y-auto">
          <div
            className="rounded-3xl p-5 bg-white border-2 border-gray-100 shadow-inner text-sm text-gray-800 whitespace-pre-wrap"
          >
            {conversation.length === 0 && !loading && (
              <span className="text-gray-400">Your live transcript will appear here as you speak.</span>
            )}
            {conversation.length > 0 && (
              conversation.map((msg, index) => (
                <p key={index} className="mb-2">
                  <span className="font-semibold">
                    {msg.role === 'ai' ? 'AI Interviewer' : 'You'}:
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

        {/* Controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setAiMuted(!aiMuted)}
            className={`p-4 rounded-full ${aiMuted ? 'bg-red-500' : 'bg-gray-700'} text-white`}
          >
            {aiMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
          </button>

          <button
            onClick={toggleCall}
            className={`p-6 rounded-full ${isSessionActive ? 'bg-red-500 animate-pulse' : 'bg-green-500'} text-white shadow-xl`}
          >
            {isSessionActive ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
          </button>
        </div>
      </div>
    </div>
  );
}