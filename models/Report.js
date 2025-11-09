const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  filename: {
    type: String,
    required: true
  },
  timestamp: {
    type: String,
    required: true
  },
  date: {
    type: String,
    required: true
  },
  duration_seconds: {
    type: Number,
    required: true
  },
  total_violations: {
    type: Number,
    default: 0
  },
  risk_score: {
    type: Number,
    default: 0
  },
  total_blinks: {
    type: Number,
    default: 0
  },
  excessive_blink_count: {
    type: Number,
    default: 0
  },
  gaze_away_count: {
    type: Number,
    default: 0
  },
  no_face_count: {
    type: Number,
    default: 0
  },
  multiple_faces_count: {
    type: Number,
    default: 0
  },
  talking_count: {
    type: Number,
    default: 0
  },
  eyes_closed_count: {
    type: Number,
    default: 0
  },
  violations: {
    type: Array,
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
ReportSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Report', ReportSchema);