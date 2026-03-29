const express = require('express');
const router = express.Router();
const Lesson = require('../models/Lesson');
const Group = require('../models/Group');
const Student = require('../models/Student');
const User = require('../models/User');
const Makeup = require('../models/Makeup');
const auth = require('../middleware/auth');

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

const getUTCDateStr = (date) => {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

router.get('/group/:groupId/active', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const dateStr = req.query.date || getUTCDateStr(new Date());
    const [year, month, day] = dateStr.split('-');
    const startDate = new Date(Date.UTC(year, month-1, day));
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
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.get('/teacher/week-schedule', auth, async (req, res) => {
  try {
    const { startDate } = req.query;
    if (!startDate) return res.status(400).json({ msg: 'startDate required' });

    const [year, month, day] = startDate.split('-');
    const start = new Date(Date.UTC(year, month-1, day));
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);

    const groups = await Group.find({ teacherId: req.user.id });
    const lessons = await Lesson.find({
      groupId: { $in: groups.map(g => g._id) },
      date: { $gte: start, $lt: end }
    }).populate('groupId', 'name schedule pricePerLesson');

    const makeupLessons = await Lesson.find({
      teacherId: req.user.id,
      isMakeup: true,
      date: { $gte: start, $lt: end }
    }).populate('groupId', 'name schedule pricePerLesson').populate('makeupForStudent', 'name');

    const schedule = [];
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(start);
      dayDate.setUTCDate(start.getUTCDate() + i);
      const daySchedule = {
        date: dayDate,
        items: []
      };
      for (const group of groups) {
        if (group.schedule && group.schedule.dayOfWeek === i) {
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
      const dayMakeups = makeupLessons.filter(l => {
        const ld = new Date(l.date);
        ld.setUTCHours(0, 0, 0, 0);
        return ld.getTime() === dayDate.getTime();
      });
      for (const mu of dayMakeups) {
        if (!mu.groupId) continue;
        daySchedule.items.push({
          type: 'makeup',
          lessonId: mu._id,
          groupId: mu.groupId._id,
          groupName: `${mu.groupId.name} (отработка: ${mu.makeupForStudent?.name || '?'})`,
          time: mu.date.toISOString().slice(11,16),
          isCompleted: mu.isCompleted,
          attendance: mu.attendance,
          studentsCount: 1,
          isMakeup: true
        });
      }
      daySchedule.items.sort((a, b) => a.time.localeCompare(b.time));
      schedule.push(daySchedule);
    }
    res.json(schedule);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// ИСПРАВЛЕННЫЙ МЕТОД ЗАВЕРШЕНИЯ УРОКА
router.put('/:id/complete', auth, async (req, res) => {
  try {
    let lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ msg: 'Lesson not found' });
    if (lesson.isCompleted) return res.status(400).json({ msg: 'Lesson already completed' });

    const group = await Group.findById(lesson.groupId);
    if (!group) return res.status(404).json({ msg: 'Group not found' });
    if (req.user.role !== 'admin' && group.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Access denied' });
    }

    const price = group.pricePerLesson;
    let totalIncome = 0;

    // Список студентов, которые были присутствовали (для начисления оплаты)
    const presentStudentIds = [];

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
          presentStudentIds.push(att.studentId.toString());
        }
      }
    }

    lesson.isCompleted = true;
    lesson.totalIncome = totalIncome;
    await lesson.save();

    // Обработка отработок
    if (!lesson.isMakeup) {
      // Обычный урок: создаём отработки для отсутствующих (кроме тех, кто присутствовал)
      const absentStudents = lesson.attendance.filter(att =>
        att.status === 'absent' && !presentStudentIds.includes(att.studentId.toString())
      );
      for (const att of absentStudents) {
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
            scheduledDate: null,
            reason: att.reason || ''
          });
          await makeup.save();
        }
      }
    } else {
      // Урок-отработка: помечаем соответствующую запись Makeup как завершённую
      // Ищем по lessonId (прямая ссылка) или по originalLessonId + studentId
      let makeup = await Makeup.findOne({ lessonId: lesson._id });
      if (!makeup && lesson.originalLessonId && lesson.makeupForStudent) {
        makeup = await Makeup.findOne({
          originalLessonId: lesson.originalLessonId,
          studentId: lesson.makeupForStudent
        });
      }
      if (makeup && !makeup.isCompleted) {
        makeup.isCompleted = true;
        makeup.lessonId = lesson._id;
        await makeup.save();
      } else if (!makeup) {
        console.warn(`Makeup not found for lesson ${lesson._id}, originalLessonId=${lesson.originalLessonId}, student=${lesson.makeupForStudent}`);
      }
    }

    // Начисление учителю
    const teacher = await User.findById(group.teacherId);
    if (teacher) {
      teacher.balance += totalIncome;
      await teacher.save();
    }

    res.json(lesson);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id)
      .populate('groupId', 'name schedule pricePerLesson')
      .populate('attendance.studentId', 'name');
    if (!lesson) return res.status(404).json({ msg: 'Lesson not found' });
    const group = await Group.findById(lesson.groupId);
    if (!group) return res.status(404).json({ msg: 'Group not found' });
    if (req.user.role !== 'admin' && group.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Access denied' });
    }
    res.json(lesson);
  } catch (err) {
    console.error(err);
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
    if (!group) return res.status(404).json({ msg: 'Group not found' });
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;