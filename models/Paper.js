// models/Paper.js
const mongoose = require("mongoose");

const paperSchema = new mongoose.Schema({
  eventId: { type: String, required: true }, 
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  mention: { type: String, required: true },
  file: {
    filename: String,
    contentType: String,
    length: Number,
    fileId: mongoose.Schema.Types.ObjectId 
  },
  submittedAt: { type: Date, default: Date.now }, 
  expireAt: {  
    type: Date
  },
  passTimes: { type: Number, default: 0 },
  date: { type: Date, default: null }, 
  director: { type: String, default: null },
  advisor: { type: String, default: null },
  greatDirector: { type: String, default: null },// เปลี่ยนเป็นอาเรย์ว่างเพื่อความปลอดภัย
  commentBy: { type: String, default: null },
  editOptions: [{ type: String }], // เก็บหัวข้อการแก้ไขที่ถูกเลือกเป็น Array
  editCount: { type: Number, default: 0 } // เก็บจำนวนครั้งที่ถูกสั่งแก้ไข
});

module.exports = mongoose.model("Paper", paperSchema);