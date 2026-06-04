const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Group = require('../models/Group');
const User = require('../models/User');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const { createLog, escapeHTML, renderWithLayout } = require('../utils/helpers');
const crypto = require('crypto');

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

const requireNotRole = (role) => {
    return (req, res, next) => {
        if (role.includes(req.session.user.role)) {
            return res.redirect('/');
        }
        next();
    };
};

// Routes
router.get('/group', requireLogin, requireNotRole(['secretary']), async (req, res) => {
  try {
    if (req.session.user && Array.isArray(req.session.user.group) && req.session.user.group.length === 0) {
      return res.redirect('/addGroup');
    }

    const username = req.session.user.username;
    let groups = await Group.find({ allMember: { $in: [username] } }).sort({ lastUpdatedTime: -1 });

    let userInfo = [];

    const activeGroups = groups.filter(g => g.member1 === username || g.member2 === username || g.advisor === username);
    const pastGroups = groups.filter(g => g.member1 != username && g.member2 != username && g.advisor != username && (g.status === 'ผ่านการสอบป้องกันปริญญานิพนธ์' || g.status.includes('ไม่ผ่าน')));

    if (activeGroups && activeGroups.length > 0) {
        const myUsername = username;
        for (const group of activeGroups) {
            if (group.member1 === myUsername || group.member2 === myUsername) {
                const [mem1, mem2, adv] = await Promise.all([
                    User.findOne({ username: group.member1 }),
                    group.member2 ? User.findOne({ username: group.member2.replace(' (Pending)', '') }) : null,
                    group.advisor ? User.findOne({ username: group.advisor.replace(' (Pending)', '') }) : null
                ]);
                userInfo = [mem1, mem2, adv];
            }
        }
    }

    renderWithLayout(res, 'group', {
      title: 'KMUTNB Project - Group',
      userInfo,
      activeGroups,
      pastGroups,
      user: req.session.user
    }, req.path, req);
  } catch (err) {
    console.error('❌ Error loading groups:', err);
    res.status(500).send('Error loading groups');
  }
  await createLog(req, 'ENTER_CHAT', { username: req.session.user.username });
});

router.get('/addGroup', requireLogin, requireNotRole(['secretary']), async (req, res) => {
  if (req.session.user && Array.isArray(req.session.user.group) && req.session.user.group.length > 0) {
      return res.redirect('/group');
  }
  try {
    const username = req.session.user.username;
    const groups = await Group.find({
      $or: [
        { member1: username },
        { member2: username },
        { advisor: username }
      ]
    });

    let userInfo = [];

    if (groups.length > 0) {
      const mem1 = await User.findOne({ username: groups[0].member1 });
      const mem2 = await User.findOne({ username: groups[0].member2 });
      const adv = await User.findOne({ username: groups[0].advisor });
      userInfo = [mem1, mem2, adv];
    }

    renderWithLayout(res, 'addGroup', {
      title: 'KMUTNB Project - Group',
      groups,
      user: req.session.user
    }, req.path, req);
  } catch (err) {
    console.error('❌ Error loading addGroup:', err);
    return res.status(500).send('Error loading groups');
  }
});

router.get('/updateGroup', requireLogin, requireRole(['user']), async (req, res) => {
  try {
    const username = req.session.user.username;

    const groups = await Group.find({
      $and: [
        {
          $or: [
            { member1: username },
            { member2: username },
          ]
        },
        { status: { $nin: ['ผ่านการสอบป้องกันปริญญานิพนธ์', 'ไม่ผ่านการสอบป้องกันปริญญานิพนธ์', 'ไม่ผ่านการสอบหัวข้อปริญญานิพนธ์', 'ไม่มีสมาชิก'] } }
      ]
    });

    if (!groups || groups.length === 0) {
      return res.redirect('/group');
    }

    let userInfo = [];
    const targetGroup = groups[0];

    const mem1 = await User.findOne({ username: targetGroup.member1 });

    let mem2 = null;
    let mem2Username = String(targetGroup.member2);
    if (targetGroup.member2) {
        const cleanM2Username = targetGroup.member2.replace(' (Pending)', '');
        const user2 = await User.findOne({ username: cleanM2Username });

        if (mem2Username.includes('(Pending)')) {
            mem2 = user2 ? { ...user2.toObject(), lastname: `${user2.lastname} (Pending)` } : null;
        } else {
            mem2 = user2;
        }
    }

    let adv = null;
    let advUsername = String(targetGroup.advisor);
    if (targetGroup.advisor) {
        const cleanAdUsername = targetGroup.advisor.replace(' (Pending)', '');
        const advisor = await User.findOne({ username: cleanAdUsername });

        if (advUsername.includes('(Pending)')) {
            adv = advisor ? { ...advisor.toObject(), lastname: `${advisor.lastname} (Pending)` } : null;
        } else {
            adv = advisor;
        }
    }

    userInfo = [mem1, mem2, adv];

    renderWithLayout(res, 'updateGroup', {
      title: 'KMUTNB Project - Update Group',
      groups,
      userInfo
    }, req.path, req);

  } catch (err) {
    console.error('❌ Crash in /updateGroup:', err);
    return res.status(500).send('เกิดข้อผิดพลาดในการโหลดข้อมูลกลุ่ม');
  }
});

router.post('/groups', async (req, res) => {
    let { projectName, member1, engName } = req.body;
  try {
    const { member2, advisor } = req.body;

    projectName = projectName ? projectName.trim() : '';
    member1 = member1 ? member1.trim() : '';
    engName = engName ? engName.trim() : '';

    // Fix 2: Allow new group if old is finished
    const existingGroup = await Group.findOne({
      $or: [
        { member1: member1 },
        { member2: member1 }
      ],
      status: { $nin: ['ผ่านการสอบป้องกันปริญญานิพนธ์', 'ไม่ผ่านการสอบป้องกันปริญญานิพนธ์', 'ไม่ผ่านการสอบหัวข้อปริญญานิพนธ์', 'ไม่มีสมาชิก'] }
    });

    if (existingGroup) {
      return res.status(400).send('สมาชิกนี้มีกลุ่มที่กำลังดำเนินการอยู่แล้ว');
    }

    const status = 'ไม่มีอาจารย์ที่ปรึกษา';
    if (!projectName || !engName || !member1) {
      return res.status(400).send('ข้อมูลไม่ครบ');
    }

    const mem2 = member2 === null || member2 === '' || member2 === 'undefined' ? null : `${member2} (Pending)`;
    const adv = advisor === null || advisor === '' || advisor === 'undefined' ? null : `${advisor} (Pending)`;

    const newGroup = new Group({ projectName, engName, member1: member1, member2: mem2, advisor: adv, status, allMember: [member1] });
    await newGroup.save();

    const Paper = require('../models/Paper');
    const newPaper = new Paper({
        eventId: 'default',
        groupId: newGroup._id,
        mention: 'สามารถส่งเอกสารได้ตลอดเวลา',
        passTimes: 0,
        date: new Date('2099-12-31')
    });
    await newPaper.save();

    await User.findOneAndUpdate(
      { username: member1 },
      { $set: { group: [newGroup._id], currentGroupJoinedAt: new Date() } }
    );

    req.session.user.group = [newGroup._id];

    // Fix 3: Send simple OK to avoid alert bug
    res.status(201).send('OK');
  } catch (err) {
    console.error('❌ Error saving group:', err);
    return res.status(500).send('เกิดข้อผิดพลาดในการบันทึกกลุ่ม');
  }
  await createLog(req, 'CREATE_GROUP', { groupName: projectName, createBy: member1 });
});

router.post('/groups/leave/:groupId', async (req, res) => {
    let group;
  try {
    const groupId = req.params.groupId;
    const username = req.session.user.username;

    group = await Group.findById(groupId);
    if (!group) return res.status(404).send('ไม่พบกลุ่ม');

    // Fix: Robust check for status requiring approval
    const currentStatus = group.status || '';
    const isInitial = currentStatus === 'ไม่มีอาจารย์ที่ปรึกษา' || currentStatus.includes('รอนำเสนอหัวข้อ');
    
    if (req.session.user.role === 'user' && !isInitial && group.advisor) {
      // Clean up advisor string safely
      const advisorStr = String(group.advisor);
      const advisorClean = advisorStr.replace(" (Pending)", "").trim();
      
      if (!advisorClean) {
          return res.status(400).send('ไม่พบรายชื่ออาจารย์ที่ปรึกษาเพื่อส่งคำขอ');
      }

      const existingNoti = await Notification.findOne({ type: 'leave_group_request', group: groupId, senderUsername: username });
      if (existingNoti) return res.status(400).send('คุณได้ส่งคำขอออกกลุ่มไปแล้ว กรุณารอการอนุมัติ');

      const newNoti = new Notification({
          recipient: [advisorClean],
          senderUsername: username,
          senderName: req.session.user.name,
          type: 'leave_group_request',
          group: groupId,
          text: `นักศึกษา ${req.session.user.name} ขออนุมัติออกจากกลุ่ม ${group.projectName}`,
          isRead: false
      });
      await newNoti.save();
      
      await createLog(req, 'REQUEST_LEAVE_GROUP', { groupName: group.projectName, requestBy: username });
      return res.status(200).send('REQUEST_SENT');
    }

    // Logic for direct removal
    if (group.member1 === username) {
      group.member1 = group.member2 ? String(group.member2).replace(" (Pending)", "") : null;
      group.member2 = null;
    } else if (group.member2 && String(group.member2).replace(" (Pending)", "") === username) {
      group.member2 = null;
    } else if (group.advisor && String(group.advisor).includes(username)) {
      group.advisor = null;
      group.status = 'ไม่มีอาจารย์ที่ปรึกษา';
    } else {
      return res.status(400).send('คุณไม่ได้อยู่ในกลุ่มนี้');
    }

    if (group.member1 === null) group.status = 'ไม่มีสมาชิก';
    await group.save();

    const updatedUser = await User.findOneAndUpdate(
        { username },
        { $set: { group: [] }, $push: { pastGroups: { groupId: group._id, projectName: group.projectName, leftAt: new Date() } } },
        { new: true }
    );
    
    if (req.session.user) {
        req.session.user.group = [];
    }
    
    res.status(200).send('ออกจากกลุ่มสำเร็จ');
  } catch (err) {
    console.error('❌ Leave Group Error:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการประมวลผลการออกจากกลุ่ม');
  }
    await createLog(req, 'LEAVE_GROUP', { groupName: group ? group.projectName : 'Unknown Group', leaveBy: req.session.user.username });
});

router.post('/group/accept-invitation/:groupId/:notiId', async (req, res) => {
  try {
    const { groupId, notiId } = req.params;
    const username = req.session.user.username;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).send('ไม่พบกลุ่ม');

    let user = await User.findOne({ username: username });

    if (user.role === 'teacher' || user.role === 'admin') {
      group.advisor = username;
      if (!group.allMember.includes(username)) group.allMember.push(username);
      group.status = group.passTimes === 0 ? 'รอนำเสนอหัวข้อ' : 'ผ่านการสอบหัวข้อปริญญานิพนธ์';
    } else {
      group.member2 = username;
      if (!group.allMember.includes(username)) group.allMember.push(username);
    }
    await group.save();

    let noti = await Notification.findById(notiId);
    if (noti) {
        noti.recipient.pull(username);
        if (noti.recipient.length === 0) await Notification.findByIdAndDelete(notiId);
        else await noti.save();
    }

    const updatedUser = await User.findOneAndUpdate({ username }, { $addToSet: { group: group._id }, $set: { currentGroupJoinedAt: new Date() } }, { new: true });
    req.session.user.group = updatedUser.group;
    res.status(200).send('เข้าร่วมกลุ่มสำเร็จ');
  } catch (err) {
    res.status(500).send('Error');
  }
});

router.post('/group/deny-invitation/:groupId/:notiId', async (req, res) => {
  try {
    const { groupId, notiId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).send('ไม่พบกลุ่ม');
    const username = req.session.user.username;

    if (group.member2 && group.member2 === `${username} (Pending)`) group.member2 = null;
    else if (group.advisor && group.advisor === `${username} (Pending)`) group.advisor = null;
    await group.save();

    let noti = await Notification.findById(notiId);
    if (noti) {
        noti.recipient.pull(username);
        if (noti.recipient.length === 0) await Notification.findByIdAndDelete(notiId);
        else await noti.save();
    }
    res.status(200).send('ปฏิเสธเรียบร้อย');
  } catch (err) {
    res.status(500).send('Error');
  }
});

router.get('/groupInfo/:id', requireLogin, async (req, res) => {
    try {
        const id = req.params.id;
        const group = await Group.findById(id).lean();
        if (!group) return res.status(404).send('ไม่พบข้อมูลกลุ่ม');

        const memberUsernames = [group.member1, group.member2, group.advisor].map(u => u ? u.replace(' (Pending)', '') : null).filter(Boolean);
        const users = await User.find({ username: { $in: memberUsernames } }).lean();

        const getUserFullName = (username) => {
            if (!username) return '-';
            const cleanName = username.replace(' (Pending)', '');
            const u = users.find(user => user.username === cleanName);
            let name = u ? `${u.name} ${u.lastname}` : cleanName;
            return username.includes('(Pending)') ? `${name} (Pending)` : name;
        };

        const Paper = require('../models/Paper');
        const PaperFile = require('../models/PaperFile');
        const rawPapers = await Paper.find({ groupId: id }).sort({ submittedAt: -1 }).lean();
        const papers = await Promise.all(rawPapers.map(async (paper) => {
             const submittedFiles = await PaperFile.find({ paperId: paper._id }).lean();
             return { ...paper, submittedFiles };
        }));

        renderWithLayout(res, 'groupInfo', {
            title: 'รายละเอียดกลุ่ม',
            group,
            member1Name: getUserFullName(group.member1),
            member2Name: getUserFullName(group.member2),
            advisorName: getUserFullName(group.advisor),
            papers
        }, req.path, req);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.get('/ownedGroupInfo/:id', requireLogin, async (req, res) => {
    // Logic similar to groupInfo
    try {
        const id = req.params.id;
        const group = await Group.findById(id).lean();
        if (!group) return res.status(404).send('ไม่พบข้อมูลกลุ่ม');
        const memberUsernames = [group.member1, group.member2, group.advisor].map(u => u ? u.replace(' (Pending)', '') : null).filter(Boolean);
        const users = await User.find({ username: { $in: memberUsernames } }).lean();
        const getUserFullName = (username) => {
            if (!username) return '-';
            const cleanName = username.replace(' (Pending)', '');
            const u = users.find(user => user.username === cleanName);
            let name = u ? `${u.name} ${u.lastname}` : cleanName;
            return username.includes('(Pending)') ? `${name} (Pending)` : name;
        };
        const Paper = require('../models/Paper');
        const PaperFile = require('../models/PaperFile');
        const rawPapers = await Paper.find({ groupId: id }).sort({ submittedAt: -1 }).lean();
        const papers = await Promise.all(rawPapers.map(async (paper) => {
             const submittedFiles = await PaperFile.find({ paperId: paper._id }).lean();
             return { ...paper, submittedFiles };
        }));
        renderWithLayout(res, 'ownedGroupInfo', { title: 'รายละเอียดกลุ่ม', group, member1Name: getUserFullName(group.member1), member2Name: getUserFullName(group.member2), advisorName: getUserFullName(group.advisor), papers }, req.path, req);
    } catch (err) { res.status(500).send('Server Error'); }
});

module.exports = router;