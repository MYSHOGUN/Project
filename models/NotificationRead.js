const mongoose = require("mongoose");

const notificationReadSchema = new mongoose.Schema({
  notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true },
  userId: { type: String, required: true }, // username ของคนที่กดอ่านแล้ว
  readAt: { type: Date, default: Date.now }
});

// ทำ Index เพื่อให้ค้นหาได้เร็วว่า User นี้อ่านอันนี้หรือยัง
notificationReadSchema.index({ notificationId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("NotificationRead", notificationReadSchema);