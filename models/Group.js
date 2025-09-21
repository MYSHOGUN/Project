const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  projectName: { type: String, required: true },
  member1: { type: String, required: true },
  member2: { type: String, default: "ยังไม่ระบุ" },
  advisor: { type: String, default: "ยังไม่ระบุ" },
},{timestamps: true}
);

module.exports = mongoose.model("Group", groupSchema);