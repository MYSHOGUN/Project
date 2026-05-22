const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Log = require('../models/Log');
const logger = require('../models/logger');
const { createLog, renderWithLayout } = require('../utils/helpers');

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

// Routes
router.get('/admin', requireLogin, requireRole(['admin']), async (req, res) => {
  try {
      renderWithLayout(res, 'admin', { title: 'KMUTNB Project - Admin Panel' }, req.path, req);
  } catch (err) {
      console.error('Admin Panel Error:', err);
      return res.status(500).send('Internal Server Error');
  }
});

router.get('/userInfo', requireLogin, requireRole(['admin', 'secretary']), async (req, res) => {
    try {
        const students = await User.find({ role: 'user' }).sort({ username: 1 }).lean();
        const Group = require('../models/Group');
        const groups = await Group.find({}).sort({ _id: -1 }).lean();

        const timeSince = (date) => {
            if (!date) return '';
            const seconds = Math.floor((new Date() - new Date(date)) / 1000);
            if (seconds < 0) return 'เพิ่งอัปเดต';
            let interval = Math.floor(seconds / 31536000);
            if (interval >= 1) return interval + ' ปีที่แล้ว';
            interval = Math.floor(seconds / 2592000);
            if (interval >= 1) return interval + ' เดือนที่แล้ว';
            interval = Math.floor(seconds / 86400);
            if (interval >= 1) return interval + ' วันที่แล้ว';
            interval = Math.floor(seconds / 3600);
            if (interval >= 1) return interval + ' ชั่วโมงที่แล้ว';
            interval = Math.floor(seconds / 60);
            if (interval >= 1) return interval + ' นาทีที่แล้ว';
            return 'เพิ่งอัปเดต';
        };

        students.forEach(student => {
            let rawStatusTime;
            if (student.status && (student.status.includes('ผ่านการสอบป้องกัน') || student.status === 'จบแล้ว' || student.status === 'สำเร็จการศึกษา')) {
                student.displayStatus = student.status;
                rawStatusTime = student.updatedAt || student.createdAt;
            } else {
                const studentGroup = groups.find(g =>
                    g.member1 === student.username ||
                    g.member2 === student.username ||
                    g.member2 === `${student.username} (Pending)`
                );
                if (studentGroup) {
                    student.displayStatus = studentGroup.status;
                    rawStatusTime = studentGroup.updatedAt || studentGroup.lastUpdatedTime;
                } else {
                    student.displayStatus = 'ไม่มีกลุ่ม';
                    rawStatusTime = '';
                }
            }

            if (rawStatusTime) {
                student.statusTime = new Date(rawStatusTime).toLocaleString('th-TH', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                });
            } else {
                student.statusTime = '';
            }
        });

        const groupedData = students.reduce((acc, student) => {
            if (student.username && student.username.length >= 2) {
                const prefix = student.username.substring(0, 2);
                if (!acc[prefix]) acc[prefix] = [];
                acc[prefix].push(student);
            }
            return acc;
        }, {});

        renderWithLayout(res, 'userInfo', {
            title: 'KMUTNB Project - User Info',
            groupedData
        }, req.path, req);

    } catch (err) {
        console.error('❌ Error fetching users:', err);
        res.status(500).send('Error fetching users');
    }
});

router.post('/api/admin', requireLogin, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ error: 'Missing chosenAdvisor' });
        }

        if (username === req.session.user.username) {
            return res.status(400).json({ error: 'คุณเป็น Admin อยู่แล้ว' });
        }

        const advisorUser = await User.findOneAndUpdate(
            { username },
            { role: 'admin' },
            { new: true }
        );

        if (!advisorUser) {
            return res.status(404).json({ error: 'ไม่พบผู้ใช้ที่ต้องการมอบสิทธิ์ให้' });
        }

        const oldAdmin = await User.findOneAndUpdate(
            { username: req.session.user.username },
            { role: 'teacher' },
            { new: true }
        );

        req.session.user.role = 'teacher';

        res.json({
            success: true,
            message: `โอนสิทธิ์ Admin ให้ ${advisorUser.name} เรียบร้อยแล้ว ขณะนี้คุณมีสิทธิ์เป็น อาจารย์`
        });

    } catch (err) {
        console.error('❌ Admin Transfer Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
    await createLog(req, 'TRANSFER_ADMIN', { from: req.session.user.username, to: req.body.username });
});

router.get('/logs', requireLogin, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.redirect('/');
    }
    try {
        const logs = await Log.find().sort({ timestamp: -1 }).limit(200).lean();

        renderWithLayout(res, 'logs', {
            title: 'System Activity Logs',
            logs
        }, req.path, req);
    } catch (err) {
        logger.error('Error fetching logs: ' + err.message);
        res.status(500).send('Internal Server Error');
    }
    await createLog(req, 'VIEW_LOGS', { username: req.session.user.username });
});

module.exports = router;
