const mongoose = require('mongoose');

const GDTranscriptSchema = new mongoose.Schema({
  room_id: { type: String, required: true },
  user_id: { type: String, required: true },
  user_name: { type: String },
  text: { type: String, required: true },
  start_ms: { type: Number },
  end_ms: { type: Number },
  lang: { type: String, default: 'en' },
  session_type: { type: String, enum: ['gd','debate','extempore','interview'], default: 'gd' }
}, { timestamps: true });

module.exports = mongoose.model('GDTranscript', GDTranscriptSchema);
