const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  reason: { type: String },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }
});

const StudentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String },
  phone: { type: String },                     // телефон ученика
  parentName: { type: String },                // имя родителя
  parentPhone: { type: String },               // телефон родителя
  balance: { type: Number, default: 0 },
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }],
  history: [TransactionSchema]
});

module.exports = mongoose.model('Student', StudentSchema);