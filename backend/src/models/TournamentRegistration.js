const mongoose = require('mongoose');
const TournamentRegistrationSchema = new mongoose.Schema({
    tournament_id: { type: String, required: true },
    user_id: { type: String, required: true },
    user_name: { type: String },
    status: { type: String, enum: ['registered', 'joined'], default: 'registered' },
    group_number: { type: Number }
}, { timestamps: true });
module.exports = mongoose.model('TournamentRegistration', TournamentRegistrationSchema);
