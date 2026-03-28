const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  status: { type: String, enum: ['present', 'absent', 'late', 'excused'], default: 'absent' },
  reason: { type: String },
  mark: { type: Number, min: 1, max: 5 }
});

const LessonSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now },
  attendance: [AttendanceSchema],
  totalIncome: { type: Number, default: 0 },
  isCompleted: { type: Boolean, default: false }
});

module.exports = mongoose.model('Lesson', LessonSchema);