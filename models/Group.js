const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  projectName: { type: String, required: true },
  member1: { type: String},
  member2: { type: String, default: null },
  advisor: { type: String, default: null },
  status: { type: String, default: "รอนำเสนอหัวข้อ" },
  lastUpdatedTime: { type: Date, default: null },
  passTimes: {type: Number, default: 0 },
  allMember: {type: [String] , required: true}
},{timestamps: true}
);

module.exports = mongoose.model("Group", groupSchema);