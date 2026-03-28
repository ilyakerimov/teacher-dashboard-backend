const express = require('express');
const router = express.Router();
const Makeup = require('../models/Makeup');
const Lesson = require('../models/Lesson');
const Group = require('../models/Group');
const Student = require('../models/Student');
const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Отработки конкретного ученика
router.get('/student/:studentId', auth, async (req, res) => {
  try {
    const { studentId } = req.params;
    const makeups = await Makeup.find({ studentId })
      .populate('originalLessonId groupId teacherId');
    res.json(makeups);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Отработки текущего учителя
router.get('/teacher', auth, async (req, res) => {
  try {
    const teacherId = req.user.id;
    const makeups = await Makeup.find({ teacherId })
      .populate('studentId', 'name')
      .populate('groupId', 'name')
      .populate('originalLessonId', 'date');
    res.json(makeups);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Все отработки (только для админа)
router.get('/all', auth, admin, async (req, res) => {
  try {
    const makeups = await Makeup.find()
      .populate('studentId', 'name')
      .populate('groupId', 'name')
      .populate('originalLessonId', 'date')
      .populate('teacherId', 'name');
    res.json(makeups);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Создать отработку (вручную)
router.post('/', auth, async (req, res) => {
  const { studentId, originalLessonId } = req.body;
  try {
    const lesson = await Lesson.findById(originalLessonId).populate('groupId');
    if (!lesson) return res.status(404).json({ msg: 'Lesson not found' });
    const group = await Group.findById(lesson.groupId._id);
    if (req.user.role !== 'admin' && group.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Access denied' });
    }
    const existing = await Makeup.findOne({ studentId, originalLessonId });
    if (existing) return res.status(400).json({ msg: 'Makeup already exists' });
    const makeup = new Makeup({
      studentId,
      originalLessonId,
      groupId: lesson.groupId._id,
      teacherId: group.teacherId,
      price: group.pricePerLesson,
      date: new Date()
    });
    await makeup.save();
    res.json(makeup);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Завершить отработку
router.put('/:id/complete', auth, async (req, res) => {
  const { attendanceStatus, mark, reason } = req.body;
  try {
    const makeup = await Makeup.findById(req.params.id);
    if (!makeup) return res.status(404).json({ msg: 'Makeup not found' });
    if (makeup.isCompleted) return res.status(400).json({ msg: 'Already completed' });
    if (req.user.role !== 'admin' && makeup.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Access denied' });
    }
    makeup.isCompleted = true;
    makeup.attendanceStatus = attendanceStatus || 'present';
    if (mark) makeup.mark = mark;
    if (reason) makeup.reason = reason;
    if (attendanceStatus === 'present' || attendanceStatus === 'late') {
      const student = await Student.findById(makeup.studentId);
      const group = await Group.findById(makeup.groupId);
      if (student && group) {
        const price = group.pricePerLesson;
        student.balance -= price;
        student.history.push({
          amount: price,
          type: 'debit',
          reason: `Отработка пропущенного занятия (${makeup.date.toLocaleDateString()})`,
          groupId: group._id,
          lessonId: makeup.originalLessonId
        });
        await student.save();
        const teacher = await User.findById(makeup.teacherId);
        if (teacher) {
          teacher.balance += price;
          await teacher.save();
        }
      }
    }
    await makeup.save();
    res.json(makeup);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Получить отработку по ID
router.get('/:id', auth, async (req, res) => {
  try {
    const makeup = await Makeup.findById(req.params.id)
      .populate('studentId', 'name')
      .populate('groupId', 'name')
      .populate('originalLessonId', 'date');
    if (!makeup) return res.status(404).json({ msg: 'Makeup not found' });
    if (req.user.role !== 'admin' && makeup.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Access denied' });
    }
    res.json(makeup);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

module.exports = router;