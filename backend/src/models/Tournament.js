const mongoose = require('mongoose');
const TournamentSchema = new mongoose.Schema({
    tournament_id: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['gd', 'debate'], required: true },
    host_id: { type: String, required: true },
    visibility: { type: String, enum: ['public', 'private'], default: 'public' },
    status: { type: String, enum: ['registering', 'active', 'completed'], default: 'registering' },
    group_size: { type: Number, default: 4 }
}, { timestamps: true });
module.exports = mongoose.model('Tournament', TournamentSchema);
