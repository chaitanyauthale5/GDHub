const mongoose = require('mongoose');

// Represents a user waiting to be auto-matched into a Global GD room.
// Stored in MongoDB so that the waiting queue is shared across all backend instances.
const WaitingUserSchema = new mongoose.Schema(
  {
    // Unique identifier for the user (email or internal ID from the app).
    userId: { type: String, required: true, index: true },

    // Display name used in the lobby / room participant list.
    name: { type: String },

    // Time when the user entered the global GD waiting queue.
    joinedAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('WaitingUser', WaitingUserSchema);
