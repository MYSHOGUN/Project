const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  member1: { type: String, required: true },
  member2: { type: String, default: null },
  advisor: { type: String,}
});

module.exports = mongoose.model("Group", groupSchema);