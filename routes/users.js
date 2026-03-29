const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const Lesson = require('../models/Lesson');
const Student = require('../models/Student');

// Список преподавателей
router.get('/teachers', auth, admin, async (req, res) => {
  try {
    const teachers = await User.find({ role: 'teacher' }).select('-password');
    res.json(teachers);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Создать преподавателя
router.post('/teacher', auth, admin, async (req, res) => {
  const { name, email, password } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }
    user = new User({ name, email, password, role: 'teacher' });
    await user.save();
    const { password: _, ...userWithoutPass } = user.toObject();
    res.json(userWithoutPass);
  } catch (err) {
    res.status(500).json({ msg: 'Server error', details: err.message });
  }
});

// Обновить преподавателя
router.put('/teacher/:id', auth, admin, async (req, res) => {
  const { name, email, balance } = req.body;
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'teacher') {
      return res.status(404).json({ msg: 'Teacher not found' });
    }
    if (name) user.name = name;
    if (email) user.email = email;
    if (balance !== undefined) user.balance = balance;
    await user.save();
    res.json(user);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Изменить баланс преподавателя
router.put('/teacher/:id/balance', auth, admin, async (req, res) => {
  const { amount } = req.body;
  try {
    const teacher = await User.findById(req.params.id);
    if (!teacher || teacher.role !== 'teacher') {
      return res.status(404).json({ msg: 'Teacher not found' });
    }
    if (typeof amount !== 'number' && isNaN(parseFloat(amount))) {
      return res.status(400).json({ msg: 'Invalid amount' });
    }
    teacher.balance += parseFloat(amount);
    await teacher.save();
    res.json(teacher);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Удалить преподавателя
router.delete('/teacher/:id', auth, admin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Teacher removed' });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Получить баланс и историю текущего учителя
router.get('/me/balance-history', auth, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ msg: 'Access denied' });
    }
    const teacher = await User.findById(req.user.id).select('balance');
    // История начислений: можно собрать из завершённых уроков учителя
    const groups = require('../models/Group');
    const teacherGroups = await groups.find({ teacherId: req.user.id });
    const groupIds = teacherGroups.map(g => g._id);
    const lessons = await Lesson.find({ groupId: { $in: groupIds }, isCompleted: true })
      .populate('groupId', 'name')
      .sort({ date: -1 })
      .limit(50);

    const history = lessons.map(lesson => ({
      date: lesson.date,
      amount: lesson.totalIncome,
      type: 'credit',
      reason: `Урок группы ${lesson.groupId.name} от ${lesson.date.toLocaleDateString()}`,
      lessonId: lesson._id
    }));

    res.json({ balance: teacher.balance, history });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

module.exports = router;