const express = require('express');
const router = express.Router();
const Paper = require('../models/Paper');
const PaperFile = require('../models/PaperFile');
const Result = require('../models/Result');
const Group = require('../models/Group');
const { GridFSBucket } = require('mongodb');
const mongoose = require('mongoose');
const multer = require('multer');
const { createLog, renderWithLayout } = require('../utils/helpers');

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
router.get('/paper', requireLogin, (req, res) => {
  renderWithLayout(res, 'paper', { title: 'KMUTNB Project - Paper' }, req.path, req);
});

router.post('/api/PaperUploadFile', requireLogin, upload.single('file'), async (req, res) => {
    try {
        const { paperId, groupId } = req.body;

        const paper = await Paper.findById(paperId);
        if (!paper) return res.status(404).json({ error: 'ไม่พบข้อมูลเอกสาร' });

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: 'ไม่พบข้อมูลกลุ่ม' });

        if (!req.file) return res.status(400).json({ error: 'กรุณาอัปโหลดไฟล์' });

        const allowedMimeTypes = [
            'application/pdf',
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/zip', 'application/x-zip-compressed'
        ];

        if (!allowedMimeTypes.includes(req.file.mimetype)) {
            return res.status(400).json({ error: 'รองรับเฉพาะไฟล์ PDF, Word, Excel, PowerPoint, และ ZIP' });
        }

        const uploadStream = bucket.openUploadStream(req.file.originalname, { contentType: req.file.mimetype });
        uploadStream.end(req.file.buffer);

        await new Promise((resolve, reject) => {
            uploadStream.on('finish', resolve);
            uploadStream.on('error', reject);
        });

        const fileId = uploadStream.id;

        const newPaperFile = new PaperFile({
            paperId,
            groupId,
            file: {
                filename: req.file.originalname,
                contentType: req.file.mimetype,
                length: req.file.size,
                uploadDate: new Date(),
                fileId: fileId
            },
            check: false
        });

        await newPaperFile.save();

        res.json({ success: true, message: 'อัปโหลดไฟล์สำเร็จ' });
    } catch (err) {
        console.error('❌ Paper Upload Error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์' });
    }
    await createLog(req, 'PAPER_UPLOAD', { paperId: req.body.paperId });
});

router.post('/api/paper/upload-raw', requireLogin, upload.single('file'), async (req, res) => {
    try {
        const { groupId } = req.body;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: 'ไม่พบข้อมูลกลุ่ม' });

        if (!req.file) return res.status(400).json({ error: 'กรุณาอัปโหลดไฟล์' });

        const allowedMimeTypes = [
            'application/pdf',
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/zip', 'application/x-zip-compressed'
        ];

        if (!allowedMimeTypes.includes(req.file.mimetype)) {
            return res.status(400).json({ error: 'รองรับเฉพาะไฟล์ PDF, Word, Excel, PowerPoint, และ ZIP' });
        }

        const uploadStream = bucket.openUploadStream(req.file.originalname, { contentType: req.file.mimetype });
        uploadStream.end(req.file.buffer);

        await new Promise((resolve, reject) => {
            uploadStream.on('finish', resolve);
            uploadStream.on('error', reject);
        });

        const fileId = uploadStream.id;

        const newPaper = new Paper({
            eventId: 'default',
            groupId: group._id,
            mention: 'สามารถส่งเอกสารได้ตลอดเวลา',
            passTimes: group.passTimes,
            date: new Date('2099-12-31')
        });
        await newPaper.save();

        const newPaperFile = new PaperFile({
            paperId: newPaper._id,
            groupId,
            file: {
                filename: req.file.originalname,
                contentType: req.file.mimetype,
                length: req.file.size,
                uploadDate: new Date(),
                fileId: fileId
            },
            check: false
        });

        await newPaperFile.save();

        res.json({ success: true, message: 'อัปโหลดไฟล์สำเร็จ' });
    } catch (err) {
        console.error('❌ Paper Raw Upload Error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์' });
    }
    await createLog(req, 'PAPER_RAW_UPLOAD', { groupId: req.body.groupId });
});

router.get('/api/getMyPapers', requireLogin, async (req, res) => {
    try {
        const username = req.session.user.username;
        const groups = await Group.find({
            $or: [
                { member1: username },
                { member2: username },
                { advisor: username }
            ]
        });

        const groupIds = groups.map(g => g._id);
        const papers = await Paper.find({ groupId: { $in: groupIds } }).sort({ submittedAt: -1 });

        res.json({ papers });
    } catch (err) {
        console.error('❌ Error in getMyPapers:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลเอกสาร' });
    }
});

router.get('/api/getPaperFiles/:paperId', requireLogin, async (req, res) => {
    try {
        const { paperId } = req.params;
        const paperFiles = await PaperFile.find({ paperId });

        res.json({ paperFiles });
    } catch (err) {
        console.error('❌ Error in getPaperFiles:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลไฟล์' });
    }
});

router.delete('/api/PaperFile/delete', requireLogin, async (req, res) => {
    try {
        const { fileId } = req.body;

        const oldFiles = await PaperFile.findOne({ 'file.fileId': fileId });
        const paper = await Paper.findById(oldFiles.paperId);

        if (!oldFiles) {
            return res.status(404).json({ error: 'ไม่พบไฟล์เอกสารที่ต้องการลบ' });
        }
        if (oldFiles.file?.fileId) {
            try {
                await bucket.delete(new mongoose.Types.ObjectId(oldFiles.file.fileId));
            } catch (err) {
                console.warn(`⚠️ Warning: ไม่สามารถลบไฟล์ ${oldFiles.file.fileId} ได้:`, err.message);
            }
        }
        await PaperFile.deleteOne({ 'file.fileId': fileId });

        res.json({
            success: true,
            message: 'ลบไฟล์เอกสารเรียบร้อยแล้ว',
            paperId: paper._id
        });
    } catch (err) {
        console.error('❌ Delete Paper File Error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
    }
});

router.post('/api/submitPaperResult', requireLogin, requireRole(['admin', 'teacher']), async (req, res) => {
    try {
        const { paperId, pass, fail } = req.body;

        const paper = await Paper.findById(paperId);
        if (!paper) return res.status(404).json({ error: 'ไม่พบข้อมูลเอกสาร' });

        const group = await Group.findById(paper.groupId);
        if (!group) return res.status(404).json({ error: 'ไม่พบข้อมูลกลุ่ม' });

        const existingResult = await Result.findOne({ groupId: group._id, passTimes: paper.passTimes });

        if (existingResult) {
            existingResult.pass = pass || [];
            existingResult.fail = fail || [];
            await existingResult.save();
        } else {
            const newResult = new Result({
                groupId: group._id,
                passTimes: paper.passTimes,
                pass: pass || [],
                fail: fail || []
            });
            await newResult.save();
        }

        if (fail && fail.length > 0) {
            group.passTimes = (group.passTimes || 0) + 1;
            await group.save();
        }

        res.json({ success: true, message: 'บันทึกผลการสอบสำเร็จ' });
    } catch (err) {
        console.error('❌ Submit Paper Result Error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
    }
    await createLog(req, 'SUBMIT_PAPER_RESULT', { paperId: req.body.paperId });
});

router.get('/api/generate-pdf/:groupId', requireLogin, async (req, res) => {
    try {
        const groupId = req.params.groupId;

        if (!mongoose.Types.ObjectId.isValid(groupId)) {
            return res.status(400).send('❌ รูปแบบ ID ไม่ถูกต้อง');
        }

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send('ไม่พบข้อมูลกลุ่ม');

        const { generateAutoFilledPDF } = require('../utils/pdfUtils');
        const pdfBuffer = await generateAutoFilledPDF(group);
        if (!pdfBuffer) return res.status(500).send('ไม่สามารถสร้าง PDF ได้');

        const encodedFilename = encodeURIComponent(`แบบฟอร์ม_${group.projectName}.pdf`);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename*=UTF-8''${encodedFilename}`
        });

        res.send(Buffer.from(pdfBuffer));

    } catch (err) {
        console.error('❌ Generate PDF Error:', err.message);
        res.status(500).send('เกิดข้อผิดพลาด: ' + err.message);
    }
});

module.exports = router;
