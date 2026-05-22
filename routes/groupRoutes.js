const express = require('express');
const router = express.Router();
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
                    group.member2 ? User.findOne({ username: group.member2 }) : null,
                    group.advisor ? User.findOne({ username: group.advisor }) : null
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

    const status = 'ไม่มีอาจารย์ที่ปรึกษา';

    let existingGroup;

    if (!projectName || !engName || !member1) {
      return res.status(400).send('ข้อมูลไม่ครบ');
    }

    if (member2 != null && member2 !== '' && member2 !== 'undefined') {
      existingGroup = await Group.findOne({
      $or: [
        { member1: member1 },
        { member2: member2 }
      ]
    });
  } else {
      existingGroup = await Group.findOne({
      $or: [
        { member1: member1 }
      ]
    });
  }

    if (existingGroup) {
      return res.status(400).send('สมาชิกนี้มีกลุ่มอยู่แล้ว');
    }

    const mem1 = await User.findOne({ username: member1 });

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

    const expireTime = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);

    // sendGroupNotification function needs to be passed or imported
    // For now, we'll skip notification in this route file

    await User.findOneAndUpdate(
      { username: member1 },
      { $set: { group: [newGroup._id], currentGroupJoinedAt: new Date() } }
    );

    req.session.user.group = [newGroup._id];

    res.status(201).send('บันทึกกลุ่มสำเร็จ');
  } catch (err) {
    console.error('❌ Error saving group:', err);
    return res.status(500).send('เกิดข้อผิดพลาดในการบันทึกกลุ่ม');
  }
  await createLog(req, 'CREATE_GROUP', { groupName: projectName, createBy: member1 });
});

router.post('/group/accept-invitation/:groupId/:notiId', async (req, res) => {
  try {
    const { groupId, notiId } = req.params;
    const username = req.session.user.username;
    const userRole = req.session.user.role;
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).send('ไม่พบกลุ่ม');
    }

    let user = await User.findOne({ username: username });

    if (user.role === 'teacher' || user.role === 'admin') {
      if (group.advisor && group.advisor !== `${username} (Pending)`) {
        return res.status(400).send('กลุ่มนี้มีอาจารย์ที่ปรึกษาแล้ว');
      }
      group.advisor = username;
      if (!group.allMember.includes(username)) {
          group.allMember.push(username);
      }
      group.status = group.passTimes === 0 ? 'รอนำเสนอหัวข้อ' : 'ผ่านการสอบหัวข้อปริญญานิพนธ์';
    } else {
      if (group.member2 && group.member2 !== `${username} (Pending)`) {
        return res.status(400).send('กลุ่มนี้มีสมาชิกครบแล้ว');
      }
      group.member2 = username;
      if (!group.allMember.includes(username)) {
          group.allMember.push(username);
      }
    }
    await group.save();

    let noti = await Notification.findById(notiId);
    if (noti) {
        noti.recipient.pull(username);
        if (noti.recipient.length === 0) {
            await Notification.findByIdAndDelete(notiId);
        } else {
            await noti.save();
        }
    }

    let updatedUser;
    if (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin') {
        updatedUser = await User.findOneAndUpdate(
            { username: username },
            { $set: { group: [group._id], currentGroupJoinedAt: new Date() } },
            { new: true }
        );
    } else {
        updatedUser = await User.findOneAndUpdate(
            { username: username },
            { $addToSet: { group: group._id }, $set: { currentGroupJoinedAt: new Date() } },
            { new: true }
        );
    }

    req.session.user.group = updatedUser.group;

    req.session.save((err) => {
      if (err) {
        console.error('❌ Session Save Error:', err);
        return res.status(500).send('เกิดข้อผิดพลาดในการบันทึกข้อมูลเซสชัน');
      }
      res.status(200).send('เข้าร่วมกลุ่มสำเร็จ');
    });

  } catch (err) {
    console.error('❌ Error accepting invitation:', err);
    return res.status(500).send('เกิดข้อผิดพลาดในการเข้าร่วมกลุ่ม');
  }
  await createLog(req, 'ACCEPT_INVITATION', { username: req.session.user.username, type: 'accept' });
});

router.post('/group/deny-invitation/:groupId/:notiId', async (req, res) => {
  try {
    const { groupId, notiId } = req.params;
    const group = await Group.findById(groupId);

    if (!group) return res.status(404).send('ไม่พบกลุ่ม');

    const username = req.session.user.username;

    if (group.member2 && group.member2 === `${username} (Pending)`) {
        group.member2 = null;
    } else if (group.advisor && group.advisor === `${username} (Pending)`) {
        group.advisor = null;
    }
    await group.save();

    let noti = await Notification.findById(notiId);
    if (noti) {
        noti.recipient.pull(username);
        if (noti.recipient.length === 0) {
            await Notification.findByIdAndDelete(notiId);
        } else {
            await noti.save();
        }
    }

    req.session.save(() => {
        res.status(200).send('ปฏิเสธเรียบร้อย');
    });
  } catch (err) {
    console.error('❌ Error denying invitation:', err);
    return res.status(500).send('เกิดข้อผิดพลาดในการปฏิเสธ');
  }
  await createLog(req, 'DENY_INVITATION', { username: req.session.user.username, type: 'deny' });
});

router.post('/groups-update/:groupId', async (req, res) => {
    let group;
  try {
    const { member2, advisor, name, engName } = req.body;
    const { groupId } = req.params;

    group = await Group.findById(groupId);
    if (!group) return res.status(404).send('ไม่พบข้อมูลกลุ่ม');

    const inviter = await User.findOne({ username: req.session.user.username });

    const mem2 = group.member2;
    const adv = group.advisor;

    const member2Info = member2 ? await User.findOne({ username: member2 }) : null;

    let addedMember2 = null;
    let addedAdvisor = null;

    if (!mem2 && member2) {
        group.member2 = `${member2} (Pending)`;
        addedMember2 = member2;
    } else if (mem2 && mem2.includes('Pending') && member2) {
        return res.status(404).send('มีคำเชิญสมาชิกคนที่ 2 อยู่แล้ว');
    } else if (member2Info && Array.isArray(member2Info.group) && member2Info.group.length > 0 && member2 && member2Info.group[0] && groupId !== member2Info.group[0].toString()) {
        return res.status(404).send('ผู้ใช้คนนี้มีกลุ่มอยู่แล้ว');
    }

    if (!adv && advisor) {
        group.advisor = `${advisor} (Pending)`;
        addedAdvisor = advisor;
    } else if (adv && adv.includes('Pending') && advisor) {
        return res.status(404).send('มีคำเชิญอาจารย์ที่ปรึกษาอยู่แล้ว');
    }

    group.projectName = name;
    group.engName = engName;

    await group.save();

    res.status(201).send('ส่งคำเชิญกลุ่มสำเร็จ');
  } catch (err) {
    console.error('❌ Error:', err);
    return res.status(500).send('เกิดข้อผิดพลาด: ' + err.message);
  }
    await createLog(req, 'UPDATE_GROUP', { groupName: group ? group.projectName : 'Unknown Group', updateBy: req.session.user.username });
});

router.post('/groups/leave/:groupId', async (req, res) => {
    let group;
  try {
    const groupId = req.params.groupId;

    if (!groupId || groupId === 'null' || groupId === 'undefined') {
      return res.status(400).send('Group ID ไม่ถูกต้อง');
    }

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).send('Group ID ไม่ถูกต้อง');
    }

    const username = req.session.user.username;

    group = await Group.findById(groupId);
    if (!group) return res.status(404).send('ไม่พบกลุ่ม');

    // ✅ ตรวจสอบสถานะว่าต้องขออนุมัติหรือไม่
    if (req.session.user.role === 'user' && group.status !== 'รอนำเสนอหัวข้อ' && group.status !== 'ไม่มีอาจารย์ที่ปรึกษา' && group.advisor) {
      const advisorClean = group.advisor.replace(" (Pending)", "");
      
      const existingNoti = await Notification.findOne({
          type: 'leave_group_request',
          group: groupId,
          senderUsername: username
      });
      
      if (existingNoti) {
          return res.status(400).send('คุณได้ส่งคำขอออกกลุ่มไปแล้ว กรุณารออาจารย์ที่ปรึกษาอนุมัติ');
      }

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

    if (group.member1 === username) {
      group.member1 = group.member2;
      group.member2 = null;
    } else if (group.member2 === username) {
      group.member2 = null;
    } else if (group.advisor === username) {
      group.advisor = null;
      group.status = 'ไม่มีอาจารย์ที่ปรึกษา';
    } else {
      return res.status(400).send('คุณไม่ได้อยู่ในกลุ่มนี้');
    }

    if (group.member1 === null && !group.status.includes('ไม่ผ่าน')) {
      group.status = 'ไม่มีสมาชิก';
    }

    await group.save();

    const currentUser = await User.findOne({ username });
    const joinedAt = currentUser.currentGroupJoinedAt || group.createdAt;

    const pastGroupData = {
        groupId: group._id,
        projectName: group.projectName,
        engName: group.engName,
        joinedAt: joinedAt,
        leftAt: new Date()
    };

    let updatedUser;
    if (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin') {
        updatedUser = await User.findOneAndUpdate(
        { username },
        {
            $set: { group: [], currentGroupJoinedAt: null },
            $push: { pastGroups: pastGroupData }
        },
        { new: true }
        );
    } else {
        updatedUser = await User.findOneAndUpdate(
        { username },
        {
            $pull: { group: groupId },
            $push: { pastGroups: pastGroupData }
        },
        { new: true }
        );
    }

    req.session.user.group = updatedUser.group;
    req.session.save((err) => {
        if (err) {
            console.error('❌ Session Save Error:', err);
            return res.status(500).send('เกิดข้อผิดพลาดในการบันทึกข้อมูลเซสชัน');
        }
        res.send('ออกจากกลุ่มสำเร็จ');
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('เกิดข้อผิดพลาดที่ server');
  }
    await createLog(req, 'LEAVE_GROUP', { groupName: group ? group.projectName : 'Unknown Group', leaveBy: req.session.user.username });
});

router.post('/group/accept-leave/:groupId/:notiId/:targetUser', requireLogin, async (req, res) => {
  try {
    const { groupId, notiId, targetUser } = req.params;
    const group = await Group.findById(groupId);
    if (group) {
        if (group.member1 === targetUser) {
          group.member1 = group.member2;
          group.member2 = null;
        } else if (group.member2 === targetUser) {
          group.member2 = null;
        }
        if (group.member1 === null && !group.status.includes('ไม่ผ่าน')) group.status = 'ไม่มีสมาชิก';
        group.allMember = (group.allMember || []).filter(m => m !== targetUser);
        await group.save();
        const currentUser = await User.findOne({ username: targetUser });
        if (currentUser) {
            const joinedAt = currentUser.currentGroupJoinedAt || group.createdAt;
            await User.findOneAndUpdate(
                { username: targetUser },
                { $set: { group: [], currentGroupJoinedAt: null }, $push: { pastGroups: { groupId: group._id, projectName: group.projectName, engName: group.engName, joinedAt: joinedAt, leftAt: new Date() } } }
            );
        }
    }
    await Notification.findByIdAndDelete(notiId);
    res.status(200).send('อนุมัติการออกจากกลุ่มสำเร็จ');
  } catch (err) {
    return res.status(500).send('เกิดข้อผิดพลาดในการอนุมัติ');
  }
});

router.post('/group/deny-leave/:groupId/:notiId/:targetUser', requireLogin, async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.notiId);
    res.status(200).send('ปฏิเสธการออกจากกลุ่มเรียบร้อย');
  } catch (err) {
    return res.status(500).send('เกิดข้อผิดพลาดในการปฏิเสธ');
  }
});

router.get('/group/messages/group/:groupId', requireLogin, async (req, res) => {
  try {
    const messages = await Message.find({ groupId: req.params.groupId })
      .sort({ timestamp: 1 })
      .lean();

    const formatted = messages.map(m => {
      if (m.file && m.file.fileId) {
        m.file.fileId = m.file.fileId.toString();
      }
      return m;
    });

    res.json({ messages: formatted });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load group messages' });
  }
});

router.get('/groupInfo/:id', requireLogin, async (req, res) => {
    try {
        const id = req.params.id;

        const group = await Group.findById(id).lean();
        if (!group) return res.status(404).send('ไม่พบข้อมูลกลุ่ม');

        let member2username, advisorUsername;

        if (String(group.member2).includes('Pending')) {
          member2username = null;
        } else {
          member2username = group.member2;
        }

        if (String(group.advisor).includes('Pending')) {
          advisorUsername = null;
        } else {
          advisorUsername = group.advisor;
        }

        const memberUsernames = [group.member1, member2username, advisorUsername].filter(Boolean);
        const users = await User.find({ username: { $in: memberUsernames } }).lean();

        const getUserFullName = (username) => {
            const u = users.find(user => user.username === username);
            return u ? `${u.name} ${u.lastname}` : username || 'ไม่มีข้อมูล';
        };

        const getUserId = (username) => {
            const u = users.find(user => user.username === username);
            return u ? u._id : null;
        };

        const Paper = require('../models/Paper');
        const PaperFile = require('../models/PaperFile');
        const Result = require('../models/Result');

        const allPapers = await Paper.find({ groupId: id }).sort({ submittedAt: -1 }).lean();
        const allFiles = await PaperFile.find({ groupId: id }).lean();
        const allResults = await Result.find({ groupId: id }).lean();

        let resultUsernames = [];
        allResults.forEach(r => {
            if (r.pass) resultUsernames = resultUsernames.concat(r.pass);
            if (r.fail) resultUsernames = resultUsernames.concat(r.fail);
        });
        const resultUsers = await User.find({ username: { $in: resultUsernames } }).lean();

        const getResultUserFullName = (username) => {
            const u = resultUsers.find(user => user.username === username);
            return u ? `${u.title && u.title !== 'รอเพิ่มข้อมูล' ? u.title + ' ' : ''}${u.name} ${u.lastname}`.trim() : username;
        };

        const papersWithFiles = allPapers.map(paper => {
            const rawResult = allResults.find(r => r.passTimes === paper.passTimes);
            let formattedResult = rawResult ? { pass: (rawResult.pass || []).map(getResultUserFullName), fail: (rawResult.fail || []).map(getResultUserFullName) } : null;
            return {
                ...paper,
                submittedFiles: allFiles.filter(f => f.paperId.toString() === paper._id.toString()),
                result: formattedResult
            };
        });

        renderWithLayout(res, 'groupInfo', {
            title: 'รายละเอียดกลุ่ม',
            group,
            member1Name: getUserFullName(group.member1),
            member2Name: getUserFullName(group.member2),
            advisorName: getUserFullName(group.advisor),
            member1Id: getUserId(group.member1),
            member2Id: getUserId(member2username),
            papers: papersWithFiles
        }, req.path, req);

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/ownedGroupInfo/:id', async (req, res) => {
    try {
        const id = req.params.id;

        const group = await Group.findById(id).lean();
        if (!group) return res.status(404).send('ไม่พบข้อมูลกลุ่ม');

        let member2username, advisorUsername;

        if (String(group.member2).includes('Pending')) {
          member2username = null;
        } else {
          member2username = group.member2;
        }

        if (String(group.advisor).includes('Pending')) {
          advisorUsername = null;
        } else {
          advisorUsername = group.advisor;
        }

        const memberUsernames = [group.member1, member2username, advisorUsername].filter(Boolean);
        const users = await User.find({ username: { $in: memberUsernames } }).lean();

        const getUserFullName = (username) => {
            const u = users.find(user => user.username === username);
            return u ? `${u.name} ${u.lastname}` : username || 'ไม่มีข้อมูล';
        };

        const getUserId = (username) => {
            const u = users.find(user => user.username === username);
            return u ? u._id : null;
        };

        const Paper = require('../models/Paper');
        const PaperFile = require('../models/PaperFile');
        const Result = require('../models/Result');

        const allPapers = await Paper.find({ groupId: id }).sort({ submittedAt: -1 }).lean();
        const allFiles = await PaperFile.find({ groupId: id }).lean();
        const allResults = await Result.find({ groupId: id }).lean();

        let resultUsernames = [];
        allResults.forEach(r => {
            if (r.pass) resultUsernames = resultUsernames.concat(r.pass);
            if (r.fail) resultUsernames = resultUsernames.concat(r.fail);
        });
        const resultUsers = await User.find({ username: { $in: resultUsernames } }).lean();

        const getResultUserFullName = (username) => {
            const u = resultUsers.find(user => user.username === username);
            return u ? `${u.title && u.title !== 'รอเพิ่มข้อมูล' ? u.title + ' ' : ''}${u.name} ${u.lastname}`.trim() : username;
        };

        const papersWithFiles = allPapers.map(paper => {
            const rawResult = allResults.find(r => r.passTimes === paper.passTimes);
            let formattedResult = rawResult ? { pass: (rawResult.pass || []).map(getResultUserFullName), fail: (rawResult.fail || []).map(getResultUserFullName) } : null;
            return {
                ...paper,
                submittedFiles: allFiles.filter(f => f.paperId.toString() === paper._id.toString()),
                result: formattedResult
            };
        });

        renderWithLayout(res, 'ownedGroupInfo', {
            title: 'รายละเอียดกลุ่ม',
            group,
            member1Name: getUserFullName(group.member1),
            member2Name: getUserFullName(group.member2),
            advisorName: getUserFullName(group.advisor),
            member1Id: getUserId(group.member1),
            member2Id: getUserId(member2username),
            papers: papersWithFiles
        }, req.path, req);

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/search-group', requireLogin, async (req, res) => {
  const keyword = req.query.keyword || '';
  const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const groups = await Group.find({
      $and: [
        { status: { $nin: ['ผ่านการสอบป้องกันปริญญานิพนธ์', 'ไม่มีสมาชิก', 'ไม่ผ่านการสอบป้องกันปริญญานิพนธ์'] } },
        {
          $or: [
                { projectName: { $regex: safeKeyword, $options: 'i' } },
                { engName: { $regex: safeKeyword, $options: 'i' } }
          ]
        }
      ]
    }).limit(10);
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
