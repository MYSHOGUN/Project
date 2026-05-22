const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Group = require('../models/Group');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const multer = require('multer');
const { GridFSBucket, ObjectId } = require('mongodb');
const mongoose = require('mongoose');
const { createLog, escapeHTML, isValidImageSignature, renderWithLayout } = require('../utils/helpers');
const XLSX = require('xlsx');
const nodemailer = require('nodemailer');

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

let bucket;
mongoose.connection.once('open', () => {
    bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
});

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
router.get('/profile', requireLogin, (req, res) => {
  renderWithLayout(res, 'profile', { title: 'Profile' }, req.path, req);
});

router.post('/profile/update', requireLogin, upload.single('profileImage'), async (req, res) => {
    try {
        const { email, phone } = req.body;
        const username = req.session.user.username;

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });

        let updateFields = { email, phone };

        if (req.file) {
            const safeImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!safeImageTypes.includes(req.file.mimetype) || !isValidImageSignature(req.file.buffer)) {
                return res.status(400).json({ success: false, message: 'รองรับเฉพาะไฟล์รูปภาพของจริงเท่านั้น' });
            }

            if (user.picture && user.picture.id) {
                try {
                    await bucket.delete(new mongoose.Types.ObjectId(user.picture.id));
                } catch (err) {
                    console.warn('⚠️ ไม่สามารถลบไฟล์เก่าได้:', err.message);
                }
            }

            const uploadStream = bucket.openUploadStream(req.file.originalname, {
                contentType: req.file.mimetype,
            });

            await new Promise((resolve, reject) => {
                uploadStream.once('finish', resolve);
                uploadStream.once('error', reject);
                uploadStream.end(req.file.buffer);
            });

            updateFields.picture = {
                filename: req.file.originalname,
                contentType: req.file.mimetype,
                id: uploadStream.id
            };

            req.session.user.picture = uploadStream.id.toString();
        }

        await User.findOneAndUpdate({ username }, { $set: updateFields });

        req.session.user.email = email;
        req.session.user.phone = phone;

        req.session.save((err) => {
            if (err) throw err;
            res.status(200).json({ success: true, message: 'อัปเดตโปรไฟล์สำเร็จ' });
        });

    } catch (err) {
        console.error('❌ Profile Update Error:', err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอัปเดต' });
    }
    await createLog(req, 'UPDATE_PROFILE', { username: req.session.user.username });
});

router.get('/viewProfile/:id', requireLogin, async (req, res) => {
  try {
    const id = req.params.id;
    let viewUser;

    if (mongoose.Types.ObjectId.isValid(id)) {
        viewUser = await User.findById(id);
    }
    if (!viewUser) {
        const cleanId = id.replace(' (Pending)', '');
        viewUser = await User.findOne({ username: cleanId });
    }
    if (!viewUser) {
        return res.status(404).send('ไม่พบข้อมูลผู้ใช้งาน');
    }

    let viewUserData = viewUser.toObject ? viewUser.toObject() : viewUser;

    const userGroups = await Group.find({
        $or: [
            { allMember: { $in: [viewUserData.username] } },
            { member1: viewUserData.username },
            { member2: viewUserData.username },
            { member2: `${viewUserData.username} (Pending)` },
            { advisor: viewUserData.username },
            { advisor: `${viewUserData.username} (Pending)` }
        ]
    }).sort({ _id: -1 }).lean();

    let pastGroups = (viewUserData.pastGroups || []).map(pg => ({
        _id: pg.groupId,
        projectName: pg.projectName,
        engName: pg.engName,
        joinedAt: pg.joinedAt,
        leftAt: pg.leftAt
    }));
    let currentGroup = null;

    userGroups.forEach(g => {
        if (g.member1 === viewUserData.username ||
            g.member2 === viewUserData.username ||
            g.member2 === `${viewUserData.username} (Pending)` ||
            g.advisor === viewUserData.username ||
            g.advisor === `${viewUserData.username} (Pending)`
        ) {
            if (g.status === 'ผ่านการสอบป้องกันปริญญานิพนธ์' || g.status.includes('ไม่ผ่าน')) {
                const isDuplicate = pastGroups.some(pg => pg._id && pg._id.toString() === g._id.toString());
                if (!isDuplicate) {
                    pastGroups.push({ _id: g._id, projectName: g.projectName, engName: g.engName, joinedAt: g.createdAt, leftAt: g.updatedAt || new Date() });
                }
            } else {
                if (!currentGroup) currentGroup = g;
            }
        }
    });

    if (viewUserData.role === 'user') {
        if (currentGroup) {
            viewUserData.displayStatus = currentGroup.status;
        } else {
            viewUserData.displayStatus = viewUserData.status || 'ไม่มีกลุ่ม';
        }
    }

    renderWithLayout(res, 'viewProfile', {
        title: 'KMUTNB Project - View Profile',
        viewUser: viewUserData,
        currentGroup: currentGroup,
        pastGroups: pastGroups
    }, req.path, req);

  } catch (err) {
    console.error('Error loading user profile:', err);
    return res.status(500).send('เกิดข้อผิดพลาดในการโหลดโปรไฟล์');
  }
});

router.get('/search-users', requireLogin, async (req, res) => {
  const keyword = req.query.keyword || '';
  const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const users = await User.find({
      $and: [
        { username: { $ne: req.session.user.username } },
        { role: 'user' },
        { lastname: { $ne: 'Registration' } },
        { name: { $ne: 'Pending' } },
        {
          $or: [
                { username: { $regex: safeKeyword, $options: 'i' } },
                { name: { $regex: safeKeyword, $options: 'i' } },
                { lastname: { $regex: safeKeyword, $options: 'i' } }
          ]
        }
      ]
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/search-advisor', requireLogin, async (req, res) => {
  const keyword = req.query.keyword || '';
  const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const users = await User.find({
      $and: [
        { username: { $ne: req.session.user.username } },
        { role: { $nin: ['user'] } },
        {
          $or: [
                { username: { $regex: safeKeyword, $options: 'i' } },
                { name: { $regex: safeKeyword, $options: 'i' } },
                { lastname: { $regex: safeKeyword, $options: 'i' } }
          ]
        }
      ]
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/addUser', requireLogin, requireRole(['admin']), (req, res) => {
  renderWithLayout(res, 'addUser', { title: 'KMUTNB Project - Add User' }, req.path, req);
});

router.get('/addUserExcel', requireLogin, requireRole(['admin']), (req, res) => {
  renderWithLayout(res, 'addUserExcel', { title: 'KMUTNB Project - Add User Excel' }, req.path, req);
});

router.get('/addUserSingle', requireLogin, requireRole(['admin']), (req, res) => {
  renderWithLayout(res, 'addUserSingle', { title: 'KMUTNB Project - Add User Single' }, req.path, req);
});

router.post('/api/addUserSingle', async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'สิทธิ์ไม่เพียงพอ' });
    }

    try {
        const { titleText, name, lastname, username, role } = req.body;

        if (!titleText || !name || !lastname || !username || !role) {
            return res.status(400).json({ success: false, error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        const existingUser = await User.findOne({ username: username.trim() });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'รหัสผู้ใช้นี้มีอยู่ในระบบแล้ว' });
        }

        const PENDING_PASS_STRING = crypto.randomBytes(16).toString('hex');
        const pendingHashedPassword = await bcrypt.hash(PENDING_PASS_STRING, 12);
        const trimmedUsername = String(username).trim();
        const emailGenerated = ('s' + trimmedUsername + '@kmutnb.ac.th').toLowerCase();

        const newUser = new User({
            username: trimmedUsername,
            email: emailGenerated,
            password: pendingHashedPassword,
            title: titleText,
            name: name.trim(),
            lastname: lastname.trim(),
            role: role,
            phone: null,
            group: [],
            picture: ''
        });

        await newUser.save();
        res.json({ success: true, message: 'เพิ่มผู้ใช้เรียบร้อยแล้ว' });

    } catch (err) {
        console.error('❌ Add User Error:', err);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
    }
    await createLog(req, 'ADD_USER_SINGLE', { username: req.session.user.username, addedUser: req.body.username });
});

router.post('/api/excel-upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No Excel file uploaded.' });
    }

    const fileName = req.file.originalname.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
        return res.status(400).json({ error: 'ระบบต้องการไฟล์ Excel เท่านั้น' });
    }

    try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const targetHeaders = ['เลขประจำตัว', 'ชื่อ', 'คำนำหน้าชื่อ', 'ลำดับ', 'นามสกุล', 'ตำแหน่ง'];
        let startRowIndex = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const isHeaderRow = row.some(cell => targetHeaders.includes(String(cell).trim()));
            if (isHeaderRow) {
                startRowIndex = i;
                break;
            }
        }

        const data = XLSX.utils.sheet_to_json(worksheet, { range: startRowIndex });
        
        if (data.length === 0) {
            throw new Error('Excel file is empty or data format is incorrect.');
        }

        const bulkOps = [];
        const saltRounds = 12;
        const PENDING_PASS_STRING = crypto.randomBytes(16).toString('hex');
        const pendingHashedPassword = await bcrypt.hash(PENDING_PASS_STRING, saltRounds);

        for (const row of data) {
            const rawUsername = String(row['เลขประจำตัว']).trim();
            if (!rawUsername) continue;
            const check = await User.findOne({ username: rawUsername });
            if (check) continue;

            const emailExel = `s${rawUsername}@kmutnb.ac.th`.toLowerCase();
            const title = (row['คำนำหน้าชื่อ'] || '').trim();
            const firstName = (row['ชื่อ'] || 'Pending').trim();
            const lastName = (row['นามสกุล'] || 'Registration').trim();
            const role = (row['ตำแหน่ง'] === 'teacher' || row['ตำแหน่ง'] === 'อาจารย์' ? 'teacher' : row['ตำแหน่ง'] === 'secretary' || row['ตำแหน่ง'] === 'เลขานุการ' ? 'secretary' : 'user').trim().toLowerCase();

            const userData = {
                username: rawUsername,
                email: emailExel,
                password: pendingHashedPassword,
                title: title,
                name: firstName,
                lastname: lastName,
                role: role,
                branch: 'EnET',
                picture: '',
                group: [],
                createdAt: new Date()
            };

            bulkOps.push({
                updateOne: {
                    filter: { username: rawUsername },
                    update: { $setOnInsert: userData },
                    upsert: true
                }
            });
        }

        const result = await User.bulkWrite(bulkOps, { ordered: false });
        res.status(200).json({
            success: true,
            message: 'Excel data saved to MongoDB successfully.',
            insertedCount: result.upsertedCount
        });

    } catch (error) {
        console.error('❌ Excel upload error:', error);
        res.status(500).json({
            error: 'Failed to process or save data to MongoDB.',
            details: error.message
        });
    }
});

router.get('/addSecretary', requireLogin, requireRole(['admin']), async (req, res) => {
  try {
      renderWithLayout(res, 'addSecretary', { title: 'KMUTNB Project - Add Secretary' }, req.path, req);
  } catch (err) {
      console.error('Add Secretary Error:', err);
      res.status(500).send('Internal Server Error');
  }
});

router.post('/api/addSecretary', requireLogin, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดำเนินการในส่วนนี้' });
    }

    try {
        const { username, email } = req.body;

        if (!username || !email) {
            return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });
        }

        const checkUser = await User.find({ username: username });
        if (checkUser.length > 0) return res.status(400).json({ error: 'ชื่อผู้ใช้ถูกใช้ไปแล้ว' });
        const pendingHashedPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);

        const newSecretary = new User({
            username: username.trim(),
            email: email,
            password: pendingHashedPassword,
            title: 'รอเพิ่มข้อมูล',
            name: 'รอเพิ่มข้อมูล',
            lastname: 'รอเพิ่มข้อมูล',
            role: 'secretary',
            phone: null,
            group: [],
            picture: ''
        });

        await newSecretary.save();

        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.warn('⚠️ ไม่พบการตั้งค่าอีเมล (EMAIL_USER หรือ EMAIL_PASS)');
        } else {
            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            const resetUrl = `https://${req.get('host')}/register`;
            const mailOptions = {
                from: `"KMUTNB System" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'เพิ่มข้อมูลผู้ใช้',
                html: `<h3>สวัสดี</h3>
                       <p>มีการเพิ่มข้อมูลของคุณเป็นเลขานุการในระบบ กรุณาไปกรอกข้อมูลเพิ่มเติมในลิ้งค์</p>
                       <p>ชื่อผู้ใช้ของคุณคือ ${username}</p>
                       <a href="${resetUrl}">${resetUrl}</a>`
            };

            await transporter.sendMail(mailOptions);
        }

        res.json({
            success: true,
            message: `มอบสิทธิ์เลขานุการให้แก่ผู้ใช้ ${username} เรียบร้อยแล้ว`
        });

    } catch (err) {
        console.error('❌ Admin Grant Secretary Error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
    }
    await createLog(req, 'GRANT_SECRETARY', { from: req.session.user.username, to: req.body.username });
});

module.exports = router;
