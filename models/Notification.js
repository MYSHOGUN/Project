const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  // เปลี่ยนจาก ObjectId เป็น String เพื่อรับ username ได้โดยตรง
  recipient: { type: String, required: true }, 
  senderUsername: { type: String }, 
    senderName: { type: String },
  type: { type: String, enum: ['new_message', 'added_to_group', 'group_alert'] },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' }, 
  text: String,
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Notification", notificationSchema);