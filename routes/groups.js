const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const Student = require('../models/Student');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

router.get('/', auth, async (req, res) => {
  try {
    let groups;
    if (req.user.role === 'admin') {
      groups = await Group.find().populate('teacherId', 'name');
    } else {
      groups = await Group.find({ teacherId: req.user.id }).populate('teacherId', 'name');
    }
    res.json(groups);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('teacherId', 'name')
      .populate('students', 'name email balance');
    if (!group) return res.status(404).json({ msg: 'Group not found' });
    if (req.user.role !== 'admin' && group.teacherId._id.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Access denied' });
    }
    res.json(group);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

router.post('/', auth, admin, async (req, res) => {
  const { name, teacherId, students, schedule, pricePerLesson } = req.body;
  try {
    const group = new Group({ name, teacherId, students, schedule, pricePerLesson });
    await group.save();
    if (students && students.length) {
      await Student.updateMany({ _id: { $in: students } }, { $addToSet: { groups: group._id } });
    }
    res.json(group);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

router.put('/:id', auth, admin, async (req, res) => {
  const { name, teacherId, students, schedule, pricePerLesson, isActive } = req.body;
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ msg: 'Group not found' });

    if (name) group.name = name;
    if (teacherId) group.teacherId = teacherId;
    if (schedule) group.schedule = schedule;
    if (pricePerLesson) group.pricePerLesson = pricePerLesson;
    if (isActive !== undefined) group.isActive = isActive;

    if (students) {
      const oldStudents = group.students.map(s => s.toString());
      const newStudents = students.map(s => s.toString());

      const toRemove = oldStudents.filter(s => !newStudents.includes(s));
      await Student.updateMany({ _id: { $in: toRemove } }, { $pull: { groups: group._id } });

      const toAdd = newStudents.filter(s => !oldStudents.includes(s));
      await Student.updateMany({ _id: { $in: toAdd } }, { $addToSet: { groups: group._id } });

      group.students = students;
    }

    await group.save();
    res.json(group);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

router.delete('/:id', auth, admin, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ msg: 'Group not found' });
    await Student.updateMany({ groups: group._id }, { $pull: { groups: group._id } });
    await Group.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Group removed' });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

module.exports = router;