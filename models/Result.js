const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema({
  groupId: { type: String, required: true },
  submittedAt: { type: Date, default: null}, 
  pass: { type: [String], default: [] },
  fail: { type: [String], default: [] },
  passTimes: {type: Number, required: true} // เปลี่ยนเป็นอาเรย์ว่างเพื่อความปลอดภัย
});

module.exports = mongoose.model("Result", resultSchema);