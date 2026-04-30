const winston = require('winston');
const path = require('path');
const fs = require('fs');
require('winston-daily-rotate-file');

// ✅ 1. กำหนดตำแหน่งโฟลเดอร์ logs 
// ใช้ .. เพื่อถอยออกจากโฟลเดอร์ models ไปที่ root ของโปรเจกต์
const logDir = path.join(__dirname, '..', 'logs');

// ตรวจสอบและสร้างโฟลเดอร์ logs ถ้ายังไม่มี
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// ✅ 2. รูปแบบการแสดงผล (Format)
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(info => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`)
);

// ✅ 3. ตั้งค่า Logger
const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
        // บันทึก Log แยกตามวันที่
        new winston.transports.DailyRotateFile({
            filename: path.join(logDir, 'application-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        }),
        // แยกไฟล์ Error ไว้ต่างหากเพื่อให้ Admin ไล่บั๊กง่ายๆ
        new winston.transports.File({ 
            filename: path.join(logDir, 'error.log'), 
            level: 'error' 
        })
    ]
});

// ✅ 4. แสดงผลที่ Console (Terminal) ระหว่างพัฒนา
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

module.exports = logger;