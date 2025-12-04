const express = require('express');
const GDRoom = require('../models/GDRoom');
const WaitingUser = require('../models/WaitingUser');

const router = express.Router();

// Global GD auto-matching now uses MongoDB collections (WaitingUser + GDRoom)
// so that the queue and rooms are shared across all backend instances.
const GROUP_SIZE = 3;

function getRandomTopic() {
  // TODO: Replace with proper topic pool or DB-backed topics
  const topics = [
    'The impact of artificial intelligence on employment',
    'Social media regulation and freedom of speech',
    'Climate change and individual responsibility',
    'Remote work vs office culture',
    'Is social media doing more harm than good?',
    'The future of online education',
    'Data privacy in a connected world',
  ];
  return topics[Math.floor(Math.random() * topics.length)];
}

// Find an active GLOBAL GDRoom from MongoDB that contains the given user
// and where the user has not explicitly left via /leave-room.
async function findRoomByUser(userId) {
  if (!userId) return null;

  return GDRoom.findOne({
    mode: 'global',
    status: 'active',
    participants: { $elemMatch: { user_id: userId } },
    // Exclude rooms that the user has explicitly left.
    $or: [
      { leftUsers: { $exists: false } },
      { leftUsers: { $nin: [userId] } },
    ],
  }).lean();
}

// Notify all matched users in real-time via Socket.io when a global room is created.
// Accepts either a plain object or a Mongoose document.
function notifyRoomCreated(req, room) {
  try {
    const io = req.app && req.app.get && req.app.get('io');
    if (!io || !room) return;

    const rawParticipants = room.participants || [];

    // Normalise participants to the { userId, name } shape expected by the frontend.
    const participants = rawParticipants.map((p) => ({
      userId: p.user_id || p.userId,
      name: p.name,
    }));

    const payload = {
      status: 'matched',
      // Prefer Mongo _id when present; fall back to legacy in-memory roomId field.
      roomId: room._id ? room._id.toString() : room.roomId,
      topic: room.topic,
      participants,
      teamSize: participants.length || GROUP_SIZE,
      groupSize: GROUP_SIZE,
    };

    participants.forEach((p) => {
      if (!p || !p.userId) return;
      const userRoom = `user:${p.userId}`;
      io.to(userRoom).emit('global_gd_room_created', payload);
    });
  } catch (e) {
    // Swallow socket errors to avoid breaking HTTP flow
    console.error('Error notifying global GD room creation', e);
  }
}

// Join the global GD matching queue.
// This endpoint is backed by the WaitingUser Mongo collection instead of in-memory arrays.
router.post('/join', async (req, res) => {
  const { userId, name } = req.body || {};
  if (!userId || !name) {
    return res.status(400).json({ message: 'Missing userId or name' });
  }

  try {
    const now = new Date();

    // 1) If user is already in an active global room, immediately return that match.
    const existingRoom = await findRoomByUser(userId);
    if (existingRoom) {
      const participants = (existingRoom.participants || []).map((p) => ({
        userId: p.user_id,
        name: p.name,
      }));

      return res.json({
        status: 'matched',
        roomId: existingRoom._id.toString(),
        topic: existingRoom.topic,
        teamSize: participants.length || GROUP_SIZE,
        groupSize: GROUP_SIZE,
        participants,
      });
    }

    // 2) Ensure user is not duplicated in the waiting queue.
    const existingWaiting = await WaitingUser.findOne({ userId });
    if (!existingWaiting) {
      await WaitingUser.create({ userId, name, joinedAt: now });
    }

    // 3) Fetch the current waiting queue in FIFO order (oldest first).
    const waiting = await WaitingUser.find({}).sort({ joinedAt: 1, _id: 1 }).lean();

    // 4) If enough users are waiting, create a new global room and match them immediately.
    if (waiting.length >= GROUP_SIZE) {
      const matched = waiting.slice(0, GROUP_SIZE);
      const matchedUserIds = matched.map((u) => u.userId);
      const topic = getRandomTopic();

      const participantsDocs = matched.map((u) => ({
        user_id: u.userId,
        name: u.name || u.userId,
        joined_at: now,
      }));

      // Create a new GDRoom document marked as mode = 'global'.
      const roomDoc = await GDRoom.create({
        room_code: `gd_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        host_id: matchedUserIds[0],
        mode: 'global',
        team_size: GROUP_SIZE,
        topic,
        participants: participantsDocs,
        status: 'active',
        started_at: now,
      });

      // Remove matched users from the waiting queue.
      await WaitingUser.deleteMany({ userId: { $in: matchedUserIds } });

      const roomId = roomDoc._id.toString();
      const participants = participantsDocs.map((p) => ({ userId: p.user_id, name: p.name }));

      // Notify all matched users in real-time via Socket.io.
      notifyRoomCreated(req, roomDoc);

      return res.json({
        status: 'matched',
        roomId,
        topic,
        teamSize: participants.length || GROUP_SIZE,
        groupSize: GROUP_SIZE,
        participants,
      });
    }

    // 5) Not enough users yet – return waiting status with queue position.
    const queueSize = waiting.length;
    const positionIndex = waiting.findIndex((u) => u.userId === userId);

    return res.json({
      status: 'waiting',
      queueSize,
      position: positionIndex === -1 ? null : positionIndex + 1,
      groupSize: GROUP_SIZE,
    });
  } catch (e) {
    console.error('Error in /api/global-gd/join', e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Check the current matching status for a user.
// 1) If they are in an active global room, return matched with room details.
// 2) Otherwise, return waiting with their queue position (if any).
router.get('/status', async (req, res) => {
  const { userId } = req.query || {};
  if (!userId) {
    return res.status(400).json({ message: 'Missing userId' });
  }

  try {
    // First, check if user is in an active global room (and not in leftUsers).
    const room = await findRoomByUser(userId);
    if (room) {
      const participants = (room.participants || []).map((p) => ({
        userId: p.user_id,
        name: p.name,
      }));

      return res.json({
        status: 'matched',
        roomId: room._id.toString(),
        topic: room.topic,
        teamSize: participants.length || GROUP_SIZE,
        groupSize: GROUP_SIZE,
        participants,
      });
    }

    // Otherwise, inspect the waiting queue for this user.
    const waiting = await WaitingUser.find({}).sort({ joinedAt: 1, _id: 1 }).lean();
    const queueSize = waiting.length;
    const positionIndex = waiting.findIndex((u) => u.userId === userId);

    if (positionIndex !== -1) {
      return res.json({
        status: 'waiting',
        queueSize,
        position: positionIndex + 1,
        groupSize: GROUP_SIZE,
      });
    }

    // User is neither in a room nor in the waiting queue – treat as fresh waiting state.
    return res.json({
      status: 'waiting',
      queueSize,
      position: null,
      groupSize: GROUP_SIZE,
    });
  } catch (e) {
    console.error('Error in /api/global-gd/status', e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Optional: remove a user from the global GD waiting queue.
// This does NOT affect rooms – those are handled by /leave-room.
router.post('/leave', async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ message: 'Missing userId' });
  }

  try {
    await WaitingUser.deleteMany({ userId });
    return res.json({ success: true });
  } catch (e) {
    console.error('Error in /api/global-gd/leave', e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Mark that a user has left a specific global GD room.
// This updates the GDRoom.leftUsers field and marks the room completed
// when all participants have left, so subsequent /status calls treat the
// user as waiting for a fresh match.
router.post('/leave-room', async (req, res) => {
  const { userId, roomId } = req.body || {};
  if (!userId || !roomId) {
    return res.status(400).json({ message: 'Missing userId or roomId' });
  }

  try {
    const room = await GDRoom.findById(roomId);
    // If room does not exist or is not a global room, treat as a no-op.
    if (!room || room.mode !== 'global') {
      return res.json({ success: true });
    }

    if (!Array.isArray(room.leftUsers)) {
      room.leftUsers = [];
    }

    if (!room.leftUsers.includes(userId)) {
      room.leftUsers.push(userId);
    }

    if (Array.isArray(room.participants) && room.leftUsers.length >= room.participants.length) {
      room.status = 'completed';
    }

    await room.save();

    return res.json({
      success: true,
      status: room.status,
      leftUsers: room.leftUsers,
    });
  } catch (e) {
    console.error('Error in /api/global-gd/leave-room', e);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
