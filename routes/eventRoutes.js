const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Group = require('../models/Group');
const User = require('../models/User');
const Paper = require('../models/Paper');
const { createLog, renderWithLayout } = require('../utils/helpers');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

const requireRole = (role) => {
  return function (req, res, next) {
    if (!role.includes(req.session.user.role)) {
      return res.redirect('/');
    }
    next();
  };
};

function generateEventId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `EVT-${timestamp}-${random}`.toUpperCase();
}

// Routes
router.get('/event', requireLogin, requireRole(['admin', 'teacher']), (req, res) => {
  renderWithLayout(res, 'event', { title: 'KMUTNB Project - Event' }, req.path, req);
});

router.get('/addEvent', requireLogin, requireRole(['admin', 'teacher']), (req, res) => {
  renderWithLayout(res, 'addEvent', { title: 'KMUTNB Project - Add Event' }, req.path, req);
});

router.get('/eventInfo/:id', requireLogin, async (req, res) => {
    try {
        const id = req.params.id;
        const event = await Event.findOne({ id: id });
        if (!event) return res.status(404).send('ไม่พบข้อมูลกิจกรรม');
        renderWithLayout(res, 'eventInfo', { title: 'Event Info', event }, req.path, req);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.delete('/deleteEvent/:id', requireLogin, requireRole(['admin', 'teacher']), async (req, res) => {
    try {
        const id = req.params.id;
        await Event.findOneAndDelete({ id: id });
        res.json({ success: true, message: 'ลบกิจกรรมสำเร็จ' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
    await createLog(req, 'DELETE_EVENT', { eventId: req.params.id });
});

router.post('/api/addEvent', requireLogin, requireRole(['admin', 'teacher']), async (req, res) => {
    try {
        const { title, date, toDate, description } = req.body;
        const eventId = generateEventId();
        let date1 = null;
        if (date && typeof date === 'string' && date.trim() !== '') {
            const [year, month, day] = date.split('-').map(Number);
            date1 = new Date(year, month - 1, day);
        }
        let date2 = null;
        if (toDate && typeof toDate === 'string' && toDate.trim() !== '') {
            const [year, month, day] = toDate.split('-').map(Number);
            date2 = new Date(year, month - 1, day);
        }
        const expire = date2 ? new Date(date2) : (date1 ? new Date(date1) : new Date());
        expire.setHours(23, 59, 59, 999);
        const newEvent = new Event({
            id: eventId,
            title,
            description,
            date: date1,
            toDate: date2,
            expireAt: expire
        });
        await newEvent.save();
        res.json({ success: true, message: 'บันทึกกิจกรรมสำเร็จ' });
    } catch (err) {
        console.error('❌ Add Event Error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
    await createLog(req, 'ADD_EVENT', { eventTitle: req.body.title });
});

router.get('/api/getEvents', requireLogin, async (req, res) => {
    try {
        const events = await Event.find().sort({ date: -1 });
        res.json({ events });
    } catch (err) {
        console.error('❌ Get Events Error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
});

router.post('/api/addEventForGroup', requireLogin, requireRole(['admin', 'teacher']), upload.single('file'), async (req, res) => {
    try {
        const { title, date, toDate, description, chosenGroup, advisor, greatDirector, director, dateTest, time } = req.body;
        const group = await Group.findById(chosenGroup);
        if (!group) return res.status(404).json({ error: 'ไม่พบข้อมูลกลุ่ม' });
        if (!title || !date) return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
        const eventId = generateEventId();
        let date1 = null;
        if (date && typeof date === 'string' && date.trim() !== '') {
            const [year, month, day] = date.split('-').map(Number);
            date1 = new Date(year, month - 1, day);
        }
        let date2 = null;
        if (toDate && typeof toDate === 'string' && toDate.trim() !== '') {
            const [year, month, day] = toDate.split('-').map(Number);
            date2 = new Date(year, month - 1, day);
        }
        const expire = date2 ? new Date(date2) : (date1 ? new Date(date1) : new Date());
        expire.setHours(23, 59, 59, 999);
        let advStr = '';
        let gDirStr = '';
        let dirStr = '';
        if (title === 'วันสอบ') {
            const cleanNameFunc = (s) => s.trim().replace(/^(ดร\.|ผศ\.ดร\.|ผศ\.|รศ\.ดร\.|รศ\.|ศ\.|มร\.|นาย|นางสาว|นาง|อาจารย์|อ\.)\s?/, '').split(/\s+/)[0];
            advStr = advisor ? advisor.toString().split(/[,\/;]|\sและ\s/).map(cleanNameFunc).filter(s => s !== '').join(', ') : '';
            gDirStr = greatDirector ? greatDirector.toString().split(/[,\/;]|\sและ\s/).map(cleanNameFunc).filter(s => s !== '').join(', ') : '';
            dirStr = director ? director.toString().split(/[,\/;]|\sและ\s/).map(cleanNameFunc).filter(s => s !== '').join(', ') : '';
            if (!dirStr && !advStr && !gDirStr) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง: ไม่มีกรรมการ' });
            const testresultsdate = new Date(expire);
            testresultsdate.setDate(testresultsdate.getDate() + 7);
            const paperPassTimes = group.passTimes || 0;
            const newPaper = new Paper({
                eventId: eventId,
                groupId: group._id,
                mention: description || title,
                expireAt: testresultsdate,
                passTimes: paperPassTimes,
                date: date1,
                advisor: advStr,
                greatDirector: gDirStr,
                director: dirStr
            });
            await newPaper.save();
            const mem1 = await User.findOne({ username: group.member1 });
            const mem2 = group.member2 ? await User.findOne({ username: group.member2 }) : null;
            if (group.passTimes === 0) {
                group.status = 'รอสอบนำเสนอหัวข้อปริญญานิพนธ์';
            } else if (group.passTimes >= 1) {
                if (mem1?.branch === 'ECT' || mem2?.branch === 'ECT') {
                    group.status = 'รอสอบก้าวหน้าปริญญานิพนธ์';
                } else {
                    group.status = 'รอสอบป้องกันปริญญานิพนธ์';
                }
            }
            await group.save();
        } else if (title === 'วันส่งเอกสาร') {
            let existingPaper = await Paper.findOne({
                groupId: group._id,
                passTimes: group.passTimes,
                mention: { $not: /จะมีการจัดสอบ/ }
            });
            if (existingPaper) {
                existingPaper.eventId = eventId;
                existingPaper.mention = description || title;
                existingPaper.expireAt = expire;
                existingPaper.date = expire;
                await existingPaper.save();
            } else {
                const newPaper = new Paper({
                    eventId: eventId,
                    groupId: group._id,
                    mention: description || title,
                    expireAt: expire,
                    passTimes: group.passTimes,
                    date: expire
                });
                await newPaper.save();
            }
            await Group.findOneAndUpdate(
                { _id: group._id },
                { $inc: { fileTimes: 1 } },
                { new: true }
            );
        }
        const newEvent = new Event({
            id: eventId,
            title,
            description,
            testTableSingle: {
                advisor: advStr,
                greatDirector: gDirStr,
                director: dirStr,
                date: dateTest,
                time: time
            },
            toGroup: chosenGroup,
            date: date1,
            toDate: date2,
            expireAt: expire
        });
        await newEvent.save();
        res.status(201).json({ message: 'บันทึกสำเร็จ' });
    } catch (err) {
        console.error('❌ API Error:', err);
        return res.status(500).json({ message: err.message || err.toString() || 'Server Internal Error' });
    }
    await createLog(req, 'ADD_EVENT_GROUP', { username: req.session.user.username, eventTitle: req.body.title });
});

router.post('/update-exam-schedule', requireLogin, requireRole(['admin']), async (req, res) => {
    try {
        const { eventId, data: updatedData } = req.body;
        const event = await Event.findOne({ id: eventId });
        if (!event) return res.status(404).send('ไม่พบข้อมูลกิจกรรม');
        const allTeachers = await User.find({ role: { $in: ['admin', 'teacher'] } }).lean();
        const getTeacherUsername = (name) => {
            if (!name) return null;
            const teacher = allTeachers.find(t => t.name.includes(name) || name.includes(t.name));
            return teacher ? teacher.username : name;
        };
        let newTestData = [];
        for (const row of updatedData) {
            const newGroupName = (row['ชื่อกลุ่ม'] || '').trim();
            const originalGroupName = (row['originalGroupName'] || '').trim();
            let targetGroup = null;
            let finalGroupName = newGroupName;
            if (newGroupName) {
                targetGroup = await Group.findOne({ projectName: newGroupName });
            }
            if (!targetGroup && originalGroupName) {
                targetGroup = await Group.findOne({ projectName: originalGroupName });
                if (targetGroup) {
                    finalGroupName = originalGroupName;
                }
            }
            if (!targetGroup) {
                console.warn(`⚠️ Skipping row: No group found for new name "${newGroupName}" or original name "${originalGroupName}"`);
                continue;
            }
            const cleanAndSplit = (val) => {
                if (!val) return [];
                return String(val).split(/[,\/;]|\sและ\s/).map(s => s.trim().replace(/^(ผู้ช่วยศาสตราจารย์\s?|รองศาสตราจารย์\s?|ศาสตราจารย์\s?|ดร\.\s?|ผศ\.\s?ดร\.\s?|ผศ\.\s?|รศ\.\s?ดร\.\s?|รศ\.\s?|ศ\.\s?|มร\.\s?|นาย\s?|นางสาว\s?|นาง\s?|อาจารย์\s?|อ\.\s?)+/g, '')).filter(Boolean);
            };
            let advisorsStr = cleanAndSplit(row['อาจารย์ที่ปรึกษา']);
            let greatDirectorsStr = cleanAndSplit(row['ประธานกรรมการ']);
            let directorStr = cleanAndSplit(row['กรรมการ']);
            let advisorUsername = advisorsStr.map(getTeacherUsername).filter(Boolean);
            let greatDirectorUsername = greatDirectorsStr.map(getTeacherUsername).filter(Boolean);
            let directorUsername = directorStr.map(getTeacherUsername).filter(Boolean);
            const datePart = row['dateOnly'];
            const timePart = row['timeOnly'] || '00:00';
            let finalDate = new Date(`${datePart}T${timePart}`);
            if (isNaN(finalDate.getTime())) {
                finalDate = new Date(event.date);
            }
            newTestData.push({
                groupName: finalGroupName,
                advisor: advisorUsername.join(', '),
                greatDirector: greatDirectorUsername.join(', '),
                director: directorUsername.join(', '),
                date: finalDate,
                time: timePart
            });
            const testResultsExpire = new Date(finalDate);
            testResultsExpire.setDate(testResultsExpire.getDate() + 7);
            await Paper.findOneAndUpdate(
                { eventId: event.id, groupId: targetGroup._id },
                {
                    $set: {
                        advisor: advisorUsername.join(', '),
                        greatDirector: greatDirectorUsername.join(', '),
                        director: directorUsername.join(', '),
                        mention: event.description || event.title,
                        expireAt: testResultsExpire,
                        date: finalDate
                    }
                },
                { upsert: true }
            );
        }
        event.testData = newTestData;
        await event.save();
        res.json({ success: true, message: 'อัปเดตตารางสอบเรียบร้อยแล้ว' });
    } catch (err) {
        console.error('❌ Update Error:', err);
        res.status(500).send('เกิดข้อผิดพลาด: ' + err.message);
    }
});

router.post('/api/groups/mark-ready-for-exam', requireLogin, async (req, res) => {
    if (!req.session.user || (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin')) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดำเนินการนี้' });
    }
    try {
        const { groupId, paperId, isReady, comment } = req.body;
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: 'ไม่พบข้อมูลกลุ่ม' });
        const mem1 = await User.findOne({ username: group.member1 });
        const mem2 = group.member2 ? await User.findOne({ username: group.member2 }) : null;
        let statusCheck;
        if (isReady !== false) {
            if (group.passTimes === 0) {
                statusCheck = 'พร้อมสอบนำเสนอหัวข้อปริญญานิพนธ์';
            } else if (group.passTimes >= 1) {
                if (mem1?.branch === 'EnET' || mem2?.branch === 'EnET') {
                    statusCheck = 'พร้อมสอบป้องกันปริญญานิพนธ์';
                } else {
                    statusCheck = 'พร้อมสอบก้าวหน้าปริญญานิพนธ์';
                }
            }
        } else {
            if (group.passTimes === 0) {
                statusCheck = 'ไม่พร้อมสอบนำเสนอหัวข้อปริญญานิพนธ์';
            } else if (group.passTimes >= 1) {
                if (mem1?.branch === 'EnET' || mem2?.branch === 'EnET') {
                    statusCheck = 'ไม่พร้อมสอบป้องกันปริญญานิพนธ์';
                } else {
                    statusCheck = 'ไม่พร้อมสอบก้าวหน้าปริญญานิพนธ์';
                }
            }
        }
        const result = await PaperFile.updateMany(
            { $and: [{ groupId: groupId }, { paperId: paperId }] },
            { $set: { check: isReady !== false } }
        );
        if (result.matchedCount === 0) {
            return res.status(400).json({ error: 'ยังไม่มีการส่งเอกสารสำหรับการสอบนี้' });
        }
        const updatedGroup = await Group.findByIdAndUpdate(groupId, { status: statusCheck }, { new: true });
        if (!updatedGroup) return res.status(404).json({ error: 'ไม่พบข้อมูลกลุ่ม' });
        res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/api/getMyGroups', requireLogin, async (req, res) => {
    try {
        const groups = await Group.find({ status: { $in: ['พร้อมสอบนำเสนอหัวข้อปริญญานิพนธ์', 'พร้อมสอบป้องกันปริญญานิพนธ์', 'พร้อมสอบก้าวหน้าปริญญานิพนธ์'] } });
        const teachers = await User.find({ role: { $in: ['teacher', 'admin'] } });
        res.json({ groups, teachers });
    } catch (err) {
        console.error('❌ Error in getMyGroups:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

module.exports = router;
