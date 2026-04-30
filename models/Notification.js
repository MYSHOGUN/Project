const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  recipient: [{ type: String, required: true }], 
  senderUsername: { type: String }, 
    senderName: { type: String },
  type: { type: String, enum: ['new_message', 'added_to_group', 'group_alert','new_alert', 'alert_paper' , 'alert_event'] },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' }, 
  text: String,
  senderPic: {
              filename: String,
              contentType: String,
              id: mongoose.Schema.Types.ObjectId
          },
  createdAt: { type: Date, default: Date.now },
  mention: { type: String, default: null },
  expireAt: { 
        type: Date, 
        default: undefined, 
        index: { expires: '0s' } // ลบข้อมูลทันทีที่ถึงเวลาใน expireAt
  }
});

module.exports = mongoose.model("Notification", notificationSchema);