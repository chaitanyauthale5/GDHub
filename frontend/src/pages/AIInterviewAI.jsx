import { api } from '@/api/apiClient';
import { analyzeInterview } from '@/api/geminiClient';
import useVapi from '@/hooks/useVapi';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'framer-motion';
import { ArrowLeft, Bot, Clock, LogOut, RefreshCcw, Volume2, VolumeX } from 'lucide-react';
import TopNav from '../components/navigation/TopNav';

export default function AIInterviewAI() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [aiMuted, setAiMuted] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiInterviewId, setAiInterviewId] = useState(null);
  const [finalizingInterview, setFinalizingInterview] = useState(false);

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
      // Create AIInterview record so Progress can count it
      if (user) {
        const code = `AIV${Date.now().toString().slice(-6)}`;
        const rec = await api.entities.AIInterview.create({
          room_code: code,
          host_id: user.email,
          host_name: user.full_name,
          interview_type: config.interview_type,
          company: config.company,
          role: config.role,
          duration: config.duration,
          status: 'active',
          participants: [{ user_id: user.email, name: user.full_name, joined_at: new Date().toISOString() }]
        });
        setAiInterviewId(rec?.id || rec?._id || null);
      }
    } catch (e) {
      console.error('Error starting Vapi interview:', e);
    } finally {
      setLoading(false);
    }
  };

  const endInterview = async () => {
    if (finalizingInterview) return;
    setFinalizingInterview(true);

    if (isSessionActive) {
      try {
        await stopCall();
      } catch (e) {
        console.error('Error stopping Vapi interview:', e);
      }
    }

    setLoading(true);

    const messages = conversation.map(m => ({ role: m.role, content: m.content }));
    const transcriptText = conversation
      .map(m => `${m.role === 'ai' ? 'AI Interviewer' : 'You'}: ${m.content}`)
      .join('\n');

    let analysis = null;
    try {
      analysis = await analyzeInterview({
        transcript: transcriptText,
        interview_type: config.interview_type,
        role: config.role,
        company: config.company,
        duration_minutes: Math.max(1, Math.round(timeElapsed / 60)),
      });
    } catch (error) {
      console.error('Interview analysis failed:', error);
    }

    try {
      await api.entities.AIInterviewSession.create({
        user_id: user?.id || user?.email || 'guest',
        interview_type: config.interview_type,
        company: config.company,
        role: config.role,
        transcript: transcriptText,
        messages,
        analysis: analysis || undefined,
      });
    } catch (sessionError) {
      console.error('Failed to save AI interview session:', sessionError);
    }

    try {
      if (aiInterviewId) {
        await api.entities.AIInterview.update(aiInterviewId, { status: 'completed' });
      }
    } catch (e) {
      console.warn('Failed to update AI interview status:', e);
    }

    if (analysis && typeof window !== 'undefined' && window.sessionStorage) {
      try {
        window.sessionStorage.setItem('aiInterviewAnalysisPayload', JSON.stringify({
          analysis,
          generatedAt: Date.now(),
        }));
      } catch (storageErr) {
        console.warn('Unable to cache AI interview analysis:', storageErr);
      }
    }

    setFinalizingInterview(false);
    setLoading(false);

    navigate(createPageUrl('AIInterviewAnalysis'), { state: { analysis } });
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
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-cyan-50 to-white pb-16">
        <TopNav activePage="Explore" user={user} />
        <div className="max-w-xl mx-auto pt-16 px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100"
          >
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg">
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
                disabled={loading}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-500 text-white font-bold text-lg shadow-xl disabled:opacity-60"
              >
                {loading ? 'Connecting…' : 'Start AI Interview'}
              </motion.button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 pb-16">
      <TopNav activePage="Explore" user={user} />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        <div className="flex items-center justify-between mb-4 text-white/90">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm font-semibold hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-2xl">
            <Clock className="w-5 h-5" />
            <span className="font-mono text-lg">{formatTime(timeElapsed)}</span>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/10 border border-white/10 rounded-3xl p-6 backdrop-blur"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <p className="text-sm uppercase tracking-widest text-emerald-200 font-semibold">Live Interview</p>
              <h2 className="text-2xl font-black text-white">{config.role}</h2>
              <p className="text-sm text-white/70">{config.company || 'Practice company'} • {config.interview_type.toUpperCase()} round</p>
            </div>
            <button
              onClick={endInterview}
              disabled={finalizingInterview || !conversation.length}
              className="px-5 py-3 rounded-2xl bg-red-500 text-white font-bold flex items-center gap-2 hover:bg-red-600 disabled:opacity-50"
            >
              <LogOut className="w-5 h-5" />
              {finalizingInterview ? 'Finishing…' : 'End Interview'}
            </button>
          </div>

          <div className="grid gap-6">
            <div className="rounded-3xl bg-white text-gray-900 p-5 shadow-inner border border-gray-100 h-[320px] overflow-y-auto">
              {conversation.length === 0 && !loading && (
                <p className="text-gray-400 text-sm">Your live transcript will appear here as you and the interviewer speak.</p>
              )}
              {conversation.length > 0 && conversation.map((msg, index) => (
                <p key={index} className="mb-2 text-sm">
                  <span className="font-semibold text-gray-800">{msg.role === 'ai' ? 'AI Interviewer' : 'You'}:</span>{' '}
                  {msg.content}
                </p>
              ))}
              {loading && (
                <div className="mt-3 flex gap-1">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <button
                onClick={() => setAiMuted(!aiMuted)}
                className={`w-full sm:w-auto px-5 py-3 rounded-2xl flex items-center justify-center gap-2 font-semibold ${aiMuted ? 'bg-red-500 text-white' : 'bg-white/10 text-white'} transition-all`}
              >
                {aiMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                {aiMuted ? 'AI Muted' : 'Mute AI'}
              </button>

              <button
                onClick={toggleCall}
                className={`flex-1 sm:flex-none px-6 py-3 rounded-2xl font-bold text-white flex items-center justify-center gap-3 shadow-lg transition-all ${
                  isSessionActive ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
                }`}
              >
                <RefreshCcw className="w-5 h-5" />
                {isSessionActive ? 'Reconnect' : 'Start Call'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}