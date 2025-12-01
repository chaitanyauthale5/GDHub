const mongoose = require('mongoose');
const TournamentSchema = new mongoose.Schema({
    tournament_id: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['gd', 'debate'], required: true },
    host_id: { type: String, required: true },
    host_name: { type: String },
    organizer: { type: String },
    description: { type: String },
    visibility: { type: String, enum: ['public', 'private'], default: 'public' },
    status: { type: String, enum: ['registering', 'active', 'completed'], default: 'registering' },
    group_size: { type: Number, default: 4 },
    max_participants: { type: Number, default: 100 },
    domain: { type: String, default: 'general' },
    duration: { type: Number, default: 15 },
    start_date: { type: Date },
    prize: { type: String },
    rules: { type: String },
    password: { type: String }
}, { timestamps: true });
module.exports = mongoose.model('Tournament', TournamentSchema);
