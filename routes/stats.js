const express = require('express');
const router = express.Router();
const Lesson = require('../models/Lesson');
const Group = require('../models/Group');
const Student = require('../models/Student');
const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Статистика учителя (баланс, количество уроков)
router.get('/teacher', auth, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(403).json({ msg: 'Use admin stats' });
    }
    const groups = await Group.find({ teacherId: req.user.id });
    const groupIds = groups.map(g => g._id);
    const totalLessons = await Lesson.countDocuments({ groupId: { $in: groupIds }, isCompleted: true });
    const openLessons = await Lesson.countDocuments({ groupId: { $in: groupIds }, isCompleted: false });
    const teacher = await User.findById(req.user.id).select('balance');

    // Возвращаем баланс вместо totalIncome
    res.json({
      totalLessons,
      openLessons,
      balance: teacher.balance
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Детальная статистика учителя (для страницы "Моя статистика")
router.get('/teacher/detailed', auth, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(403).json({ msg: 'Access denied' });
    }
    const groups = await Group.find({ teacherId: req.user.id });
    const groupIds = groups.map(g => g._id);
    const lessons = await Lesson.find({ groupId: { $in: groupIds }, isCompleted: true });
    const totalLessons = lessons.length;
    const teacher = await User.findById(req.user.id).select('balance');
    let totalAbsences = 0;
    for (const lesson of lessons) {
      totalAbsences += lesson.attendance.filter(a => a.status === 'absent').length;
    }
    const openLessons = await Lesson.countDocuments({ groupId: { $in: groupIds }, isCompleted: false });

    const groupsStats = [];
    for (const group of groups) {
      const groupLessons = await Lesson.find({ groupId: group._id, isCompleted: true });
      const lessonsCount = groupLessons.length;
      groupsStats.push({
        groupName: group.name,
        lessonsCount,
        pricePerLesson: group.pricePerLesson
      });
    }

    res.json({
      totalLessons,
      totalAbsences,
      openLessons,
      balance: teacher.balance,
      groupsStats
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Админ статистика
router.get('/admin', auth, admin, async (req, res) => {
  try {
    const teachers = await User.find({ role: 'teacher' }).select('name balance');
    const totalStudents = await Student.countDocuments();
    const totalGroups = await Group.countDocuments();
    const totalLessons = await Lesson.countDocuments({ isCompleted: true });
    const totalIncome = await Lesson.aggregate([{ $match: { isCompleted: true } }, { $group: { _id: null, total: { $sum: '$totalIncome' } } }]);

    const teacherStats = [];
    for (const teacher of teachers) {
      const groups = await Group.find({ teacherId: teacher._id });
      const groupIds = groups.map(g => g._id);
      const lessons = await Lesson.find({ groupId: { $in: groupIds }, isCompleted: true });
      const lessonsCount = lessons.length;
      const teacherIncome = lessons.reduce((sum, l) => sum + l.totalIncome, 0);
      const studentsInGroups = await Student.countDocuments({ groups: { $in: groupIds } });
      teacherStats.push({
        name: teacher.name,
        balance: teacher.balance,
        lessonsCount,
        teacherIncome,
        studentsCount: studentsInGroups
      });
    }

    res.json({
      totalStudents,
      totalGroups,
      totalLessons,
      totalIncome: totalIncome[0]?.total || 0,
      teacherStats
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Детальная админ статистика
router.get('/admin/detailed', auth, admin, async (req, res) => {
  try {
    const teachers = await User.find({ role: 'teacher' }).select('name balance');
    const totalStudents = await Student.countDocuments();
    const totalGroups = await Group.countDocuments();
    const totalLessons = await Lesson.countDocuments({ isCompleted: true });
    const totalIncome = await Lesson.aggregate([{ $match: { isCompleted: true } }, { $group: { _id: null, total: { $sum: '$totalIncome' } } }]);

    const teacherStats = [];
    for (const teacher of teachers) {
      const groups = await Group.find({ teacherId: teacher._id });
      const groupIds = groups.map(g => g._id);
      const lessons = await Lesson.find({ groupId: { $in: groupIds }, isCompleted: true });
      const lessonsCount = lessons.length;
      const teacherIncome = lessons.reduce((sum, l) => sum + l.totalIncome, 0);
      const studentsInGroups = await Student.countDocuments({ groups: { $in: groupIds } });
      teacherStats.push({
        name: teacher.name,
        balance: teacher.balance,
        lessonsCount,
        teacherIncome,
        studentsCount: studentsInGroups
      });
    }

    const groupsStats = [];
    const allGroups = await Group.find().populate('teacherId', 'name');
    for (const group of allGroups) {
      const groupLessons = await Lesson.find({ groupId: group._id, isCompleted: true });
      const lessonsCount = groupLessons.length;
      const income = groupLessons.reduce((sum, l) => sum + l.totalIncome, 0);
      groupsStats.push({
        name: group.name,
        teacherId: group.teacherId?.name || 'Не назначен',
        studentsCount: group.students.length,
        lessonsCount,
        totalIncome: income,
        pricePerLesson: group.pricePerLesson
      });
    }

    res.json({
      totalStudents,
      totalGroups,
      totalLessons,
      totalIncome: totalIncome[0]?.total || 0,
      teacherStats,
      groupsStats
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;