const Log = require('../models/Log');
const logger = require('../models/logger');
const crypto = require('crypto');
const path = require('path');
const ejs = require('ejs');

async function createLog(req, action, details = {}) {
    const username = req.session?.user?.username || "Guest";
    const logMsg = `${action} by ${username} - Details: ${JSON.stringify(details)}`;

    try {
        if (action.includes('ERROR')) {
            logger.error(logMsg);
        } else {
            logger.info(logMsg);
        }

        const newLog = new Log({
            username: req.session.user ? req.session.user.username : "System/Guest",
            role: req.session.user ? req.session.user.role : "N/A",
            action: action,
            details: details,
            ip: req.headers['x-forwarded-for']?.split(',')[0] || 
                req.ip || 
                req.connection.remoteAddress
        });
        await newLog.save();
    } catch (err) {
        logger.error(`Failed to save log to DB: ${err.message}`);
    }
}

function truncateText(text, maxWords) {
    if (!text) return '';
    const words = text.split(/\s+/);
    if (words.length > maxWords) {
        return words.slice(0, maxWords).join(' ') + '...';
    }
    return text;
}

const escapeHTML = (str) => {
    if (!str) return "";
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
};

const isValidDocumentSignature = (buffer, mimetype) => {
    if (!buffer || buffer.length < 8) return false;
    const hex = buffer.toString('hex', 0, 8).toUpperCase();
    if (mimetype === 'application/pdf') return hex.startsWith('25504446');
    if (mimetype.includes('openxmlformats')) return hex.startsWith('504B0304');
    if (mimetype === 'application/vnd.ms-powerpoint' || mimetype === 'application/msword') return hex.startsWith('D0CF11E0A1B11AE1');
    return false;
};

const isValidImageSignature = (buffer) => {
    if (!buffer || buffer.length < 4) return false;
    const hex = buffer.toString('hex', 0, 4).toUpperCase();
    return hex.startsWith('FFD8FF') || hex === '89504E47' || hex === '47494638' || hex === '52494646';
};

function renderWithLayout(res, view, data = {}, reqPath = "", req) {
  const extendedData = { ...data, currentPath: reqPath };

  if (req && req.session && req.session.user) {
    extendedData.user = req.session.user;
  }

  ejs.renderFile(
    path.join(__dirname, '..', 'app1', 'public', `${view}.ejs`),
    extendedData,
    (err, str) => {
      if (err) {
        return res.status(500).send(err.message); 
      }
      
      if (view === "login" || view === "register" || view === "forgotPassword" || view === "resetPassword" || view === "changePassword") {
        return res.render(view, extendedData); 
      } else {
        return res.render("layout", { ...extendedData, body: str }); 
      }
    }
  );
}

module.exports = {
    createLog,
    truncateText,
    escapeHTML,
    isValidDocumentSignature,
    isValidImageSignature,
    renderWithLayout
};
