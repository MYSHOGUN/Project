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
      },
  branch: { type: String, default: "EnET" },
  status: { type: String,default: "ยังไม่ผ่านการสอบหัวข้อปริญญานิพนธ์"},
  currentGroupJoinedAt: { type: Date, default: null }, // เก็บวันที่เข้ากลุ่มปัจจุบัน
  pastGroups: [{
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group" }, // อ้างอิงถึงกลุ่มเก่า
    projectName: { type: String },
    engName: { type: String },
    joinedAt: { type: Date }, // วันที่เข้าร่วม
    leftAt: { type: Date, default: Date.now } // วันที่ออกจากกลุ่ม (ค่าเริ่มต้นคือเวลาปัจจุบัน)
  }]
});

module.exports = mongoose.model("User", userSchema);
