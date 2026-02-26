const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  title:  { type: String, required: true },
  name: { type: String, required: true },
  lastname: { type: String, required: true },
  role: { type: String, default: "user" },
  phone: { type: String, default: null },
  email:{ type: String, default: null },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  group: { type: [String], default: [] }, // เปลี่ยนเป็นอาเรย์ว่างเพื่อความปลอดภัย
  picture: {
          filename: String,
          contentType: String,
          id: mongoose.Schema.Types.ObjectId
      }
  ,branch: { type: String, default: "EnET" },
  status: { type: String,default: "ยังไม่จบ"}
});

module.exports = mongoose.model("User", userSchema);
