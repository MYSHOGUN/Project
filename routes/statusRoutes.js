const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const User = require('../models/User');
const { createLog, escapeHTML, renderWithLayout } = require('../utils/helpers');

const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

const requireNotRole = (role) => {
    return (req, res, next) => {
        if (role.includes(req.session.user.role)) {
            return res.redirect('/');
        }
        next();
    };
};

// Routes
router.get('/status', requireLogin, async (req, res) => {
  try {
    const groups = await Group.find().sort({ projectName: 1 });
    const groupsWithData = await Promise.all(groups.map(async (g) => {
      const user = await User.findOne({ username: g.member1 });
      return {
          ...g.toObject(),
          leaderName: user ? `${user.name} ${user.lastname}` : g.member1
      };
    }));

    return renderWithLayout(res, 'status', { title: 'KMUTNB Project - Status', groups: groupsWithData }, req.path, req);
  } catch (err) {
    console.error('Error fetching groups:', err);
    return res.status(500).send('Error loading status');
  }
});

router.get('/ownedGroupStatus', requireLogin, async (req, res) => {
  try {
    if (req.session.user.role === 'user' && req.session.user.group && req.session.user.group.length > 0) {
        const group = req.session.user.group[0];
        return res.redirect('/ownedGroupInfo/' + group);
    }
    const username = req.session.user.username;
    const groups = await Group.find({
        $and: [
            {$or: [
                { member1: username },
                { member2: username },
                { advisor: username }
            ]},
            {status: { $nin: ['ผ่านการสอบป้องกันปริญญานิพนธ์', 'ไม่ผ่านการสอบป้องกันปริญญานิพนธ์', 'ไม่ผ่านการสอบหัวข้อปริญญานิพนธ์'] }}
        ]
    }).sort({ projectName: 1 });
    const groupsWithData = await Promise.all(groups.map(async (g) => {
      const user = await User.findOne({ username: g.member1 });
      return {
          ...g.toObject(),
          leaderName: user ? `${user.name} ${user.lastname}` : g.member1
      };
    }));

    return renderWithLayout(res, 'ownedGroupStatus', { title: 'KMUTNB Project - Group Status', groups: groupsWithData }, req.path, req);
  } catch (err) {
    console.error('Error fetching groups:', err);
    return res.status(500).send('Error loading status');
  }
});

router.get('/flowchart', requireLogin, requireNotRole(['secretary']), (req, res) => {
  renderWithLayout(res, 'flowchart', { title: 'KMUTNB Project - Flowchart' }, req.path, req);
});

module.exports = router;
