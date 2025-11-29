import Vapi from '@vapi-ai/web';
import { useCallback, useEffect, useRef, useState } from 'react';


const defaultPublicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;
const defaultAssistantId = import.meta.env.VITE_VAPI_ASSISTANT_ID;

const useVapi = (options = {}) => {
    const { publicKey = defaultPublicKey, assistantId = defaultAssistantId } = options;
    const [volumeLevel, setVolumeLevel] = useState(0);
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [conversation, setConversation] = useState([]); // { role: 'ai' | 'user', content: string }

    const vapiRef = useRef(null);

    const initializeVapi = useCallback(() => {
        if (!publicKey || !assistantId) {
            if (import.meta.env.DEV) {
                console.warn('Vapi public key or assistant id missing. Check VITE_VAPI_PUBLIC_KEY and VITE_VAPI_ASSISTANT_ID.');
            }
            return;
        }

        if (!vapiRef.current) {
            const vapiInstance = new Vapi(publicKey);
            vapiRef.current = vapiInstance;

            vapiInstance.on('call-start', () => {
                setIsSessionActive(true);
            });

            vapiInstance.on('call-end', () => {
                setIsSessionActive(false);
                setConversation([]);
            });

            vapiInstance.on('volume-level', (volume) => {
                setVolumeLevel(volume || 0);
            });

            vapiInstance.on('message', (message) => {
                if (message?.type === 'transcript' && message.transcriptType === 'final') {
                    const role = message.role === 'assistant' ? 'ai' : 'user';
                    const text = message.transcript || '';
                    if (!text) return;
                    setConversation((prev) => [...prev, { role, content: text }]);
                }
            });

            vapiInstance.on('error', (e) => {
                console.error('Vapi error:', e);
            });
        }
    }, [publicKey, assistantId]);

    useEffect(() => {
        initializeVapi();

        return () => {
            if (vapiRef.current) {
                try {
                    vapiRef.current.stop();
                } catch (e) {
                    console.error('Error stopping Vapi on cleanup:', e);
                }
                vapiRef.current = null;
            }
        };
    }, [initializeVapi]);

    const startCall = async () => {
        if (!vapiRef.current || !assistantId) return;
        await vapiRef.current.start(assistantId);
    };

    const stopCall = async () => {
        if (!vapiRef.current) return;
        await vapiRef.current.stop();
    };

    const toggleCall = async () => {
        try {
            if (isSessionActive) {
                await stopCall();
            } else {
                await startCall();
            }
        } catch (err) {
            console.error('Error toggling Vapi session:', err);
        }
    };

    const resetConversation = () => setConversation([]);

    return {
        volumeLevel,
        isSessionActive,
        conversation,
        toggleCall,
        stopCall,
        resetConversation,
    };
};

export default useVapi;
