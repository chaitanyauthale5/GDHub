import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { api } from '@/api/apiClient';
import { motion } from 'framer-motion';

import { Users, Clock, ArrowLeft, LogOut, Copy, Check } from 'lucide-react';

export default function HumanInterviewRoom() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('roomId');
  
  const [user, setUser] = useState(null);
  const [room, setRoom] = useState(null);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const jitsiContainerRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    loadData();
    return () => {
      if (apiRef.current) {
        apiRef.current.dispose();
      }
    };
  }, []);

  useEffect(() => {
    if (room) {
      const timer = setInterval(() => {
        setTimeElapsed(prev => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [room]);

  useEffect(() => {
    if (room && user && jitsiContainerRef.current && !apiRef.current) {
      initJitsi();
    }
  }, [room, user]);

  const loadData = async () => {
    try {
      const currentUser = await api.auth.me();
      setUser(currentUser);

      const [roomData] = await api.entities.AIInterview.filter({ id: roomId });
      if (roomData) {
        setRoom(roomData);
        
        if (roomData.status === 'lobby') {
          await api.entities.AIInterview.update(roomId, { status: 'active' });
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const initJitsi = () => {
    const script = document.createElement('script');
    script.src = 'https://meet.jit.si/external_api.js';
    script.async = true;
    script.onload = () => {
      apiRef.current = new window.JitsiMeetExternalAPI('meet.jit.si', {
        roomName: `SpeakUp_Interview_${room.room_code}`,
        parentNode: jitsiContainerRef.current,
        userInfo: {
          displayName: user.full_name,
          email: user.email
        },
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinPageEnabled: false
        },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: [
            'microphone', 'camera', 'closedcaptions', 'desktop',
            'fullscreen', 'fodeviceselection', 'chat', 'raisehand',
            'videoquality', 'filmstrip', 'tileview', 'settings'
          ],
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false
        }
      });
    };
    document.body.appendChild(script);
  };

  const endInterview = async () => {
    try {
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
      if (roomId) {
        await api.entities.AIInterview.update(roomId, { status: 'completed' });
      }
    } catch (error) {
      console.error('Error ending interview:', error);
    } finally {
      navigate(createPageUrl('AIInterviewHub'));
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(room?.room_code || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Top Bar */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={endInterview}
            className="flex items-center gap-2 text-white/80 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-white" />
            <span className="text-white font-bold">Human Interview</span>
          </div>
          <button
            onClick={copyRoomCode}
            className="px-3 py-1.5 rounded-lg bg-white/20 text-white text-sm flex items-center gap-2"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {room.room_code}
          </button>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-black/30 px-4 py-2 rounded-full">
            <Clock className="w-5 h-5 text-white" />
            <span className="font-mono font-bold text-lg text-white">
              {formatTime(timeElapsed)}
            </span>
          </div>
          <button
            onClick={endInterview}
            className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold flex items-center gap-2 transition-all"
          >
            <LogOut className="w-5 h-5" />
            Exit
          </button>
        </div>
      </div>

      {/* Interview Type Banner */}
      <div className="bg-gray-800 px-4 py-2 text-center">
        <p className="text-gray-400 text-sm">
          {room.interview_type?.toUpperCase()} Interview 
          {room.company && ` • ${room.company}`}
          {room.role && ` • ${room.role}`}
        </p>
      </div>

      {/* Jitsi Container */}
      <div ref={jitsiContainerRef} className="flex-1" />
    </div>
  );
}