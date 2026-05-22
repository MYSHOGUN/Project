const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { createLog, escapeHTML, renderWithLayout } = require('../utils/helpers');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// Middleware
const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

const checkFailModal = (req, res, next) => {
  res.locals.failModal = req.session.failModal || null;
  req.session.failModal = null;
  next();
};

const checkSuccessModal = (req, res, next) => {
  res.locals.successModal = req.session.successModal || null;
  req.session.successModal = null;
  next();
};

// Routes
router.get('/login', checkFailModal, checkSuccessModal, (req, res) => {
  const inputUsername = req.session.inputUsername || '';
  req.session.inputUsername = null;
  renderWithLayout(res, 'login', {
    title: 'KMUTNB Project - Login',
    failModal: res.locals.failModal,
    successModal: res.locals.successModal,
    inputUsername
  }, req.path, req);
});

router.post('/login', async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;
    const user = await User.findOne({ username });

    if (!user) {
      req.session.failModal = 'user';
      return req.session.save(() => res.redirect('/login'));
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      req.session.failModal = 'password';
      req.session.inputUsername = username;
      return req.session.save(() => res.redirect('/login'));
    }

    req.session.regenerate(async (err) => {
      if (err) return res.status(500).send('Session error');

      req.session.user = {
        username: user.username,
        title: user.title,
        name: user.name,
        lastname: user.lastname,
        role: user.role,
        email: user.email,
        phone: user.phone,
        group: Array.isArray(user.group) ? user.group : (user.group ? [user.group] : []),
        picture: user.picture && user.picture.id ? user.picture.id.toString() : null
      };

      if (rememberMe === 'on') {
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        req.session.cookie.maxAge = thirtyDays;
      } else {
        req.session.cookie.expires = false;
      }

      await createLog(req, 'LOGIN', { username: req.session.user.username });
      return res.redirect('/');
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error(err);
      return res.status(500).send('Logout failed');
    }
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

router.get('/register', checkFailModal, (req, res) => {
  renderWithLayout(res, 'register', {
    title: 'KMUTNB Project - Register',
    failModal: res.locals.failModal
  }, req.path, req);
});

router.post('/register', async (req, res) => {
  try {
    const { password, name, lastname, phone, passwordConfirm, email } = req.body;
    let username = (req.body.username || '').toString().trim();

    username = String(username).trim();

    if (username === '' || password === '' || name === '' || lastname === '' || phone === '') {
      req.session.failModal = 'incomplete';
      return req.session.save(() => res.redirect('/register'));
    }

    if (password !== passwordConfirm) {
      req.session.failModal = 'mismatch';
      return req.session.save(() => res.redirect('/register'));
    }

    const existingUser = await User.findOne({ username });

    const hashedPassword = await bcrypt.hash(password, 12);

    if (existingUser && existingUser.email && existingUser.phone === null && existingUser.name === name && existingUser.lastname === lastname && existingUser.role !== 'teacher' && existingUser.role !== 'secretary') {
      await User.findOneAndUpdate(
        { username },
        { password: hashedPassword, name, lastname, phone }
      );
      req.session.successModal = 'success';
      req.session.save(() => res.redirect('/login'));
    } else if (existingUser && existingUser.email && existingUser.phone === null && (existingUser.role === 'secretary' || existingUser.role === 'teacher')) {
      await User.findOneAndUpdate(
        { username },
        { password: hashedPassword, name, lastname, phone, email }
      );
      req.session.successModal = 'success';
      req.session.save(() => res.redirect('/login'));
    } else if (!existingUser) {
      req.session.failModal = 'not_found';
      req.session.save(() => res.redirect('/register'));
    } else {
      req.session.failModal = 'complete';
      req.session.save(() => res.redirect('/register'));
    }

    await createLog(req, 'REGISTER', { username });
  } catch (err) {
    req.session.failModal = 'error';
    return req.session.save(() => res.redirect('/register'));
  }
});

router.get('/forgotPassword', checkFailModal, (req, res) => {
  renderWithLayout(res, 'forgotPassword', {
    title: 'Forgot Password',
    failModal: res.locals.failModal
  }, req.path, req);
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!email) {
      req.session.failModal = 'email_failed';
      return req.session.save(() => res.redirect('/forgotPassword'));
    }
    if (!user) {
      req.session.failModal = 'user_failed';
      return req.session.save(() => res.redirect('/forgotPassword'));
    }

    const token = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();

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

    const resetUrl = `https://${req.get('host')}/reset-password/${token}`;
    const mailOptions = {
      from: `"KMUTNB System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🔒 คำขอรีเซ็ตรหัสผ่าน',
      html: `<h3>สวัสดีคุณ ${user.name}</h3>
             <p>คลิกลิงก์ด้านล่างเพื่อตั้งรหัสผ่านใหม่:</p>
             <a href="${resetUrl}">${resetUrl}</a>
             <p>ลิงก์จะหมดอายุใน 1 ชม.</p>`
    };

    await transporter.sendMail(mailOptions);
    req.session.successModal = 'forget_success';
    req.session.save(() => res.redirect('/login'));

    await createLog(req, 'FORGOT_PASSWORD', { email, username: user ? user.username : null });
  } catch (err) {
    console.error('Forgot Password Error:', err);
    req.session.failModal = 'forget_failed';
    return req.session.save(() => res.redirect('/forgotPassword'));
  }
});

router.get('/reset-password/:token', checkFailModal, async (req, res) => {
  try {
    const user = await User.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      req.session.failModal = 'token_expired';
      return req.session.save(() => res.redirect(`/reset-password/${req.params.token}`));
    }

    renderWithLayout(res, 'resetPassword', {
      title: 'Reset Password',
      failModal: res.locals.failModal,
      token: req.params.token
    }, req.path, req);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server Error');
  }
});

router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password, passwordConfirm } = req.body;

    if (password !== passwordConfirm) {
      req.session.failModal = 'password_mismatch';
      return req.session.save(() => res.redirect(`/reset-password/${req.params.token}`));
    }

    const user = await User.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      req.session.failModal = 'token_expired';
      return req.session.save(() => res.redirect(`/reset-password/${req.params.token}`));
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    req.session.successModal = 'reset_success';
    req.session.save(() => res.redirect('/login'));

    await createLog(req, 'RESET_PASSWORD', { username: user ? user.username : null });
  } catch (err) {
    req.session.failModal = 'reset_failed';
    return req.session.save(() => res.redirect(`/reset-password/${req.params.token}`));
  }
});

router.post('/change-password', requireLogin, async (req, res) => {
  try {
    const { username } = req.body;
    const userData = await User.findOne({ username });
    if (!userData) return res.status(404).json({ error: 'ไม่พบบัญชีผู้ใช้' });
    const email = userData.email;
    if (!email) return res.status(404).json({ error: 'ไม่พบอีเมลผู้ใช้' });

    const token = crypto.randomBytes(20).toString('hex');
    userData.resetPasswordToken = token;
    userData.resetPasswordExpires = Date.now() + 3600000;
    await userData.save();

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

    const resetUrl = `https://${req.get('host')}/changePassword/${token}`;
    const mailOptions = {
      from: `"KMUTNB System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🔒 คำขอรีเซ็ตรหัสผ่าน',
      html: `<h3>สวัสดีคุณ ${userData.name}</h3>
             <p>คลิกลิงก์ด้านล่างเพื่อตั้งรหัสผ่านใหม่:</p>
             <a href="${resetUrl}">${resetUrl}</a>
             <p>ลิงก์จะหมดอายุใน 1 ชม.</p>`
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (err) {
    console.error('Change Password Email Error:', err);
    return res.status(500).send('เกิดข้อผิดพลาด: ' + err.message);
  }
});

router.get('/changePassword/:token', checkFailModal, async (req, res) => {
  try {
    const user = await User.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      req.session.failModal = 'token_expired';
      return req.session.save(() => res.redirect(`/changePassword/${req.params.token}`));
    }

    renderWithLayout(res, 'changePassword', {
      title: 'Change Password',
      failModal: res.locals.failModal,
      token: req.params.token
    }, req.path, req);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server Error');
  }
});

router.post('/changePassword/:token', async (req, res) => {
  try {
    const { password, passwordConfirm } = req.body;

    if (password !== passwordConfirm) {
      req.session.failModal = 'password_mismatch';
      return req.session.save(() => res.redirect(`/changePassword/${req.params.token}`));
    }

    const user = await User.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      req.session.failModal = 'token_expired';
      return req.session.save(() => res.redirect(`/changePassword/${req.params.token}`));
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    req.session.destroy(err => {
      if (err) {
        console.error(err);
        return res.status(500).send('Logout failed');
      }
      res.clearCookie('connect.sid');
    });

    req.session.successModal = 'reset_success';
    req.session.save(() => res.redirect('/login'));

    await createLog(req, 'CHANGE_PASSWORD', { username: user ? user.username : null });
  } catch (err) {
    req.session.failModal = 'reset_failed';
    return req.session.save(() => res.redirect(`/reset-password/${req.params.token}`));
  }
});

module.exports = router;
