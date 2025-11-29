import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { Swords, Clock, ThumbsUp, ThumbsDown, X, ArrowLeft, LogOut } from 'lucide-react';

export default function DebateRoom() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('roomId');
  
  const [room, setRoom] = useState(null);
  const [user, setUser] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
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
    if (room && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            endDebate();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [room, timeLeft]);

  useEffect(() => {
    if (room && user && jitsiContainerRef.current && !apiRef.current) {
      initJitsi();
    }
  }, [room, user]);

  const loadData = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      const [roomData] = await base44.entities.DebateRoom.filter({ id: roomId });
      setRoom(roomData);
      setTimeLeft(roomData.duration * 60);
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
        roomName: `GDHubDebate_${room.room_code}`,
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
            'videoquality', 'filmstrip', 'tileview'
          ],
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false
        }
      });
    };
    document.body.appendChild(script);
  };

  const endDebate = async () => {
    await base44.entities.DebateRoom.update(roomId, { status: 'completed' });
    if (apiRef.current) {
      apiRef.current.dispose();
    }
    navigate(createPageUrl('DebateArena'));
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const myParticipant = room?.participants?.find(p => p.user_id === user?.email);
  const mySide = myParticipant?.side;

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Top Bar */}
      <div className="bg-gradient-to-r from-red-600 to-orange-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={endDebate}
            className="flex items-center gap-2 text-white/80 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Swords className="w-6 h-6 text-white" />
            <span className="text-white font-bold">Debate Room</span>
          </div>
          <span className="px-3 py-1 bg-white/20 rounded-lg text-white text-sm">
            {room.room_code}
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${mySide === 'for' ? 'bg-green-500' : 'bg-red-500'} text-white`}>
            {mySide === 'for' ? <ThumbsUp className="w-4 h-4" /> : <ThumbsDown className="w-4 h-4" />}
            <span className="font-bold text-sm">{mySide === 'for' ? 'FOR' : 'AGAINST'}</span>
          </div>
          <div className="flex items-center gap-2 bg-black/30 px-4 py-2 rounded-full">
            <Clock className="w-5 h-5 text-white" />
            <span className={`font-mono font-bold text-lg ${timeLeft < 60 ? 'text-red-400' : 'text-white'}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
          <button
            onClick={endDebate}
            className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold flex items-center gap-2 transition-all"
          >
            <LogOut className="w-5 h-5" />
            Exit Meeting
          </button>
        </div>
      </div>

      {/* Topic Banner */}
      <div className="bg-gray-800 px-4 py-3 text-center">
        <p className="text-gray-400 text-sm">Topic</p>
        <h2 className="text-white font-bold text-lg">{room.topic}</h2>
      </div>

      {/* Jitsi Container */}
      <div ref={jitsiContainerRef} className="flex-1" />
    </div>
  );
}