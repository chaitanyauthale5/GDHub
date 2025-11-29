import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { X, Clock, Users, MessageSquare, ArrowLeft } from 'lucide-react';

export default function GDRoom() {
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [user, setUser] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [jitsiLoaded, setJitsiLoaded] = useState(false);
  const jitsiContainerRef = useRef(null);
  const jitsiApiRef = useRef(null);

  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('roomId');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (room?.duration) {
      setTimeLeft(room.duration * 60);
    }
  }, [room]);

  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          endSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  useEffect(() => {
    if (room && user && !jitsiLoaded) {
      initJitsi();
    }
    return () => {
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
      }
    };
  }, [room, user]);

  const loadData = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      const roomData = await base44.entities.GDRoom.filter({ id: roomId });
      if (roomData.length > 0) {
        setRoom(roomData[0]);
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
      const domain = 'meet.jit.si';
      const options = {
        roomName: `GDHub_${room.room_code}`,
        width: '100%',
        height: '100%',
        parentNode: jitsiContainerRef.current,
        userInfo: {
          displayName: user.full_name || 'Participant'
        },
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinPageEnabled: false,
          disableDeepLinking: true,
        },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: [
            'microphone', 'camera', 'desktop', 'fullscreen',
            'hangup', 'chat', 'raisehand', 'tileview'
          ],
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          DEFAULT_BACKGROUND: '#1a1a2e',
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        }
      };

      jitsiApiRef.current = new window.JitsiMeetExternalAPI(domain, options);
      setJitsiLoaded(true);

      jitsiApiRef.current.addListener('readyToClose', () => {
        endSession();
      });
    };
    document.body.appendChild(script);
  };

  const endSession = async () => {
    try {
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }

      if (room) {
        await base44.entities.GDRoom.update(room.id, {
          status: 'completed'
        });

        const session = await base44.entities.GDSession.create({
          room_id: room.id,
          room_code: room.room_code,
          topic: room.topic,
          domain: room.domain,
          mode: room.mode,
          duration: room.duration,
          participants: room.participants?.map(p => ({
            user_id: p.user_id,
            name: p.name,
            rating: 0,
            liked: false,
            is_friend: false
          })) || [],
          completed_at: new Date().toISOString()
        });

        navigate(createPageUrl(`GDAnalysis?sessionId=${session.id}`));
      } else {
        navigate(createPageUrl('GDArena'));
      }
    } catch (error) {
      console.error('Error ending session:', error);
      navigate(createPageUrl('GDArena'));
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Top Bar */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={endSession}
            className="flex items-center gap-2 text-white/80 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 text-white">
            <MessageSquare className="w-5 h-5 text-purple-400" />
            <span className="font-bold">SpeakUp</span>
          </div>
          <div className="px-3 py-1 bg-gray-700 rounded-lg text-white text-sm">
            Code: <span className="font-bold">{room?.room_code}</span>
          </div>
          <div className="px-3 py-1 bg-gray-700 rounded-lg text-white text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            {room?.participants?.length || 0} participants
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={`px-4 py-2 rounded-xl flex items-center gap-2 ${
            timeLeft < 60 ? 'bg-red-500' : 'bg-gray-700'
          } text-white font-bold`}>
            <Clock className="w-5 h-5" />
            {formatTime(timeLeft)}
          </div>
          <button
            onClick={endSession}
            className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold flex items-center gap-2 transition-all"
          >
            <X className="w-5 h-5" />
            End GD
          </button>
        </div>
      </div>

      {/* Topic Bar */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2 text-center flex-shrink-0">
        <p className="text-white text-sm">
          <span className="opacity-80">Topic:</span>{' '}
          <span className="font-bold">{room?.topic}</span>
        </p>
      </div>

      {/* Jitsi Container */}
      <div ref={jitsiContainerRef} className="flex-1" />
    </div>
  );
}