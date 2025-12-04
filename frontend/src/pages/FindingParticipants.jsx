import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Globe2, Users, Clock, XCircle } from 'lucide-react';
import TopNav from '../components/navigation/TopNav';
import ClayCard from '../components/shared/ClayCard';
import { api } from '@/api/apiClient';
import { createPageUrl } from '../utils';
import { useSocket } from '@/lib/SocketContext';

export default function FindingParticipants() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state || {};
  const { userId, name, queueSize: initialQueueSize, position: initialPosition, groupSize: initialGroupSize } = state;

  const [queueSize, setQueueSize] = useState(initialQueueSize || null);
  const [position, setPosition] = useState(initialPosition || null);
  const [groupSize, setGroupSize] = useState(initialGroupSize || 3);
  const [error, setError] = useState(null);
  const socket = useSocket();

  useEffect(() => {
    if (!userId) {
      // Missing context (e.g. page refresh) – send user back to GD modes
      navigate(createPageUrl('GDArena'));
      return;
    }

    let cancelled = false;

    const handleRoomCreated = (payload = {}) => {
      if (cancelled || !payload || !payload.roomId) return;

      // Optional safety check: ensure this user is in the participants list, if provided
      if (payload.participants && Array.isArray(payload.participants)) {
        const isMine = payload.participants.some((p) => p?.userId === userId);
        if (!isMine) return;
      }

      navigate(`/lobby/${payload.roomId}`, {
        state: {
          topic: payload.topic,
          teamSize: payload.teamSize || payload.groupSize || groupSize,
          participants: payload.participants || [],
        },
      });
    };

    if (socket) {
      socket.on('global_gd_room_created', handleRoomCreated);
    }

    const poll = async () => {
      try {
        const resp = await api.globalGd.status({ userId });
        if (cancelled || !resp) return;

        if (resp.status === 'matched') {
          navigate(`/lobby/${resp.roomId}`, {
            state: {
              topic: resp.topic,
              teamSize: resp.teamSize || resp.groupSize || groupSize,
              participants: resp.participants || [],
            },
          });
          return;
        }

        setQueueSize(resp.queueSize ?? null);
        setPosition(resp.position ?? null);
        setGroupSize(resp.groupSize || resp.teamSize || groupSize);
        setError(null);
      } catch (e) {
        console.error('Error while polling global GD status', e);
        setError('Having trouble checking status. We will keep retrying…');
      }
    };

    // Initial call then every 3 seconds
    poll();
    const id = setInterval(poll, 3000);

    return () => {
      cancelled = true;
      clearInterval(id);
       if (socket) {
        socket.off('global_gd_room_created', handleRoomCreated);
      }
    };
  }, [userId, navigate, groupSize, socket]);

  const handleCancel = async () => {
    try {
      if (userId) {
        await api.globalGd.leave({ userId });
      }
    } catch (e) {
      console.error('Error leaving global queue', e);
    } finally {
      navigate(createPageUrl('GDArena'));
    }
  };

  const joinedCount = queueSize != null && groupSize ? Math.min(queueSize, groupSize) : null;

  return (
    <div className="min-h-screen pb-20">
      <TopNav activePage="Explore" />

      <div className="max-w-xl mx-auto px-6 pt-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <h1 className="text-4xl font-bold mb-2 gradient-text">Finding Participants…</h1>
          <p className="text-gray-600 text-base">
            We&apos;re matching you with other students for a group discussion session.
          </p>
          <p className="text-gray-500 text-sm mt-1">This usually takes 10–30 seconds.</p>
        </motion.div>

        <ClayCard className="bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
          <div className="flex flex-col items-center text-center gap-6">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-2xl">
              <Globe2 className="w-12 h-12 text-white animate-pulse" />
            </div>

            <div>
              <p className="text-lg font-semibold text-gray-800 mb-1">
                Matching you into a room…
              </p>
              <p className="text-sm text-gray-600">
                Stay on this screen. We&apos;ll automatically take you to the Lobby once your group is ready.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 w-full">
              <div className="clay-card p-4 text-center">
                <Users className="w-6 h-6 mx-auto mb-1 text-purple-600" />
                <p className="text-xs text-gray-500">Team Size</p>
                <p className="text-lg font-bold">{groupSize}</p>
              </div>
              <div className="clay-card p-4 text-center">
                <Clock className="w-6 h-6 mx-auto mb-1 text-blue-600" />
                <p className="text-xs text-gray-500">Duration</p>
                <p className="text-lg font-bold">10–15 min</p>
              </div>
              <div className="clay-card p-4 text-center">
                <Users className="w-6 h-6 mx-auto mb-1 text-green-600" />
                <p className="text-xs text-gray-500">Queue</p>
                <p className="text-lg font-bold">
                  {joinedCount != null ? `${joinedCount}/${groupSize}` : 'Joining…'}
                </p>
              </div>
            </div>

            {position != null && queueSize != null && (
              <p className="text-xs text-gray-500">
                You are currently <span className="font-semibold">#{position}</span> in the queue.
              </p>
            )}

            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <XCircle className="w-4 h-4" /> {error}
              </p>
            )}

            <button
              onClick={handleCancel}
              className="mt-2 px-6 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold flex items-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              Cancel &amp; Go Back
            </button>
          </div>
        </ClayCard>
      </div>
    </div>
  );
}
