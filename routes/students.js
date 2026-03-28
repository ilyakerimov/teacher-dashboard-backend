const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Lesson = require('../models/Lesson');
const auth = require('../middleware/auth');

// Middleware для запрета кэширования
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Получить всех учеников (админ – всех, учитель – только своих)
router.get('/', auth, async (req, res) => {
  try {
    let students;
    if (req.user.role === 'admin') {
      students = await Student.find().populate('groups', 'name');
    } else {
      const Group = require('../models/Group');
      const groups = await Group.find({ teacherId: req.user.id }).select('students');
      const studentIds = groups.flatMap(g => g.students);
      students = await Student.find({ _id: { $in: studentIds } }).populate('groups', 'name');
    }
    res.json(students);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Получить одного ученика
router.get('/:id', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).populate('groups', 'name');
    if (!student) return res.status(404).json({ msg: 'Student not found' });
    if (req.user.role !== 'admin') {
      const Group = require('../models/Group');
      const groups = await Group.find({ teacherId: req.user.id, students: student._id });
      if (groups.length === 0) return res.status(403).json({ msg: 'Access denied' });
    }
    res.json(student);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// ИСТОРИЯ ТРАНЗАКЦИЙ (только админ)
router.get('/:id/history', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ msg: 'Student not found' });
    res.json(student.history || []);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// ЗАНЯТИЯ СТУДЕНТА (для учителя)
router.get('/:id/lessons', auth, async (req, res) => {
  try {
    const studentId = req.params.id;
    // Проверка прав: учитель может видеть только своих учеников
    if (req.user.role !== 'admin') {
      const Group = require('../models/Group');
      const groups = await Group.find({ teacherId: req.user.id, students: studentId });
      if (groups.length === 0) return res.status(403).json({ msg: 'Access denied' });
    }
    const lessons = await Lesson.find({ 'attendance.studentId': studentId })
      .populate('groupId', 'name')
      .sort({ date: -1 });
    const result = lessons.map(lesson => {
      const att = lesson.attendance.find(a => a.studentId.toString() === studentId);
      return {
        _id: lesson._id,
        date: lesson.date,
        groupId: lesson.groupId,
        attendanceStatus: att?.status || 'unknown',
        attendanceMark: att?.mark
      };
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// ИЗМЕНИТЬ БАЛАНС (только админ)
router.post('/:id/balance', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    const { amount, reason } = req.body;
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ msg: 'Student not found' });
    student.balance += amount;
    student.history.push({
      amount,
      type: amount >= 0 ? 'credit' : 'debit',
      reason: reason || 'Ручное изменение баланса',
      date: new Date()
    });
    await student.save();
    res.json(student);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Создать ученика
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    const { name, phone, balance } = req.body;
    const student = new Student({ name, phone, balance: balance || 0, history: [] });
    await student.save();
    res.json(student);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Обновить ученика
router.put('/:id', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ msg: 'Student not found' });
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    const { name, phone, balance } = req.body;
    if (name) student.name = name;
    if (phone) student.phone = phone;
    if (balance !== undefined) student.balance = balance;
    await student.save();
    res.json(student);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Удалить ученика
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    await Student.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Student deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;