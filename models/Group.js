const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  schedule: {
    dayOfWeek: { type: Number, min: 0, max: 6 },
    time: { type: String }
  },
  pricePerLesson: { type: Number, required: true },
  isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model('Group', GroupSchema);