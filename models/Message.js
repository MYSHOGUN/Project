// ===== Message model (Message.js) =====
const mongoose = require("mongoose");
const { t } = require("tar");

const messageSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  senderUsername: { type: String, required: true },
  senderName: { type: String, required: true },
  type: { type: String, enum: ["text", "file"], required: true },
  // ถ้าเป็นข้อความ
  text: { type: String },

  // ถ้าเป็นไฟล์
  file: {
    filename: String,
    contentType: String,
    length: Number,  // ขนาดไฟล์
    uploadDate: Date,
    fileId: mongoose.Schema.Types.ObjectId // id ของไฟล์ใน GridFS
  },

  senderPic: {
            filename: String,
            contentType: String,
            id: mongoose.Schema.Types.ObjectId
        },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Message", messageSchema);
