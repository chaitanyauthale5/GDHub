const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    role: { type: String },
    content: { type: String },
}, { _id: false });

const AnalysisSchema = new mongoose.Schema({
    overall_score: { type: Number },
    communication_score: { type: Number },
    confidence_score: { type: Number },
    content_score: { type: Number },
    summary: { type: String },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    fillerWordsFound: { type: [String], default: [] },
}, { _id: false });

const AIInterviewSessionSchema = new mongoose.Schema({
    user_id: { type: String, required: true },
    interview_type: { type: String },
    company: { type: String },
    role: { type: String },
    transcript: { type: String },
    messages: { type: [MessageSchema], default: [] },
    analysis: { type: AnalysisSchema, default: null },
}, { timestamps: true });

module.exports = mongoose.model('AIInterviewSession', AIInterviewSessionSchema);
