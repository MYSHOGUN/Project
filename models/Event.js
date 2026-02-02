const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    date: { type: Date, required: true },
    toDate : { type: Date, default: null },
    expireAt: { 
        type: Date, 
        default: undefined, 
        index: { expires: '0s' } // ลบข้อมูลทันทีที่ถึงเวลาใน expireAt
    }
},{timestamps: true}
);
module.exports = mongoose.model("Event", eventSchema);