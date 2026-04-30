const mongoose = require("mongoose");

const logSchema = new mongoose.Schema({
    username: { type: String, required: true },
    role: { type: String },
    action: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
    timestamp: { type: Date, default: Date.now }
});

// ✅ ใส่ Index ตรงนี้เพื่อให้ Log ลบตัวเองอัตโนมัติเมื่อครบ 90 วัน
logSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.model("Log", logSchema);