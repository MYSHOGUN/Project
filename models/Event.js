const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    // แก้ไขจุดนี้: ครอบ Object ให้ถูกต้องก่อนใส่ default
    testData: {
        type: [{
            groupName: String,
            directors: [String],
            date: Date
        }],
        default: [] // แนะนำให้เป็น [] เพื่อให้ลูปที่หน้าบ้านไม่พัง แต่ถ้าจะใช้ null ต้องจัดการดีๆ
    }, // กำหนดให้ทั้งก้อนเป็น null ถ้าไม่มีการอัปโหลดไฟล์
    toGroup: { type: String, default: null },
    date: { type: Date, required: true },
    toDate : { type: Date, default: null },
    expireAt: { 
        type: Date, 
        default: undefined, 
        index: { expires: '0s' } 
    }
},{timestamps: true});

module.exports = mongoose.model("Event", eventSchema);