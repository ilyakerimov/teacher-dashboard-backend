const mongoose = require('mongoose');

const MakeupSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  originalLessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now },
  isCompleted: { type: Boolean, default: false },
  attendanceStatus: { type: String, enum: ['present', 'absent', 'late', 'excused'], default: 'present' },
  mark: { type: Number, min: 1, max: 5 },
  price: { type: Number, required: true },
  reason: { type: String }
});

module.exports = mongoose.model('Makeup', MakeupSchema);