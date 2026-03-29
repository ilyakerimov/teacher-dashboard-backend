const mongoose = require('mongoose');

const MakeupSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  originalLessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  scheduledDate: { type: Date }, 
  isCompleted: { type: Boolean, default: false },
  lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
  reason: { type: String }
});

module.exports = mongoose.model('Makeup', MakeupSchema);