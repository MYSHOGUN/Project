const express = require('express');
const router = express.Router();
const { createLog, escapeHTML, renderWithLayout } = require('../utils/helpers');
const nodemailer = require('nodemailer');

const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

// Routes
router.get('/reportIssue', requireLogin, (req, res) => {
  renderWithLayout(res, 'reportIssue', { title: 'Report Issue' }, req.path, req);
});

router.post('/api/reportIssue', requireLogin, async (req, res) => {
    try {
        const { subject, description } = req.body;
        const username = req.session.user.username;
        const name = req.session.user.name;

        if (!subject || !description) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
                tls: { rejectUnauthorized: false }
            });
            const mailOptions = {
                from: `"KMUTNB System" <${process.env.EMAIL_USER}>`,
                to: process.env.EMAIL_USER,
                subject: `🚨 แจ้งปัญหาการใช้งานระบบ: ${subject}`,
                html: `<h3>มีการแจ้งปัญหาการใช้งานใหม่</h3>
                       <p><strong>ผู้แจ้ง:</strong> ${name} (${username})</p>
                       <p><strong>หัวข้อ:</strong> ${escapeHTML(subject)}</p>
                       <p><strong>รายละเอียด:</strong><br/>${escapeHTML(description).replace(/\n/g, '<br>')}</p>`
            };
            await transporter.sendMail(mailOptions).catch(e => console.warn('Email alert failed:', e.message));
        }

        await createLog(req, 'REPORT_ISSUE', { subject });
        res.json({ success: true, message: 'ส่งการแจ้งปัญหาถึงผู้ดูแลระบบเรียบร้อยแล้ว' });
    } catch (err) {
        console.error('❌ Report Issue Error:', err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการส่งข้อมูล' });
    }
});

router.get('/api/message', (req, res) => {
  res.json({ message: 'Hello from Node.js API!' });
});

router.get('/api/server-time', (req, res) => {
    res.json({ time: new Date().toISOString() });
});

router.get('/api/getUsers', async (req, res) => {
    try {
        const User = require('../models/User');
        const users = await User.find({});
        res.json({ users });
    } catch (err) {
        console.error('❌ Error in getUsers:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

module.exports = router;
