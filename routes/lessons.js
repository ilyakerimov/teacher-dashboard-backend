const express = require('express');
const router = express.Router();
const Lesson = require('../models/Lesson');
const Group = require('../models/Group');
const Student = require('../models/Student');
const User = require('../models/User');
const Makeup = require('../models/Makeup');
const auth = require('../middleware/auth');

// Middleware для запрета кэширования
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Вспомогательная функция для получения YYYY-MM-DD в UTC
const getUTCDateStr = (date) => {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

// Получить активный урок группы на сегодня (или создать)
router.get('/group/:groupId/active', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const dateStr = req.query.date || getUTCDateStr(new Date());
    const startDate = new Date(dateStr);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setUTCDate(startDate.getUTCDate() + 1);
    let lesson = await Lesson.findOne({
      groupId,
      date: { $gte: startDate, $lt: endDate },
      isCompleted: false
    });
    if (!lesson) {
      const group = await Group.findById(groupId);
      if (!group) return res.status(404).json({ msg: 'Group not found' });
      if (req.user.role !== 'admin' && group.teacherId.toString() !== req.user.id) {
        return res.status(403).json({ msg: 'Access denied' });
      }
      const attendance = group.students.map(studentId => ({
        studentId,
        status: 'absent',
        reason: ''
      }));
      lesson = new Lesson({
        groupId,
        teacherId: group.teacherId,
        date: startDate,
        attendance
      });
      await lesson.save();
    }
    res.json(lesson);
  } catch (err) {
    console.error('[ACTIVE LESSON ERROR]', err);
    res.status(500).send('Server error');
  }
});

// Расписание учителя на неделю (исправлено сравнение дат)
router.get('/teacher/week-schedule', auth, async (req, res) => {
  try {
    const { startDate } = req.query;
    if (!startDate) return res.status(400).json({ msg: 'startDate required' });
    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);
    const groups = await Group.find({ teacherId: req.user.id });
    const lessons = await Lesson.find({
      groupId: { $in: groups.map(g => g._id) },
      date: { $gte: start, $lt: end }
    }).populate('groupId', 'name schedule pricePerLesson');
    const schedule = [];
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(start);
      dayDate.setUTCDate(start.getUTCDate() + i);
      const daySchedule = {
        date: dayDate,
        items: []
      };
      for (const group of groups) {
        if (group.schedule.dayOfWeek === i) {
          const existingLesson = lessons.find(l => {
            const lessonDate = new Date(l.date);
            lessonDate.setUTCHours(0, 0, 0, 0);
            return l.groupId._id.toString() === group._id.toString() && lessonDate.getTime() === dayDate.getTime();
          });
          if (existingLesson) {
            daySchedule.items.push({
              type: 'lesson',
              lessonId: existingLesson._id,
              groupId: group._id,
              groupName: group.name,
              time: group.schedule.time,
              isCompleted: existingLesson.isCompleted,
              attendance: existingLesson.attendance,
              studentsCount: group.students.length
            });
          } else {
            daySchedule.items.push({
              type: 'planned',
              groupId: group._id,
              groupName: group.name,
              time: group.schedule.time,
              isCompleted: false,
              attendance: [],
              studentsCount: group.students.length
            });
          }
        }
      }
      daySchedule.items.sort((a, b) => a.time.localeCompare(b.time));
      schedule.push(daySchedule);
    }
    res.json(schedule);
  } catch (err) {
    console.error('[WEEK SCHEDULE ERROR]', err);
    res.status(500).send('Server error');
  }
});

// Завершить урок (сначала завершаем, потом списываем)
router.put('/:id/complete', auth, async (req, res) => {
  try {
    let lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ msg: 'Lesson not found' });
    if (lesson.isCompleted) return res.status(400).json({ msg: 'Lesson already completed' });

    const group = await Group.findById(lesson.groupId);
    if (req.user.role !== 'admin' && group.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Access denied' });
    }

    // 1. Помечаем урок завершённым
    lesson.isCompleted = true;
    await lesson.save();

    const price = group.pricePerLesson;
    let totalIncome = 0;

    // 2. Списываем деньги
    for (const att of lesson.attendance) {
      if (att.status === 'present' || att.status === 'late') {
        const student = await Student.findById(att.studentId);
        if (student) {
          student.balance -= price;
          student.history.push({
            amount: price,
            type: 'debit',
            reason: `Занятие ${lesson.date.toLocaleDateString()}, группа ${group.name}`,
            groupId: group._id,
            lessonId: lesson._id
          });
          await student.save();
          totalIncome += price;
        }
      }
    }

    // 3. Отработки
    for (const att of lesson.attendance) {
      if (att.status === 'absent') {
        const existingMakeup = await Makeup.findOne({
          studentId: att.studentId,
          originalLessonId: lesson._id
        });
        if (!existingMakeup) {
          const makeup = new Makeup({
            studentId: att.studentId,
            originalLessonId: lesson._id,
            groupId: lesson.groupId,
            teacherId: group.teacherId,
            price: group.pricePerLesson,
            date: new Date()
          });
          await makeup.save();
        }
      }
    }

    lesson.totalIncome = totalIncome;
    await lesson.save();

    const teacher = await User.findById(group.teacherId);
    if (teacher) {
      teacher.balance += totalIncome;
      await teacher.save();
    }

    res.json(lesson);
  } catch (err) {
    console.error('[COMPLETE LESSON ERROR]', err);
    res.status(500).send('Server error');
  }
});

// ... остальные маршруты без изменений (/:id, /:id/attendance, /group/:groupId, /teacher/paginated)
router.get('/:id', auth, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id)
      .populate('groupId', 'name schedule pricePerLesson')
      .populate('attendance.studentId', 'name');
    if (!lesson) return res.status(404).json({ msg: 'Lesson not found' });
    const group = await Group.findById(lesson.groupId);
    if (req.user.role !== 'admin' && group.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Access denied' });
    }
    res.json(lesson);
  } catch (err) {
    console.error('[GET LESSON ERROR]', err);
    res.status(500).send('Server error');
  }
});

router.put('/:id/attendance', auth, async (req, res) => {
  const { attendance } = req.body;
  try {
    let lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ msg: 'Lesson not found' });
    if (lesson.isCompleted) return res.status(400).json({ msg: 'Lesson already completed' });
    const group = await Group.findById(lesson.groupId);
    if (req.user.role !== 'admin' && group.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Access denied' });
    }
    for (const att of attendance) {
      const existing = lesson.attendance.find(a => a.studentId.toString() === att.studentId);
      if (existing) {
        existing.status = att.status;
        existing.reason = att.reason || '';
        existing.mark = att.mark;
      } else {
        lesson.attendance.push(att);
      }
    }
    await lesson.save();
    res.json(lesson);
  } catch (err) {
    console.error('[ATTENDANCE UPDATE ERROR]', err);
    res.status(500).send('Server error');
  }
});

router.get('/group/:groupId', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ msg: 'Group not found' });
    if (req.user.role !== 'admin' && group.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Access denied' });
    }
    const lessons = await Lesson.find({ groupId: req.params.groupId }).sort({ date: -1 });
    res.json(lessons);
  } catch (err) {
    console.error('[GROUP LESSONS ERROR]', err);
    res.status(500).send('Server error');
  }
});

router.get('/teacher/paginated', auth, async (req, res) => {
  try {
    if (req.user.role === 'admin') return res.status(403).json({ msg: 'Access denied' });
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const groups = await Group.find({ teacherId: req.user.id });
    const groupIds = groups.map(g => g._id);
    const total = await Lesson.countDocuments({ groupId: { $in: groupIds }, isCompleted: true });
    const lessons = await Lesson.find({ groupId: { $in: groupIds }, isCompleted: true })
      .populate('groupId', 'name')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);
    res.json({ lessons, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[PAGINATED LESSONS ERROR]', err);
    res.status(500).send('Server error');
  }
});

module.exports = router;