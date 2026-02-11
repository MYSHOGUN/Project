// models/Paper.js
const mongoose = require("mongoose");

const paperSchema = new mongoose.Schema({
  eventId: { type: String, required: true }, 
  groupId: { type: String, default: null },
  mention: { type: String, required: true },
  file: {
    filename: String,
    contentType: String,
    length: Number,
    fileId: mongoose.Schema.Types.ObjectId 
  },
  submittedAt: { type: Date, default: Date.now }, 
  expireAt: { 
    type: Date, 
    index: { expires: 0 } // จะลบข้อมูลอัตโนมัติเมื่อถึงเวลา
  },
  passTimes: { type: Number, default: 0 },
  date: { type: Date, default: null }, 
  director: { type: [String], default: [] } // เปลี่ยนเป็นอาเรย์ว่างเพื่อความปลอดภัย
});

module.exports = mongoose.model("Paper", paperSchema);