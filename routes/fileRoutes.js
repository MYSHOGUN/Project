const express = require('express');
const router = express.Router();
const multer = require('multer');
const { GridFSBucket, ObjectId } = require('mongodb');
const mongoose = require('mongoose');
const { isValidDocumentSignature, isValidImageSignature, renderWithLayout } = require('../utils/helpers');
const Group = require('../models/Group');
const Message = require('../models/Message');
const Notification = require('../models/Notification');

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

let bucket;

function getBucket() {
    if (!bucket && mongoose.connection.readyState === 1) {
        bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
    }
    return bucket;
}

mongoose.connection.once('open', () => {
    bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
});

const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

// Routes
router.get('/upload', requireLogin, (req, res) => {
  renderWithLayout(res, 'upload', { title: 'KMUTNB Project - Upload' }, req.path, req);
});

router.get('/file', requireLogin, (req, res) => {
  renderWithLayout(res, 'file', { title: 'KMUTNB Project - File' }, req.path, req);
});

router.get('/file/download/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        const bucket = getBucket();
        if (!bucket) {
            return res.status(500).send('Database not connected');
        }

        const fileFromFS = await bucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray().then(files => files[0]);

        if (!fileFromFS) {
            return res.status(404).send(`ไม่พบไฟล์ ID: ${fileId} ในระบบ`);
        }

        const encodedName = encodeURIComponent(fileFromFS.filename);
        res.set({
            'Content-Type': fileFromFS.contentType || 'application/octet-stream',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`
        });

        bucket.openDownloadStream(fileFromFS._id).pipe(res);

    } catch (err) {
        console.error('❌ Error:', err);
        return res.status(500).send('ID ไฟล์ไม่ถูกต้อง');
    }
});

router.get('/image/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).send('Invalid file ID');
        }

        const bucket = getBucket();
        if (!bucket) {
            return res.status(500).send('Database not connected');
        }

        const fileId = new mongoose.Types.ObjectId(id);
        const files = await bucket.find({ _id: fileId }).toArray();
        if (!files || files.length === 0) {
            return res.status(404).send('Image not found');
        }

        res.set('Content-Type', files[0].contentType);
        bucket.openDownloadStream(fileId).pipe(res);
    } catch (err) {
        console.error('Error streaming news image:', err);
        return res.status(500).send('Error streaming image');
    }
});

router.post('/upload-file/:groupId', requireLogin, upload.array('files'), async (req, res) => {
    let group;
  try {
    const messages = [];

    const groupId = req.params.groupId;
    group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'ไม่พบข้อมูลกลุ่ม' });

    let hasMovement = false;

    let mem1 = null;
    let mem2 = null;
    let adv = null;

    const expireTime = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);

    if (group.member1 && !group.member1.includes('(Pending)')) {
      const cleanMem1 = group.member1.replace(' (Pending)', '');
      mem1 = cleanMem1;
    }
    if (group.member2 && !group.member2.includes('(Pending)')) {
      const cleanMem2 = group.member2.replace(' (Pending)', '');
      mem2 = cleanMem2;
    }
    if (group.advisor && !group.advisor.includes('(Pending)')) {
      const cleanAdv = group.advisor.replace(' (Pending)', '');
      adv = cleanAdv;
    }

    if (req.body.text && req.body.text.trim() !== '') {
      const textMessage = new Message({
        groupId: req.params.groupId,
        senderUsername: req.session.user.username,
        senderName: req.session.user.name,
        type: 'text',
        text: req.body.text.trim(),
        senderPic: req.session.user.picture,
        timestamp: new Date(),
        groupMember: [mem1, mem2, adv]
      });
      await textMessage.save();
      messages.push(textMessage);

      // Socket.io emit would go here
      // io.to(req.params.groupId).emit("group message", textMessage);

      hasMovement = true;
    }

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const allowedMimeTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed',
            'text/plain'
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
            return res.status(400).json({ error: `ไม่อนุญาตให้อัปโหลดไฟล์ ${file.originalname} (รองรับแค่รูปภาพ, เอกสาร Office, PDF, ZIP, RAR, TXT)` });
        }

        if (file.mimetype.startsWith('image/') && !isValidImageSignature(file.buffer)) {
            return res.status(400).json({ error: `ไฟล์รูปภาพ ${file.originalname} เสียหายหรือถูกปลอมแปลง` });
        }

        const docTypes = ['application/pdf', 'application/msword', 'application/vnd.ms-powerpoint', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
        if (docTypes.includes(file.mimetype) && !isValidDocumentSignature(file.buffer, file.mimetype)) {
            return res.status(400).json({ error: `ไฟล์เอกสาร ${file.originalname} เสียหายหรือถูกปลอมแปลง` });
        }
      }

      for (const file of req.files) {
        const bucket = getBucket();
        if (!bucket) {
            return res.status(500).json({ error: 'Database not connected' });
        }
        const uploadStream = bucket.openUploadStream(file.originalname, { contentType: file.mimetype });

        uploadStream.end(file.buffer);

        await new Promise((resolve, reject) => {
          uploadStream.on('finish', resolve);
          uploadStream.on('error', reject);
        });

        const fileId = uploadStream.id;

        const fileMessage = new Message({
          groupId: req.params.groupId,
          senderUsername: req.session.user.username,
          senderName: req.session.user.name,
          type: 'file',
          file: {
            filename: file.originalname,
            contentType: file.mimetype,
            length: file.size,
            uploadDate: new Date(),
            fileId: fileId
          },
          senderPic: req.session.user.picture || null,
          timestamp: new Date(),
          groupMember: [mem1, mem2, adv]
        });

        await fileMessage.save();
        messages.push(fileMessage);

        // Socket.io emit would go here
        // io.to(req.params.groupId).emit("group message", fileMessage);

        hasMovement = true;
      }
    }

    if (hasMovement) {
      await Group.findByIdAndUpdate(groupId, { lastUpdatedTime: new Date() });
    }

    res.json(messages);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Upload error' });
    }
});

module.exports = router;
