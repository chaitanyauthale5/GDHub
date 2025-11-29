const mongoose = require('mongoose');
const UserProfileSchema = new mongoose.Schema({
    user_id: { type: String, required: true, unique: true },
    bio: { type: String },
    avatar: { type: String },
    friends: { type: [String], default: [] }
}, { timestamps: true });
module.exports = mongoose.model('UserProfile', UserProfileSchema);
