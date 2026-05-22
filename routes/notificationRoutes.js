const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const NotificationRead = require('../models/NotificationRead');

const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

// Routes
router.get('/api/notifications/unread', requireLogin, async (req, res) => {
    try {
        const username = req.session.user.username;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({
            $or: [
                { recipient: username },
                { recipient: 'ALL' }
            ]
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

        const readRecords = await NotificationRead.find({ userId: username })
            .distinct('notificationId');

        const finalNotifications = notifications.map(noti => {
            const hasRead = readRecords.some(rId => rId.toString() === noti._id.toString());
            return {
                ...noti,
                isRead: hasRead
            };
        });

        res.json(finalNotifications);
    } catch (err) {
        console.error('❌ Error loading notifications:', err);
        res.status(500).json({ error: 'Failed to load notifications' });
    }
});

router.post('/api/notifications/mark-read-all', requireLogin, async (req, res) => {
    try {
        const username = req.session.user.username;
        const { type } = req.body;

        let typeFilter;
        if (type === 'alert') {
            typeFilter = { $in: ['group_alert', 'alert_event', 'alert_paper'] };
        } else {
            typeFilter = 'new_message';
        }

        const notifications = await Notification.find({
            $or: [
                { recipient: username },
                { recipient: 'ALL' }
            ],
            type: typeFilter
        }).select('_id expireAt');

        if (notifications.length === 0) return res.json({ success: true });

        const ops = notifications.map(noti => ({
            updateOne: {
                filter: { notificationId: noti._id, userId: username },
                update: { $setOnInsert: { readAt: new Date(), expireAt: noti.expireAt } },
                upsert: true
            }
        }));

        await NotificationRead.bulkWrite(ops);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Mark all read error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/api/notifications/count', requireLogin, async (req, res) => {
    try {
        const username = req.session.user.username;

        const readIds = await NotificationRead.find({ userId: username }).distinct('notificationId');

        const alertUnread = await Notification.countDocuments({
            $or: [
                { recipient: 'ALL' },
                { recipient: username, type: 'added_to_group' },
                { recipient: username, type: 'group_alert' },
                { recipient: username, type: 'new_alert' },
                { recipient: username, type: 'alert_event' },
                { recipient: username, type: 'alert_paper' }
            ],
            _id: { $nin: readIds }
        });

        const messageUnread = await Notification.countDocuments({
            recipient: username,
            type: 'new_message',
            _id: { $nin: readIds }
        });

        res.json({ alertUnread, messageUnread });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
