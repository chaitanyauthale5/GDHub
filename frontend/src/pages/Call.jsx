import AI3DAvatar from '@/components/shared/AI3DAvatar';
import useZegoCall from '@/hooks/useZegoCall';
import useRealtimeGD from '@/hooks/useRealtimeGD';
import TranscriptionModal from '@/components/shared/TranscriptionModal';
import { useAuth } from '@/lib/AuthContext';
import { AlertCircle, ArrowLeft, Clock, Mic, MicOff, PhoneOff, Video, VideoOff, ScrollText } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { api } from '@/api/apiClient';

export default function Call() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const mode = location.state?.mode;
  const rawId = params.get('roomId') || params.get('roomID') || params.get('roomid');
  const roomId = rawId && rawId !== 'null' && rawId !== 'undefined' ? rawId : null;

  const [room, setRoom] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const didEndRef = useRef(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [dgLang, setDgLang] = useState('en-US');

  const [localVideoEl, setLocalVideoEl] = useState(null);
  const [remoteVideoEls, setRemoteVideoEls] = useState({}); // streamID -> video element

  const {
    localStream,
    remoteStreams,
    micOn,
    cameraOn,
    toggleMic,
    toggleCamera,
    mediaError,
    retryDevices,
    diagnostics,
    leaveRoom,
    isJoined,
    isJoining,
    attachStreamToVideoElement,
  } = useZegoCall({ roomId, user, autoJoin: true });

  // Start realtime transcription stream to backend and subscribe to metrics
  const gdUser = user || (diagnostics?.userID ? { id: diagnostics.userID, email: diagnostics.userID, full_name: diagnostics.userID } : null);
  useRealtimeGD({ enabled: !!roomId && !!localStream && !!gdUser, roomId, user: gdUser, stream: localStream, language: dgLang });

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!roomId) return;
      try {
        const data = await api.entities.GDRoom.filter({ id: roomId });
        if (!active) return;
        if (Array.isArray(data) && data.length > 0) {
          setRoom(data[0]);
          if (data[0].duration) setTimeLeft(data[0].duration * 60);
        }
      } catch {}
    };
    load();
    return () => {
      active = false;
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    let timer;
    const poll = async () => {
      try {
        const data = await api.entities.GDRoom.filter({ id: roomId });
        if (data.length > 0 && data[0].status === 'completed' && !didEndRef.current) {
          didEndRef.current = true;
          try { await leaveRoom(); } catch {}
          if (roomId) {
            navigate(createPageUrl(`GDAnalysis?roomId=${roomId}`));
          } else {
            navigate(createPageUrl('Dashboard'));
          }
        }
      } catch {}
    };
    poll();
    timer = setInterval(poll, 3000);
    return () => clearInterval(timer);
  }, [roomId, navigate, leaveRoom]);

  useEffect(() => {
    if (localVideoEl && localStream) {
      attachStreamToVideoElement(localVideoEl, localStream, { muted: true });
    }
  }, [localVideoEl, localStream, attachStreamToVideoElement]);

  useEffect(() => {
    Object.entries(remoteStreams || {}).forEach(([streamID, stream]) => {
      const el = remoteVideoEls[streamID];
      if (el && stream) {
        attachStreamToVideoElement(el, stream, { muted: false });
      }
    });
  }, [remoteStreams, remoteVideoEls, attachStreamToVideoElement]);

  useEffect(() => {
    if (!timeLeft) return;
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (!didEndRef.current) {
            didEndRef.current = true;
            (async () => {
              try { await leaveRoom(); } catch {}
              if (roomId) {
                navigate(createPageUrl(`GDAnalysis?roomId=${roomId}`));
              } else {
                navigate(createPageUrl('Dashboard'));
              }
            })();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [timeLeft, navigate, leaveRoom, roomId]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEndCall = async () => {
    try {
      // In global GD mode, also notify the global matching backend that this user left the room.
      if (mode === 'global' && user && roomId) {
        const userId = user.email || user.id;
        try {
          await api.globalGd.leaveRoom({ userId, roomId });
        } catch (e) {
          console.error('Failed to notify global GD leave-room', e);
        }
      }

      await leaveRoom();
    } finally {
      if (roomId) {
        navigate(createPageUrl(`GDAnalysis?roomId=${roomId}`));
      } else {
        navigate(createPageUrl('Dashboard'));
      }
    }
  };

  if (!roomId) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center space-y-3">
          <AlertCircle className="w-10 h-10 mx-auto text-red-400" />
          <h2 className="text-xl font-bold">Missing roomId</h2>
          <p className="text-sm text-gray-300">Provide a ?roomId=ROOM_ID query parameter to join a call.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Top bar */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 text-white">
          <button
            onClick={handleEndCall}
            className="flex items-center gap-2 text-white/80 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-sm">
            <div className="font-bold">Room: {roomId}</div>
            <div className="text-xs text-gray-300">
              {isJoining ? 'Connecting…' : isJoined ? 'In call' : 'Idle'}
            </div>
          </div>
          <div className={`${timeLeft < 60 ? 'bg-red-600' : 'bg-gray-700'} px-3 py-1 rounded-lg text-white text-sm`}>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>{formatTime(timeLeft)}</span>
            </div>
          </div>
        </div>

        {/* Transcription controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowTranscript(true)}
            className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold"
          >
            Live Transcription
          </button>
          <select
            value={dgLang}
            onChange={(e) => setDgLang(e.target.value)}
            className="px-3 py-2 rounded-xl bg-gray-700 text-white text-sm"
          >
            <option value="en-US">English (US)</option>
            <option value="en-IN">English (IN)</option>
            <option value="hi-IN">Hindi</option>
          </select>
        </div>

        <div className="text-right text-xs text-gray-300">
          <div>appID: {diagnostics.appID || '—'}</div>
          <div>userID: {diagnostics.userID || (user?.email || user?.id || '—')}</div>
          <div>state: {diagnostics.roomState}</div>
        </div>
      </div>

      {/* Video grid */}
      <div className="flex-1 p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 bg-gray-900">
        {/* Local tile */}
        <div className="relative rounded-xl overflow-hidden bg-gray-800 aspect-video">
          {localStream ? (
            <video
              ref={setLocalVideoEl}
              data-self="true"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              {mediaError ? 'Mic/Camera blocked or unavailable' : isJoining ? 'Connecting…' : 'Waiting to join…'}
            </div>
          )}
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 text-white text-xs rounded">
            You
          </div>
        </div>

        {/* Remote tiles */}
        {Object.entries(remoteStreams || {}).map(([streamID]) => (
          <div key={streamID} className="relative rounded-xl overflow-hidden bg-gray-800 aspect-video">
            <video
              ref={(el) => {
                if (!el) return;
                setRemoteVideoEls((prev) => (prev[streamID] === el ? prev : { ...prev, [streamID]: el }));
              }}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 text-white text-xs rounded">
              {streamID}
            </div>
          </div>
        ))}
        <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-purple-700 to-indigo-800 aspect-video">
          <AI3DAvatar />
        </div>
      </div>

      {/* Error banner */}
      {mediaError && (
        <div className="bg-red-600 text-white text-sm px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{String(mediaError)}</span>
          </div>
          <button
            onClick={retryDevices}
            className="text-xs font-bold px-3 py-1 rounded bg-white/10 hover:bg-white/20"
          >
            Retry Devices
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="bg-gray-800 px-4 py-3 flex items-center gap-4 justify-center flex-shrink-0">
        <button
          onClick={toggleMic}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${
            micOn ? 'bg-green-600 text-white' : 'bg-gray-600 text-white'
          }`}
        >
          {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          <span>{micOn ? 'Mic On' : 'Mic Off'}</span>
        </button>

        <button
          onClick={toggleCamera}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${
            cameraOn ? 'bg-blue-600 text-white' : 'bg-gray-600 text-white'
          }`}
        >
          {cameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          <span>{cameraOn ? 'Camera On' : 'Camera Off'}</span>
        </button>

        <button
          onClick={handleEndCall}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-red-600 hover:bg-red-700 text-white"
        >
          <PhoneOff className="w-4 h-4" />
          <span>End Call</span>
        </button>
      </div>

      <div className="fixed right-3 top-24 z-40">
        <button
          onClick={() => setShowTranscript(true)}
          className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold flex items-center gap-2 shadow-lg"
        >
          <ScrollText className="w-4 h-4" />
          Transcript
        </button>
      </div>

      {/* Live Transcription Modal */}
      <TranscriptionModal
        open={showTranscript}
        onOpenChange={setShowTranscript}
        roomId={roomId}
        participants={room?.participants || []}
      />
    </div>
  );
}
