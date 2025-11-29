import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { Bot, Mic, MicOff, Clock, ArrowLeft, Volume2, VolumeX, Send, LogOut } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

export default function AIInterviewAI() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [aiMuted, setAiMuted] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [config, setConfig] = useState({
    interview_type: 'hr',
    company: '',
    role: 'Software Engineer',
    duration: 15
  });

  const recognitionRef = useRef(null);
  const synthRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    loadUser();
    initSpeech();
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (synthRef.current) window.speechSynthesis.cancel();
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

  const loadUser = async () => {
    const currentUser = await base44.auth.me();
    setUser(currentUser);
  };

  const initSpeech = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      
      recognitionRef.current.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setCurrentTranscript(transcript);
        
        if (event.results[event.results.length - 1].isFinal) {
          handleUserResponse(transcript);
          setCurrentTranscript('');
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
    }
    synthRef.current = window.speechSynthesis;
  };

  const speak = (text) => {
    if (aiMuted || !synthRef.current) return;
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    synthRef.current.speak(utterance);
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const startInterview = async () => {
    setInterviewStarted(true);
    setLoading(true);
    
    const interviewContext = `You are an AI interviewer conducting a ${config.interview_type} interview${config.company ? ` for ${config.company}` : ''}${config.role ? ` for the role of ${config.role}` : ''}. 
    Start with a warm greeting and ask the first interview question. Be professional but friendly. 
    Keep responses conversational and under 100 words.`;

    const response = await base44.integrations.Core.InvokeLLM({
      prompt: interviewContext,
      response_json_schema: {
        type: "object",
        properties: {
          message: { type: "string" },
          question: { type: "string" }
        }
      }
    });

    const aiMessage = response.message + " " + response.question;
    setConversation([{ role: 'ai', content: aiMessage }]);
    speak(aiMessage);
    setLoading(false);
  };

  const handleUserResponse = async (userText) => {
    if (!userText.trim()) return;
    
    setConversation(prev => [...prev, { role: 'user', content: userText }]);
    setLoading(true);

    const conversationHistory = conversation.map(m => `${m.role === 'ai' ? 'Interviewer' : 'Candidate'}: ${m.content}`).join('\n');
    
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an AI interviewer conducting a ${config.interview_type} interview. 
      
Previous conversation:
${conversationHistory}
Candidate: ${userText}

Based on the candidate's response, provide feedback if needed and ask the next relevant question. 
Keep your response under 100 words and conversational.`,
      response_json_schema: {
        type: "object",
        properties: {
          feedback: { type: "string" },
          next_question: { type: "string" }
        }
      }
    });

    const aiMessage = (response.feedback ? response.feedback + " " : "") + response.next_question;
    setConversation(prev => [...prev, { role: 'ai', content: aiMessage }]);
    speak(aiMessage);
    setLoading(false);
  };

  const handleTextSubmit = () => {
    if (inputText.trim()) {
      handleUserResponse(inputText);
      setInputText('');
    }
  };

  const endInterview = async () => {
    window.speechSynthesis.cancel();
    if (recognitionRef.current) recognitionRef.current.stop();
    
    // Generate analysis
    setLoading(true);
    const conversationText = conversation.map(m => `${m.role === 'ai' ? 'Interviewer' : 'Candidate'}: ${m.content}`).join('\n');
    
    const analysis = await base44.integrations.Core.InvokeLLM({
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
        <div className="flex-1 overflow-y-auto space-y-4 mb-6">
          {conversation.map((msg, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] p-4 rounded-2xl ${
                msg.role === 'user' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-700 text-white'
              }`}>
                {msg.content}
              </div>
            </motion.div>
          ))}
          {currentTranscript && (
            <div className="flex justify-end">
              <div className="max-w-[80%] p-4 rounded-2xl bg-blue-400/50 text-white italic">
                {currentTranscript}...
              </div>
            </div>
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="p-4 rounded-2xl bg-gray-700 text-white">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
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
            onClick={toggleListening}
            className={`p-6 rounded-full ${isListening ? 'bg-red-500 animate-pulse' : 'bg-green-500'} text-white shadow-xl`}
          >
            {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
          </button>

          <div className="flex-1 flex gap-2">
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleTextSubmit()}
              placeholder="Or type your response..."
              className="bg-gray-700 border-none text-white placeholder:text-gray-400"
            />
            <button
              onClick={handleTextSubmit}
              className="p-3 rounded-xl bg-blue-500 text-white"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}