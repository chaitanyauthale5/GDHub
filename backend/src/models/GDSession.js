const mongoose = require('mongoose');
const GDSessionSchema = new mongoose.Schema({
    user_id: { type: String, required: true },
    topic: { type: String },
    transcript: { type: String },
    score: { type: Number, default: 0 },
    metrics: { type: Object, default: {} }
}, { timestamps: true });
module.exports = mongoose.model('GDSession', GDSessionSchema);
