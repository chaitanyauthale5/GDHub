import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '@/api/apiClient';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';

import useSpeechToTranscript from '@/hooks/useSpeechToTranscript';
import useZegoCall from '@/hooks/useZegoCall';
import { ArrowLeft, Bot, Clock, MessageSquare, Users, X } from 'lucide-react';
import useRealtimeGD from '@/hooks/useRealtimeGD';
import TranscriptionModal from '@/components/shared/TranscriptionModal';

export default function GDRoom() {
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [user, setUser] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [sessionActive, setSessionActive] = useState(true);
  const isEndingRef = useRef(false);
  const [dgLang, setDgLang] = useState('en-US');
  const audioCtxRef = useRef(null);
  const localAnalyserRef = useRef(null);
  const remoteAnalysersRef = useRef(new Map());
  const [speakingUidVol, setSpeakingUidVol] = useState(null);
  const lastSpeakRef = useRef({ id: null, ts: 0 });

  const urlParams = new URLSearchParams(window.location.search);
  const q1 = urlParams.get('roomId');
  const q2 = urlParams.get('roomid');
  const roomId = [q1, q2].find(v => v && v !== 'null' && v !== 'undefined') || null;

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
    stopLocalTracks,
  } = useZegoCall({
    roomId,
    user,
    autoJoin: true,
    canPublish: (() => {
      const spectate = (new URLSearchParams(window.location.search)).get('spectate');
      return !(spectate === '1' || spectate === 'true');
    })(),
  });

  const [showDebug, setShowDebug] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // Client-side speech recognition to transcript my speech
  useSpeechToTranscript({ enabled: false, roomId, user });

  // Realtime Deepgram (local mic only for v1)
  const { metrics } = useRealtimeGD({ enabled: sessionActive && !!roomId && !!user && !!localStream, roomId, user, stream: localStream, language: dgLang });

  useEffect(() => {
    try {
      if (!localStream) { localAnalyserRef.current = null; return; }
      const aTracks = localStream.getAudioTracks ? localStream.getAudioTracks() : [];
      if (!aTracks || aTracks.length === 0) { localAnalyserRef.current = null; return; }

      let ctx = audioCtxRef.current;
      if (!ctx) {
        const AC = window.AudioContext;
        if (!AC) return;
        ctx = new AC();
        audioCtxRef.current = ctx;
        try { ctx.resume && ctx.resume(); } catch { }
      }

      const source = ctx.createMediaStreamSource(localStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(ctx.destination);

      const uid = (user?.email || user?.id) ? String(user.email || user.id) : null;
      localAnalyserRef.current = { analyser, id: uid };
    } catch { }
  }, [localStream, user?.email, user?.id]);

  useEffect(() => {
    try {
      let ctx = audioCtxRef.current;
      if (!ctx) {
        const AC = window.AudioContext;
        if (!AC) return;
        ctx = new AC();
        audioCtxRef.current = ctx;
      }
      const map = remoteAnalysersRef.current;
      const current = new Set(Object.keys(remoteStreams || {}));
      for (const [peerId, stream] of Object.entries(remoteStreams || {})) {
        if (!map.has(peerId) && stream) {
          const aTracks = stream.getAudioTracks ? stream.getAudioTracks() : [];
          if (!aTracks || aTracks.length === 0) continue;
          try {
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.8;
            const gain = ctx.createGain();
            gain.gain.value = 0;
            source.connect(analyser);
            analyser.connect(gain);
            gain.connect(ctx.destination);

            const peerUserId = String(peerId || '').includes('_') ? String(peerId).slice(String(peerId).lastIndexOf('_') + 1) : String(peerId || '');
            map.set(peerId, { analyser, userId: peerUserId });
          } catch { }
        }
      }
      for (const key of Array.from(map.keys())) {
        if (!current.has(key)) {
          try { map.get(key)?.analyser?.disconnect(); } catch { }
          map.delete(key);
        }
      }
    } catch { }
  }, [remoteStreams]);

  useEffect(() => {
    let raf;
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const buffer = new Uint8Array(2048);
      const tick = () => {
        let bestId = null; let bestVal = 0;
        const la = localAnalyserRef.current;
        const process = (analyser, id) => {
          if (!analyser || !id) return;
          try {
            analyser.getByteTimeDomainData(buffer);
            let sum = 0;
            for (let i = 0; i < buffer.length; i++) {
              const v = (buffer[i] - 128) / 128;
              sum += Math.abs(v);
            }
            const avg = sum / buffer.length;
            if (avg > bestVal) { bestVal = avg; bestId = id; }
          } catch { }
        };
        if (la) process(la.analyser, String(la.id));
        for (const [, obj] of remoteAnalysersRef.current) process(obj.analyser, String(obj.userId));
        const now = Date.now();
        if (bestVal > 0.005 && bestId) {
          setSpeakingUidVol(bestId);
          lastSpeakRef.current = { id: bestId, ts: now };
        } else {
          if (now - (lastSpeakRef.current.ts || 0) > 900) {
            setSpeakingUidVol(null);
            lastSpeakRef.current = { id: null, ts: now };
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch { }
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [localStream, remoteStreams]);

  const displayMetrics = useMemo(() => {
    const arr = (metrics?.perUser || []).map((m) => {
      const nm = (m && m['userName']) || (room?.participants || []).find(p => p.user_id === m.userId)?.name || String(m.userId || '').slice(0, 6);
      return { ...m, name: nm };
    });
    arr.sort((a, b) => (b.talkMs || 0) - (a.talkMs || 0));
    return arr;
  }, [metrics?.perUser, room?.participants]);

  const currentSpeakerName = useMemo(() => {
    const uid = speakingUidVol || metrics?.['lastSpeakerUserId'];
    if (!uid) return '—';
    const found = displayMetrics.find(m => m.userId === uid) || (room?.participants || []).find(p => p.user_id === uid);
    return found?.name || String(uid).slice(0, 6);
  }, [speakingUidVol, metrics && metrics['lastSpeakerUserId'], displayMetrics, room?.participants]);

  const totalTalkMs = useMemo(() => {
    return displayMetrics.reduce((s, x) => s + (x.talkMs || 0), 0);
  }, [displayMetrics]);

  const colorClasses = ['bg-purple-400', 'bg-blue-400', 'bg-green-400', 'bg-pink-400', 'bg-yellow-400', 'bg-cyan-400'];
  const speakingUid = speakingUidVol || metrics?.['lastSpeakerUserId'];
  const localUserId = user?.email || user?.id;

  useEffect(() => {
    let timer;
    const poll = async () => {
      try {
        const data = await api.entities.GDRoom.filter({ id: roomId });
        if (data.length === 0 || data[0].status === 'completed') {
          if (!isEndingRef.current) {
            setSessionActive(false);
            if (roomId) {
              navigate(createPageUrl('GDAnalysis', { roomId }));
            } else {
              navigate(createPageUrl('Dashboard'));
            }
          }
        }
      } catch { }
    };

    poll();
    timer = setInterval(poll, 3000);
    return () => clearInterval(timer);
  }, [roomId, navigate]);

  const loadData = async () => {
    try {
      const currentUser = await api.auth.me();
      setUser(currentUser);

      const roomData = await api.entities.GDRoom.filter({ id: roomId });
      if (roomData.length > 0) {
        setRoom(roomData[0]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const setVideoRef = (el, stream, isSelf = false) => {
    if (!el || !stream) return;
    try {
      el.srcObject = stream;
      if (isSelf) el.muted = true;
      el.onloadedmetadata = () => el.play().catch(() => { });
    } catch { }
  };

  const endSession = async () => {
    try {
      isEndingRef.current = true;
      setSessionActive(false);

      if (!room) {
        try { stopLocalTracks(); } catch { }
        navigate(createPageUrl('Dashboard'));
        return;
      }

      const hostId = room.host_id || room.created_by;
      const amHost = user && (hostId === user.email || hostId === user.id);

      if (!amHost) {
        try { stopLocalTracks(); } catch { }
        navigate(createPageUrl('GDAnalysis', { roomId: room.id }));
        return;
      }

      // Host ends the room and navigates to analysis
      await api.entities.GDRoom.update(room.id, { status: 'completed' });
      try { stopLocalTracks(); } catch { }
      navigate(createPageUrl('GDAnalysis', { roomId: room.id }));
    } catch (error) {
      console.error('Error ending session:', error);
      navigate(createPageUrl('Dashboard'));
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const placeholderParticipants = (() => {
    const others = (room?.participants || []).filter(p => p.user_id !== user?.email && p.user_id !== user?.id);
    const remoteCount = Object.keys(remoteStreams || {}).length;
    const missing = Math.max(0, (others.length) - remoteCount);
    return others.slice(0, missing);
  })();

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

          {/* Live metrics */}
          <div className="hidden md:flex items-center gap-3 text-xs text-gray-300">
            <div className="px-2 py-1 bg-gray-700 rounded">
              <span className="opacity-80">Speaker:</span> {currentSpeakerName}
            </div>
            {displayMetrics.slice(0, 3).map((m, i) => (
              <div key={m.userId || i} className="px-2 py-1 bg-gray-700 rounded flex items-center gap-2">
                <span className="font-semibold">{m.name}</span>
                <span>{Math.round((m.talkMs || 0) / 1000)}s</span>
                {m && m['wpmAvg'] ? <span className="opacity-80">{m['wpmAvg']}wpm</span> : null}
                {typeof (m && m['fillerRate']) === 'number' ? <span className="opacity-80">{m['fillerRate']}/100w</span> : null}
              </div>
            ))}
            <div className="w-40 h-2 bg-gray-700 rounded overflow-hidden">
              <div className="flex w-full h-full">
                {displayMetrics.map((m, i) => (
                  <div key={`seg-${i}`} className={`${colorClasses[i % colorClasses.length]} h-full`} style={{ width: `${totalTalkMs ? Math.max(2, Math.round((m.talkMs || 0) / totalTalkMs * 100)) : 0}%` }}></div>
                ))}
              </div>
            </div>
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
          <button
            onClick={() => setShowTranscript(true)}
            className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold"
          >
            Live Transcription
          </button>
          <select value={dgLang} onChange={(e) => setDgLang(e.target.value)} className="px-3 py-2 rounded-xl bg-gray-700 text-white text-sm">
            <option value="en-US">English (US)</option>
            <option value="en-IN">English (IN)</option>
            <option value="hi-IN">Hindi</option>
          </select>

          <div className={`px-4 py-2 rounded-xl flex items-center gap-2 ${timeLeft < 60 ? 'bg-red-500' : 'bg-gray-700'
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

      {/* WebRTC Video Grid */}
      <div className="flex-1 p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 bg-gray-900">
        {/* Local (hidden in spectator mode) */}
        {localStream ? (
          <div className="relative rounded-xl overflow-hidden bg-gray-800 aspect-video">
            <video data-self="true" ref={el => setVideoRef(el, localStream, true)} playsInline autoPlay className="w-full h-full object-cover" />
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 text-white text-xs rounded">You</div>
          </div>
        ) : null}

        {/* Remotes */}
        {Object.entries(remoteStreams || {}).map(([peerId, stream]) => {
          const peerUserId = String(peerId || '').includes('_') ? String(peerId).slice(String(peerId).lastIndexOf('_') + 1) : String(peerId || '');
          const isSpeaking = speakingUid && String(speakingUid) === peerUserId;
          const remoteName = (room?.participants || []).find(p => p.user_id === peerUserId)?.name || peerUserId;
          return (
            <div key={peerId} className={`relative rounded-xl overflow-hidden bg-gray-800 aspect-video ${isSpeaking ? 'outline outline-4 outline-green-400' : ''}`} data-speaking={isSpeaking ? '1' : '0'}>
              <video ref={el => setVideoRef(el, stream)} playsInline autoPlay className="w-full h-full object-cover" />
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 text-white text-xs rounded">{remoteName}</div>
            </div>
          );
        })}

        {/* Placeholders for participants without video yet */}
        {placeholderParticipants.map((p, idx) => (
          <div key={`ph-${idx}`} className="relative rounded-xl overflow-hidden bg-gray-800 aspect-video flex items-center justify-center">
            <div className="text-center text-gray-300">
              <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold">
                {p.name?.charAt(0) || '?'}
              </div>
              <div className="text-xs">{p.name || 'Waiting...'}</div>
            </div>
          </div>
        ))}

        {/* AI Judge Tile */}
        <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-purple-700 to-indigo-700 aspect-video flex items-center justify-center">
          <div className="flex flex-col items-center text-white">
            <Bot className="w-10 h-10 mb-2" />
            <span className="font-bold">AI Judge</span>
          </div>
          <div className="absolute top-2 right-2 text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full">Observer</div>
        </div>
      </div>

      {/* Debug overlay */}
      <div className="fixed right-3 top-24 z-40">
        <button onClick={() => setShowDebug(!showDebug)} className="px-2 py-1 text-[11px] rounded bg-white/10 text-white border border-white/20">
          {showDebug ? 'Hide Debug' : 'Show Debug'}
        </button>
        {showDebug && (
          <div className="mt-2 text-xs p-3 rounded bg-black/70 text-white max-w-xs space-y-1">
            <div><span className="opacity-70">room:</span> {diagnostics?.roomID || roomId || '—'}</div>
            <div><span className="opacity-70">state:</span> {diagnostics?.roomState || 'unknown'}</div>
            <div><span className="opacity-70">user:</span> {diagnostics?.userID || user?.email || user?.id || '—'}</div>
            <div><span className="opacity-70">code:</span> {typeof diagnostics?.lastErrorCode === 'number' ? diagnostics.lastErrorCode : 0}</div>
            <div><span className="opacity-70">appID:</span> {diagnostics?.appID || '—'}</div>
            <div><span className="opacity-70">speak(vol):</span> {speakingUidVol || '—'}</div>
            <div><span className="opacity-70">speak(metrics):</span> {metrics?.['lastSpeakerUserId'] || '—'}</div>
          </div>
        )}
      </div>

      {/* Controls (hide in spectator mode) */}
      {localStream && (
        <div className="bg-gray-800 px-4 py-3 flex items-center gap-3 justify-center">
          <button onClick={toggleMic} className={`px-3 py-2 rounded-lg text-sm font-bold ${micOn ? 'bg-green-600 text-white' : 'bg-gray-600 text-white'}`}>{micOn ? 'Mic On' : 'Mic Off'}</button>
          <button onClick={toggleCamera} className={`px-3 py-2 rounded-lg text-sm font-bold ${cameraOn ? 'bg-blue-600 text-white' : 'bg-gray-600 text-white'}`}>{cameraOn ? 'Cam On' : 'Cam Off'}</button>
          {mediaError && (
            <button onClick={retryDevices} className="px-3 py-2 rounded-lg text-sm font-bold bg-yellow-600 text-white">Retry Devices</button>
          )}
        </div>
      )}
      <TranscriptionModal open={showTranscript} onOpenChange={setShowTranscript} roomId={roomId} participants={room?.participants || []} />
    </div>
  );
}