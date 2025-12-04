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

    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'audio/webm';
    }

    let mr;
    try {
      mr = new MediaRecorder(audioStream, { mimeType, audioBitsPerSecond: 128000 });
    } catch {
      try { mr = new MediaRecorder(audioStream); } catch { mr = null; }
    }
    if (!mr) return;

    const userId = user.email || user.id || 'user';
    const userName = user.full_name || userId;

    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      try {
        socket.emit('gd_audio_start', { roomId, userId, userName, language });
      } catch {}
      try { mr.start(300); } catch {}
    };

    const onData = async (e) => {
      try {
        if (!e.data || e.data.size === 0) return;
        const ab = await e.data.arrayBuffer();
        socket.emit('gd_audio_chunk', { roomId, userId, data: ab });
      } catch {}
    };

    const stop = () => {
      try { mr?.stop(); } catch {}
      try { socket.emit('gd_audio_stop', { roomId, userId }); } catch {}
      recRef.current = null;
      startedRef.current = false;
    };

    mr.addEventListener('dataavailable', onData);
    mr.addEventListener('stop', () => {});

    recRef.current = { mr, stop };
    start();

    return () => {
      try { mr.removeEventListener('dataavailable', onData); } catch {}
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, socket, roomId, user?.email, user?.id, stream, language]);

  return { metrics };
}
