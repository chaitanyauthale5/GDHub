import { useEffect, useRef } from 'react';
import { api } from '@/api/apiClient';

export default function useSpeechToTranscript({ enabled, roomId, user, sessionType = 'gd' }) {
  const recogRef = useRef(null);
  const phraseStart = useRef(null);

  useEffect(() => {
    if (!enabled || !roomId || !user) return;

    const SpeechRecognition = window['SpeechRecognition'] || window['webkitSpeechRecognition'];
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition not supported');
      return;
    }

    const rec = new SpeechRecognition();
    rec.interimResults = true;
    rec.continuous = true;
    rec.lang = 'en-US';

    rec.onresult = async (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0].transcript.trim();
        if (res.isFinal && transcript) {
          const start = phraseStart.current || Date.now();
          const end = Date.now();
          phraseStart.current = null;
          try {
            await api.entities.GDTranscript.create({
              room_id: roomId,
              user_id: user.email,
              user_name: user.full_name,
              text: transcript,
              start_ms: start,
              end_ms: end,
              session_type: sessionType
            });
          } catch (e) { }
        } else if (!phraseStart.current) {
          phraseStart.current = Date.now();
        }
      }
    };

    rec.onerror = () => {
      try { rec.stop(); } catch {}
    };

    try {
      rec.start();
    } catch {}
    recogRef.current = rec;

    return () => {
      try { rec.stop(); } catch {}
      recogRef.current = null;
    };
  }, [enabled, roomId, user]);
}
