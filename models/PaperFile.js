const mongoose = require("mongoose");

const paperFileSchema = new mongoose.Schema({
  paperId: { type: mongoose.Schema.Types.ObjectId, ref: "Paper" }, // อ้างอิงกล่อง
  groupId: { type: String, required: true },
  file: {
    filename: String,
    fileId: mongoose.Schema.Types.ObjectId // GridFS ID
  },
  passTimes: { type: Number, default: 0 }, 
  submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("PaperFile", paperFileSchema);