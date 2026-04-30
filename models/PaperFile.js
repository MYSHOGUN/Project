const mongoose = require("mongoose");
const { c } = require("tar");

const paperFileSchema = new mongoose.Schema({
  paperId: { type: mongoose.Schema.Types.ObjectId, ref: "Paper" }, // อ้างอิงกล่อง
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  file: {
    filename: String,
    fileId: mongoose.Schema.Types.ObjectId, // GridFS ID
    contentType: String,
  },
  passTimes: { type: Number, default: 0 },
  check: { type: Boolean, default: false}, 
  submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("PaperFile", paperFileSchema);