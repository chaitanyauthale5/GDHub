const express = require('express');

const router = express.Router();

// In-memory store for global GD auto-matching
// TODO: Replace with persistent DB models (e.g., Mongo collections) for production usage
const GROUP_SIZE = 3;
const waitingUsers = []; // { userId, name, joinedAt }
const rooms = []; // { roomId, topic, participants: [{ userId, name }], status }

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

function findRoomByUser(userId) {
  return rooms.find(
    (room) =>
      room.status === 'active' &&
      (!Array.isArray(room.leftUsers) || !room.leftUsers.includes(userId)) &&
      Array.isArray(room.participants) &&
      room.participants.some((p) => p.userId === userId)
  );
}

function notifyRoomCreated(req, room) {
  try {
    const io = req.app && req.app.get && req.app.get('io');
    if (!io) return;

    const payload = {
      status: 'matched',
      roomId: room.roomId,
      topic: room.topic,
      participants: room.participants || [],
      teamSize: (room.participants && room.participants.length) || GROUP_SIZE,
      groupSize: GROUP_SIZE,
    };

    (room.participants || []).forEach((p) => {
      if (!p || !p.userId) return;
      const userRoom = `user:${p.userId}`;
      io.to(userRoom).emit('global_gd_room_created', payload);
    });
  } catch (e) {
    // Swallow socket errors to avoid breaking HTTP flow
    console.error('Error notifying global GD room creation', e);
  }
}

router.post('/join', (req, res) => {
  const { userId, name } = req.body || {};
  if (!userId || !name) {
    return res.status(400).json({ message: 'Missing userId or name' });
  }

  const now = new Date().toISOString();

  // If user is already in an active room, immediately return that match
  const existingRoom = findRoomByUser(userId);
  if (existingRoom) {
    return res.json({
      status: 'matched',
      roomId: existingRoom.roomId,
      topic: existingRoom.topic,
      teamSize: GROUP_SIZE,
    });
  }

  // Ensure user is not duplicated in the waiting queue
  const alreadyWaitingIndex = waitingUsers.findIndex((u) => u.userId === userId);
  if (alreadyWaitingIndex === -1) {
    waitingUsers.push({ userId, name, joinedAt: now });
  }

  // If enough users are waiting, create a new room and match them immediately
  if (waitingUsers.length >= GROUP_SIZE) {
    const participants = waitingUsers.splice(0, GROUP_SIZE);
    const roomId = `gd_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const topic = getRandomTopic();

    const room = {
      roomId,
      topic,
      participants: participants.map((p) => ({ userId: p.userId, name: p.name })),
      status: 'active',
      createdAt: now,
      leftUsers: [],
    };
    rooms.push(room);

    // Notify all matched users in real-time via Socket.io
    notifyRoomCreated(req, room);

    return res.json({
      status: 'matched',
      roomId,
      topic,
      teamSize: GROUP_SIZE,
      groupSize: GROUP_SIZE,
      participants: room.participants,
    });
  }

  const position = waitingUsers.findIndex((u) => u.userId === userId) + 1;
  const queueSize = waitingUsers.length;

  return res.json({
    status: 'waiting',
    queueSize,
    position,
    groupSize: GROUP_SIZE,
  });
});

router.get('/status', (req, res) => {
  const { userId } = req.query || {};
  if (!userId) {
    return res.status(400).json({ message: 'Missing userId' });
  }

  const room = findRoomByUser(userId);
  if (room) {
    return res.json({
      status: 'matched',
      roomId: room.roomId,
      topic: room.topic,
      teamSize: room.participants?.length || GROUP_SIZE,
      groupSize: GROUP_SIZE,
      participants: room.participants || [],
    });
  }

  const position = waitingUsers.findIndex((u) => u.userId === userId);
  const queueSize = waitingUsers.length;

  // If user is still waiting, surface queue info
  if (position !== -1) {
    return res.json({
      status: 'waiting',
      queueSize,
      position: position + 1,
      groupSize: GROUP_SIZE,
    });
  }

  // User is neither in a room nor in the waiting queue
  return res.json({
    status: 'waiting',
    queueSize,
    position: null,
    groupSize: GROUP_SIZE,
  });
});

router.post('/leave', (req, res) => {
  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ message: 'Missing userId' });
  }

  const idx = waitingUsers.findIndex((u) => u.userId === userId);
  if (idx !== -1) {
    waitingUsers.splice(idx, 1);
  }

  return res.json({ success: true });
});

router.post('/leave-room', (req, res) => {
  const { userId, roomId } = req.body || {};
  if (!userId || !roomId) {
    return res.status(400).json({ message: 'Missing userId or roomId' });
  }

  const room = rooms.find((r) => r.roomId === roomId);
  if (!room) {
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

  return res.json({
    success: true,
    status: room.status,
    leftUsers: room.leftUsers,
  });
});

module.exports = router;
