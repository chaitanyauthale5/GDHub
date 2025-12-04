import { useEffect, useRef, useState } from 'react';
import { useSocket } from '@/lib/SocketContext';

/**
 * Streams mic audio to backend (Deepgram proxy) and subscribes to live metrics.
 *
 * @param {{ enabled: boolean, roomId: string, user: any, stream: MediaStream | null, language?: string }} params
 * @returns {{ metrics: ({
 *   roomId?: string,
 *   perUser: Array<{
 *     userId: string,
 *     userName?: string,
 *     talkMs: number,
 *     turns?: number,
 *     words?: number,
 *     fillers?: number,
 *     fillerRate?: number,
 *     interruptions?: number,
 *     wpmAvg?: number,
 *     sentimentAvg?: number,
 *     onTopicAvg?: number,
 *     collabCues?: number,
 *     leadershipCues?: number,
 *     lastText?: string
 *   }>,
 *   lastSpeakerUserId?: string,
 *   totalTalkMs?: number
 * } | null) }}
 */
export default function useRealtimeGD({ enabled, roomId, user, stream, language = 'en-US' }) {
  const socket = useSocket();
  const recRef = useRef(null);
  const startedRef = useRef(false);
  const [metrics, setMetrics] = useState(null);
  const dbg = typeof window !== 'undefined' && !!window.__gdDebug;

  // Subscribe to live metrics
  useEffect(() => {
    if (!socket || !roomId) return;
    try { socket.emit('join_room', `gd:${roomId}`); } catch {}
    const onMetrics = (payload) => {
      if (!payload || payload.roomId !== roomId) return;
      setMetrics(payload);
    };
    socket.on('gd_metrics', onMetrics);
    return () => { try { socket.off('gd_metrics', onMetrics); } catch {} };
  }, [socket, roomId]);

  useEffect(() => {
    if (!enabled || !socket || !roomId || !user || !stream) return;

    // Prepare audio-only stream
    const audioTracks = stream.getAudioTracks ? stream.getAudioTracks() : [];
    if (!audioTracks || audioTracks.length === 0) return;
    const audioStream = new MediaStream([audioTracks[0]]);

    // Decide capture pathway
    const preferOgg = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/ogg;codecs=opus');
    const preferWebm = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm;codecs=opus');
    const forcePCM = typeof window !== 'undefined' && !!window.__gdForcePCM;
    const usePCM = forcePCM || !preferOgg;

    const userId = user.email || user.id || 'user';
    const userName = user.full_name || userId;

    if (usePCM) {
      // PCM Linear16 @16kHz using ScriptProcessorNode
      const targetRate = 16000;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      let source, processor;
      let leftover = new Float32Array(0);

      const start = async () => {
        if (startedRef.current) return;
        startedRef.current = true;
        try { source = ctx.createMediaStreamSource(audioStream); } catch { return; }
        processor = ctx.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        processor.connect(ctx.destination);
        try { socket.emit('gd_audio_start', { roomId, userId, userName, language, mimeType: 'audio/linear16;rate=16000' }); } catch {}
        processor.onaudioprocess = (e) => {
          try {
            const input = e.inputBuffer.getChannelData(0);
            const data = new Float32Array(leftover.length + input.length);
            data.set(leftover, 0); data.set(input, leftover.length);
            const ratio = (ctx.sampleRate || 48000) / targetRate;
            const newLength = Math.floor(data.length / ratio);
            if (newLength <= 0) { leftover = data; return; }
            const down = new Float32Array(newLength);
            let idx = 0; let i = 0;
            while (idx < newLength) { down[idx++] = data[Math.floor(i)]; i += ratio; }
            const consumed = Math.floor(newLength * ratio);
            leftover = data.slice(consumed);
            const pcmBuffer = new ArrayBuffer(down.length * 2);
            const view = new DataView(pcmBuffer);
            for (let j = 0; j < down.length; j++) {
              let s = Math.max(-1, Math.min(1, down[j]));
              view.setInt16(j * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            }
            if (dbg) console.log('[gd] chunk -> socket (pcm)', pcmBuffer.byteLength);
            socket.emit('gd_audio_chunk', { roomId, userId, data: pcmBuffer });
          } catch {}
        };
      };

      const stop = () => {
        try { processor && (processor.onaudioprocess = null); } catch {}
        try { source && source.disconnect(); } catch {}
        try { processor && processor.disconnect(); } catch {}
        try { ctx && ctx.close && ctx.close(); } catch {}
        try { socket.emit('gd_audio_stop', { roomId, userId }); } catch {}
        recRef.current = null;
        startedRef.current = false;
        if (dbg) console.log('[gd] pcm stop');
      };

      recRef.current = { stop };
      start();

      const onReconnect = () => {
        try {
          if (startedRef.current) socket.emit('gd_audio_start', { roomId, userId, userName, language, mimeType: 'audio/linear16;rate=16000' });
        } catch {}
      };
      socket.on('connect', onReconnect);

      return () => {
        stop();
        try { socket.off('connect', onReconnect); } catch {}
      };
    }

    // MediaRecorder path (OGG/WebM Opus)
    let mimeType = preferOgg ? 'audio/ogg;codecs=opus' : (preferWebm ? 'audio/webm;codecs=opus' : 'audio/webm');
    let mr;
    try {
      mr = new MediaRecorder(audioStream, { mimeType, audioBitsPerSecond: 128000 });
    } catch {
      try { mr = new MediaRecorder(audioStream); } catch { mr = null; }
    }
    if (!mr) return;

    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      try { socket.emit('gd_audio_start', { roomId, userId, userName, language, mimeType }); } catch {}
      try { mr.start(250); if (dbg) console.log('[gd] mediarecorder start', mimeType); } catch {}
    };

    const onData = async (e) => {
      try {
        if (!e.data || e.data.size === 0) return;
        const ab = await e.data.arrayBuffer();
        if (dbg) console.log('[gd] chunk -> socket', ab.byteLength);
        socket.emit('gd_audio_chunk', { roomId, userId, data: ab });
      } catch {}
    };

    const stop = () => {
      try { mr?.stop(); } catch {}
      try { socket.emit('gd_audio_stop', { roomId, userId }); } catch {}
      recRef.current = null;
      startedRef.current = false;
      if (dbg) console.log('[gd] mediarecorder stop');
    };

    mr.addEventListener('dataavailable', onData);
    mr.addEventListener('stop', () => {});

    recRef.current = { mr, stop };
    start();

    const onReconnect = () => {
      try {
        if (startedRef.current) {
          socket.emit('gd_audio_start', { roomId, userId, userName, language, mimeType });
          if (dbg) console.log('[gd] re-emit audio_start on reconnect');
        }
      } catch {}
    };
    socket.on('connect', onReconnect);

    return () => {
      try { mr.removeEventListener('dataavailable', onData); } catch {}
      stop();
      try { socket.off('connect', onReconnect); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, socket, roomId, user?.email, user?.id, stream, language]);

  return { metrics };
}
