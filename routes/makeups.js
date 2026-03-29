const express = require('express');
const router = express.Router();
const Makeup = require('../models/Makeup');
const Lesson = require('../models/Lesson');
const Group = require('../models/Group');
const Student = require('../models/Student');
const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

router.get('/teacher', auth, async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { status } = req.query;
    let filter = { teacherId };
    if (status === 'completed') filter.isCompleted = true;
    else if (status === 'pending') filter.isCompleted = false;

    const makeups = await Makeup.find(filter)
      .populate('studentId', 'name parentName parentPhone phone')
      .populate('groupId', 'name')
      .populate('originalLessonId', 'date')
      .sort({ scheduledDate: 1 });
    res.json(makeups);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.get('/all', auth, admin, async (req, res) => {
  try {
    const { status } = req.query;
    let filter = {};
    if (status === 'completed') filter.isCompleted = true;
    else if (status === 'pending') filter.isCompleted = false;

    const makeups = await Makeup.find(filter)
      .populate('studentId', 'name')
      .populate('groupId', 'name')
      .populate('originalLessonId', 'date')
      .populate('teacherId', 'name')
      .sort({ scheduledDate: 1 });
    res.json(makeups);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.post('/', auth, async (req, res) => {
  const { studentId, originalLessonId } = req.body;
  try {
    const lesson = await Lesson.findById(originalLessonId).populate('groupId');
    if (!lesson) return res.status(404).json({ msg: 'Lesson not found' });
    const group = await Group.findById(lesson.groupId._id);
    if (!group) return res.status(404).json({ msg: 'Group not found' });
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
      scheduledDate: null,
      reason: req.body.reason || ''
    });
    await makeup.save();
    res.json(makeup);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.put('/:id/schedule', auth, async (req, res) => {
  const { scheduledDate } = req.body;
  try {
    const makeup = await Makeup.findById(req.params.id);
    if (!makeup) return res.status(404).json({ msg: 'Makeup not found' });
    if (makeup.isCompleted) return res.status(400).json({ msg: 'Already completed' });
    if (req.user.role !== 'admin' && makeup.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Access denied' });
    }
    if (!scheduledDate) return res.status(400).json({ msg: 'scheduledDate required' });

    const group = await Group.findById(makeup.groupId);
    if (!group) return res.status(404).json({ msg: 'Group not found' });

    const lesson = new Lesson({
      groupId: makeup.groupId,
      teacherId: makeup.teacherId,
      date: new Date(scheduledDate),
      attendance: [{ studentId: makeup.studentId, status: 'present' }],
      isMakeup: true,
      makeupForStudent: makeup.studentId,
      originalLessonId: makeup.originalLessonId,
      isCompleted: false
    });
    await lesson.save();

    makeup.scheduledDate = new Date(scheduledDate);
    makeup.lessonId = lesson._id;
    await makeup.save();

    res.json({ makeup, lesson });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const makeup = await Makeup.findById(req.params.id);
    if (!makeup) return res.status(404).json({ msg: 'Makeup not found' });
    if (makeup.isCompleted) return res.status(400).json({ msg: 'Cannot delete completed makeup' });
    if (req.user.role !== 'admin' && makeup.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Access denied' });
    }
    if (makeup.lessonId) {
      await Lesson.findByIdAndDelete(makeup.lessonId);
    }
    await Makeup.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Makeup deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const makeup = await Makeup.findById(req.params.id)
      .populate('studentId', 'name parentName parentPhone phone')
      .populate('groupId', 'name')
      .populate('originalLessonId', 'date')
      .populate('lessonId');
    if (!makeup) return res.status(404).json({ msg: 'Makeup not found' });
    if (req.user.role !== 'admin' && makeup.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Access denied' });
    }
    res.json(makeup);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;