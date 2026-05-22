require('dotenv').config(); // ✅ โหลดตัวแปรจากไฟล์ .env
const Message = require("./models/Message"); // ✅ import model

const Group = require("./models/Group"); // ✅ import group model

const Event = require('./models/Event'); // ✅ import event model

const Paper = require('./models/Paper'); // ✅ import event model

const PaperFile = require('./models/PaperFile'); // ✅ import event model

const Result = require('./models/Result'); // ✅ import event model

const Notification = require("./models/Notification");

const NotificationRead = require("./models/NotificationRead");

const helmet = require('helmet');

const rateLimit = require('express-rate-limit');

const mongoSanitize = require('express-mongo-sanitize');

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 นาที
    max: 100, // จำกัด 100 request ต่อ IP ในช่วงเวลาที่กำหนด
    message: "ขออภัย คุณส่งคำขอมากเกินไป กรุณาลองใหม่ในอีก 15 นาที",
    standardHeaders: true,
    legacyHeaders: false,
});

// ✅ เพิ่ม Auth Limiter ให้เข้มงวดขึ้นสำหรับหน้า Login/Register
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 นาที
    max: 10, // จำกัดแค่ 10 ครั้งต่อ IP
    message: "คุณทำรายการเกี่ยวกับบัญชีหลายครั้งเกินไป กรุณาลองใหม่ในอีก 15 นาที",
    standardHeaders: true,
    legacyHeaders: false,
});

const Log = require("./models/Log");

const logger = require('./models/logger');

const nodemailer = require("nodemailer");

const streamifier = require('streamifier');

const crypto = require('crypto');

const { PDFDocument, PDFName, rgb } = require('pdf-lib');

const userSockets = new Map();
const mongoose = require("mongoose");

const express = require("express");
const path = require("path");
const ejs = require("ejs");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("./db"); // ✅ เพิ่มตรงนี้

const fontkit = require('@pdf-lib/fontkit');

const migrateOldNotis = async () => {
    await Notification.updateMany(
        { isRead: { $exists: false } }, 
        { $set: { isRead: true } }
    );
};

let bucket;

mongoose.connection.once("open", () => {
    bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "uploads" });
    
    // เรียก Migration แจ้งเตือนเก่าตรงนี้เลย (ถ้าต้องการรัน)
    migrateOldNotis().catch(err => console.error("Migration error:", err));
});

// ส่วนการเรียกใช้ connectDB ให้แยกออกมาต่างหาก
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 8080;

const session = require("express-session");
const bcrypt = require("bcrypt");
const User = require("./models/User"); // ✅ import model

const multer = require("multer");
const { GridFSBucket, ObjectId } = require("mongodb");

//GGEZ
// ใช้ memory storage ของ multer
const storage = multer.memoryStorage();
const upload = multer({ storage , limits: { fileSize: 20 * 1024 * 1024 }});

const fs = require('fs'); // ต้องใช้ในการลบไฟล์ แต่ในกรณีนี้เราจะใช้ Buffer แทน
const XLSX = require('xlsx'); // ✅ นำเข้าไลบรารีสำหรับอ่าน Excel


const processExcelFile = (buffer) => {
    try {
        // ใช้ XLSX.read() อ่าน Buffer โดยตรง
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0]; // อ่านชีทแรก
        const worksheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // 2. กำหนดคำค้นหาที่คาดว่าจะเป็น "หัวตาราง"
        const targetHeaders = ["เลขประจำตัว", "ชื่อ", "คำนำหน้าชื่อ", "ลำดับ" , "นามสกุล", "ตำแหน่ง"];
        let startRowIndex = 0;

        // 3. วนลูปหาว่าบรรทัดไหนมีคำสำคัญเหล่านี้
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            // เช็คว่าในแถวนี้ (row) มีคำใดคำหนึ่งใน targetHeaders หรือไม่
            const isHeaderRow = row.some(cell => 
                targetHeaders.includes(String(cell).trim())
            );

            if (isHeaderRow) {
                startRowIndex = i; // บันทึกตำแหน่งแถวที่เจอหัวตาราง
                break;
            }
        }

        // แปลงข้อมูลชีทเป็น JSON Array
        const data = XLSX.utils.sheet_to_json(worksheet, { range: startRowIndex });
        
        if (data.length === 0) {
            throw new Error("Excel file is empty or data format is incorrect.");
        }
        
        return data;
    } catch (error) {
        console.error("Error processing Excel file:", error);
        throw new Error("Failed to process Excel file: " + error.message);
    }
};

// 3. ฟังก์ชันสำหรับบันทึกข้อมูล JSON ลง MongoDB
async function saveUsersFromExcel(dataArray) {
    if (!dataArray || dataArray.length === 0) {
        return { insertedCount: 0 };
    }

    const bulkOps = [];
    const saltRounds = 12;
    const PENDING_PASS_STRING = crypto.randomBytes(16).toString('hex'); // สร้างรหัสผ่านชั่วคราวแบบสุ่ม
    const pendingHashedPassword = await bcrypt.hash(PENDING_PASS_STRING, saltRounds); 

    for (const row of dataArray) {
        // 1. ดึงเลขประจำตัว
        const rawUsername = String(row['เลขประจำตัว']).trim();
        if (!rawUsername) continue; 
        const check = await User.findOne({ username: rawUsername });
        if (check) continue;

        const emailExel = `s${rawUsername}@kmutnb.ac.th`.toLowerCase();

        // 2. จัดการเรื่องชื่อ (เอา คำนำหน้า + ชื่อ)
        const title = (row['คำนำหน้าชื่อ'] || '').trim();
        const firstName = (row['ชื่อ'] || 'Pending').trim();
        const lastName = (row['นามสกุล'] || 'Registration').trim();
        const role = (row['ตำแหน่ง'] === 'teacher' || row['ตำแหน่ง'] === 'อาจารย์' ? 'teacher' : row['ตำแหน่ง'] === 'secretary' || row['ตำแหน่ง'] === 'เลขานุการ' ? 'secretary' : 'user').trim().toLowerCase();



        const userData = {
            username: rawUsername,
            email: emailExel,
            password: pendingHashedPassword,
            title: title,
            name: firstName, 
            lastname: lastName,
            role: role,
            branch: "EnET",
            picture: "",
            group: [],
            createdAt: new Date()
        };
        
        bulkOps.push({
            updateOne: {
                filter: { username: rawUsername },
                update: { $setOnInsert: userData }, 
                upsert: true 
            }
        });
    }

    try {
        const result = await User.bulkWrite(bulkOps, { ordered: false });
        return { insertedCount: result.upsertedCount };
    } catch (error) {
        console.error("❌ Bulk Write Error:", error);
        throw error;
    }
}

async function generateAutoFilledPDF(groupData) {
    try {
        const templatePath = path.join(__dirname, 'app1', 'src', 'template', 'แบบฟอร์มขออนุมัติหัวข้อสอบก้าวหน้าและสอบป้องกัน.pdf');
        // ใช้ฟอนต์ Bold ตามที่คุณต้องการ
        const fontPath = path.join(__dirname, 'app1', 'src', 'fonts', 'THSarabunNew Bold.ttf');
        

        const templateBuffer = fs.readFileSync(templatePath);
        const fontBuffer = fs.readFileSync(fontPath);
        
        const pdfDoc = await PDFDocument.load(templateBuffer);
        pdfDoc.registerFontkit(fontkit);

        const thaiFont = await pdfDoc.embedFont(fontBuffer);
        const form = pdfDoc.getForm();

        const smartFill = (name, value) => {
            try {
                const field = form.getField(name);
                if (!field) return;

                const textValue = value ? value.toString() : "-";

                // 1. 🛡️ เช็คว่าเป็น TextField จริงไหมก่อนสั่งงาน
                // ถ้าเป็นคลาส PDFTextField ถึงจะสั่งงานระดับสูงได้
                if (field.constructor.name === 'PDFTextField') {
                    
                    // 2. 🚫 วิธีลบกรอบแบบ Low-level (ใช้ได้กับทุกไฟล์)
                    const widgets = field.acroField.getWidgets();
                    widgets.forEach(widget => {
                        // ลบ Border (BC) และ Background (BG) จาก PDF Dictionary โดยตรง
                        widget.dict.delete(PDFName.of('BC')); 
                        widget.dict.delete(PDFName.of('BG'));
                        widget.dict.set(PDFName.of('BS'), pdfDoc.context.obj({ W: 0 })); // บังคับเส้นหนา 0
                    });

                    // 3. 📏 คำนวณขนาด Font Auto-fit (เหมือนเดิม)
                    const width = widgets[0].getRectangle().width;
                    let fontSize = 12;
                    let textWidth = thaiFont.widthOfTextAtSize(textValue, fontSize);
                    while (textWidth > width - 6 && fontSize > 6) {
                        fontSize -= 0.5;
                        textWidth = thaiFont.widthOfTextAtSize(textValue, fontSize);
                    }

                    // 4. ✍️ กรอกข้อมูลและอัปเดต
                    field.setFontSize(fontSize);
                    field.setText(textValue);
                    field.updateAppearances(thaiFont);
                }
            } catch (e) {
                console.error(`⚠️ Error ที่ฟิลด์ ${name}:`, e.message);
            }
        };

        // --- เตรียมข้อมูลชื่อ (ดึง User เหมือนเดิม) ---
        const cleanM1 = groupData.member1 ? groupData.member1.replace(" (Pending)", "") : null;
        const cleanM2 = groupData.member2 ? groupData.member2.replace(" (Pending)", "") : null;
        const cleanAdv = groupData.advisor ? groupData.advisor.replace(" (Pending)", "") : null;

        const [mem1, mem2, adv] = await Promise.all([
            User.findOne({ username: cleanM1 }),
            cleanM2 ? User.findOne({ username: cleanM2 }) : null,
            cleanAdv ? User.findOne({ username: cleanAdv }) : null
        ]);

        const name1 = mem1 ? `${mem1.name} ${mem1.lastname}` : (cleanM1 || "-");
        const name2 = mem2 ? `${mem2.name} ${mem2.lastname}` : (cleanM2 || "");
        const nameAdv = adv ? `${adv.name} ${adv.lastname}` : (cleanAdv || "");
        const now = new Date();

        // --- สั่งกรอกข้อมูล ---
        smartFill('Text1', 'วิทยาลัยเทคโนโลยีอุตสาหกรรม สาขาวิชาคอมพิวเตอร์');
        smartFill('Text2', (now.getMonth() + 1 >= 10 ? (now.getFullYear() + 543) : (now.getFullYear() + 542)).toString());
        smartFill('Text3', groupData.projectName);
        smartFill('Text4', groupData.engName);
        smartFill('Text5', name1);
        smartFill('Text6', name2);
        smartFill('Text7', 'วิทยาลัยเทคโนโลยีอุตสาหกรรม สาขาวิชาคอมพิวเตอร์');
        smartFill('Text8', nameAdv);
        smartFill('Text10', 'วิทยาลัยเทคโนโลยีอุตสาหกรรม');
        smartFill('Text11', 'คอมพิวเตอร์');
        smartFill('Text12', 'วิทยาลัยเทคโนโลยีอุตสาหกรรม สาขาวิชาคอมพิวเตอร์');
        smartFill('Text13', (now.getMonth() + 1 >= 10 ? 2 : 1).toString());
        smartFill('Text14', (now.getMonth() + 1 >= 10 ? (now.getFullYear() + 543) : (now.getFullYear() + 542)).toString());
        smartFill('Text15', groupData.projectName);
        smartFill('Text16', groupData.engName);
        smartFill('Text17', name1);
        smartFill('Text18', cleanM1);
        smartFill('Text19', name2);
        smartFill('Text20', cleanM2);
        smartFill('Text22', 'วิทยาลัยเทคโนโลยีอุตสาหกรรม สาขาวิชาคอมพิวเตอร์');
        smartFill('Text23', (now.getMonth() + 1 >= 10 ? 2 : 1).toString());
        smartFill('Text24', (now.getMonth() + 1 >= 10 ? (now.getFullYear() + 543) : (now.getFullYear() + 542)).toString());
        smartFill('Text25', groupData.projectName);
        smartFill('Text26', groupData.engName);
        smartFill('Text27', name1);
        smartFill('Text28', cleanM1);
        smartFill('Text29', name2);
        smartFill('Text30', cleanM2);

        // ✅ ท่าไม้ตายสุดท้าย: รวมเลเยอร์ (Flatten) เพื่อไม่ให้พื้นหลังหายและตัวหนังสือคงที่
        form.flatten();

        return await pdfDoc.save();
    } catch (err) {
        console.error("❌ PDF REAL ERROR:", err);
        return null;
    }
}

async function createLog(req, action, details = {}) {
    const username = req.session?.user?.username || "Guest";
    const logMsg = `${action} by ${username} - Details: ${JSON.stringify(details)}`;

    try {
        // 1. บันทึกลงไฟล์ผ่าน Winston
        if (action.includes('ERROR')) {
            logger.error(logMsg);
        } else {
            logger.info(logMsg);
        }

        // 2. บันทึกลง MongoDB (โค้ดเดิมของคุณ)
         const newLog = new Log({
            username: req.session.user ? req.session.user.username : "System/Guest",
            role: req.session.user ? req.session.user.role : "N/A",
            action: action,
            details: details,
            // ✅ ต้องมี Key ชื่อ 'ip' กำกับ และเปลี่ยน ; เป็น ,
            ip: req.headers['x-forwarded-for']?.split(',')[0] || 
                req.ip || 
                req.connection.remoteAddress
        });
        await newLog.save();
    } catch (err) {
        logger.error(`Failed to save log to DB: ${err.message}`);
    }
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🛡️ เพิ่ม Trust Proxy หากนำขึ้น Production รันผ่าน Nginx/Heroku เพื่อให้ secure: true ทำงานได้ปกติ
app.set("trust proxy", 1);
const MongoStore = require("connect-mongo");

app.use(session({
  secret: process.env.SESSION_SECRET || "fallback-for-local-dev", // ควรใช้สตริงที่ยาวและเดายาก
  resave: false,
  saveUninitialized: false, // เปลี่ยนเป็น false เพื่อไม่ให้สร้าง session ว่างๆ ถ้ายังไม่ login
  // 🛡️ เปลี่ยนไปเก็บ Session ใน MongoDB แทน Memory เพื่อป้องกัน Memory Leak และเก็บสถานะตอนเซิร์ฟเวอร์รีสตาร์ทได้
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || "mongodb://localhost:27017/test",
    collectionName: "sessions"
  }),
  cookie: {
    httpOnly: true, // ✅ ป้องกัน JavaScript เข้าถึง cookie (กัน XSS)
    secure: process.env.NODE_ENV === "production", // 🛡️ เปิด Secure (HTTPS) อัตโนมัติเมื่อรันบน Production
    sameSite: "strict" // 🛡️ เปลี่ยนจาก 'lax' เป็น 'strict' เพื่อป้องกันการโจมตีแบบ CSRF ข้ามโดเมนได้ 100%
  }
}));
app.use(helmet());
app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net" , "code.jquery.com"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "fonts.googleapis.com"],
        fontSrc: ["'self'", "fonts.gstatic.com" , "cdn.jsdelivr.net"]
    }
}));

app.use(mongoSanitize());

// ✅ เชื่อม MongoDB ก่อนเริ่มเซิร์ฟเวอร์
//connectDB();

// ตั้งค่า View Engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "app1", "public"));
app.use(express.static(path.join(__dirname, "app1", "src")));

// ฟังก์ชัน render
function renderWithLayout(res, view, data = {}, reqPath = "", req) {
  const extendedData = { ...data, currentPath: reqPath };

  if (req && req.session && req.session.user) {
    extendedData.user = req.session.user;
  }

  ejs.renderFile(
    path.join(__dirname, "app1", "public", `${view}.ejs`),
    extendedData,
    (err, str) => {
      if (err) {
        // ✅ เติม return เพื่อหยุดการทำงาน
        return res.status(500).send(err.message); 
      }
      
      if (view === "login" || view === "register" || view === "forgotPassword" || view === "resetPassword" || view === "changePassword") {
        // ✅ return ตรงนี้ถูกต้องแล้ว
        return res.render(view, extendedData); 
      } else {
        // ✅ เติม return เพื่อความปลอดภัย
        return res.render("layout", { ...extendedData, body: str }); 
      }
    }
  );
}
// Middleware ตรวจว่า login แล้ว
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

// Middleware ตรวจ role (ถ้าใช้ role เช่น admin)
function requireRole(role) {
  return function (req, res, next) {
    if (!role.includes(req.session.user.role)) {
      return res.redirect("/"); // หรือส่งข้อความว่าไม่อนุญาตก็ได้
    }
    next();
  };
}

// ✅ Middleware สำหรับจัดการ failModal
function checkFailModal(req, res, next) {
  res.locals.failModal = req.session.failModal || null; // ส่งค่าไป render
  req.session.failModal = null; // ล้างค่าทันทีหลังใช้งาน
  next();
}

function checkSuccessModal(req, res, next) {
  res.locals.successModal = req.session.successModal || null; // ส่งค่าไป render
  req.session.successModal = null; // ล้างค่าทันทีหลังใช้งาน
  next();
}

function truncateText(text, maxWords) {
    if (!text) return '';
    const words = text.split(/\s+/);
    if (words.length > maxWords) {
        return words.slice(0, maxWords).join(' ') + '...';
    }
    return text;
}

// 🛡️ ฟังก์ชันสำหรับแปลงอักขระพิเศษ (Escape HTML) เพื่อป้องกัน XSS Attack
const escapeHTML = (str) => {
    if (!str) return "";
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
};

// 🛡️ ฟังก์ชันตรวจสอบ Magic Number (File Signature) ของเอกสาร
const isValidDocumentSignature = (buffer, mimetype) => {
    if (!buffer || buffer.length < 8) return false;
    const hex = buffer.toString('hex', 0, 8).toUpperCase();
    if (mimetype === 'application/pdf') return hex.startsWith('25504446'); // %PDF
    if (mimetype.includes('openxmlformats')) return hex.startsWith('504B0304'); // DOCX, PPTX, XLSX (ZIP)
    if (mimetype === 'application/vnd.ms-powerpoint' || mimetype === 'application/msword') return hex.startsWith('D0CF11E0A1B11AE1'); // PPT, DOC (OLECF)
    return false;
};

// 🛡️ ฟังก์ชันตรวจสอบ Magic Number (File Signature) ของรูปภาพ
const isValidImageSignature = (buffer) => {
    if (!buffer || buffer.length < 4) return false;
    const hex = buffer.toString('hex', 0, 4).toUpperCase();
    return hex.startsWith('FFD8FF') || hex === '89504E47' || hex === '47494638' || hex === '52494646'; // JPG, PNG, GIF, WEBP
};

function generateEventId() {
    return crypto.randomUUID(); 
    // ผลลัพธ์จะเป็นแบบ: "123e4567-e89b-12d3-a456-426614174000"
}

async function sendGroupNotification(type, groupId, senderUsername, sender, messageText, senderPic, mention , expire , member1, member2 , advisor, extraRecipient) {
    try {
        if (type === 'alert') {
            // 1. บันทึกลง DB แค่ 1 อัน (ใช้ recipient: 'ALL')
            const globalNoti = new Notification({
                recipient: ['ALL'],
                senderUsername: senderUsername,
                senderName: sender,
                type: 'group_alert', // ปรับให้ตรงกับ Enum ใน Schema
                group: groupId,
                text: messageText,
                isRead: false,
                expireAt: expire || undefined,
                mention: mention || null,
            });
            await globalNoti.save();

            // 2. ส่ง Socket Real-time ถึงทุกคนที่ออนไลน์อยู่
            io.emit("new_notification", {
                recipient: ['ALL'],
                _id: globalNoti._id, // ✅ ส่ง ID ที่เพิ่งบันทึกไปเพื่อให้หน้าบ้านกดอ่านได้
                senderName: sender,
                text: messageText,
                groupId: groupId,
                senderPic: senderPic,
                type: 'group_alert'
            });
        }else if (type === 'addGroup') {
          // 1. เตรียมรายชื่อสมาชิกกลุ่ม
          let recipientList = [];
          if (member2){
            let mem2Str = String(member2)
            if(mem2Str.includes("(Pending)")){
                recipientList.push(mem2Str.replace(" (Pending)",""));
            }else{
                recipientList.push(mem2Str);
            }
          } 
          if (advisor) {
                let adv2Str = String(advisor)
                if(adv2Str.includes("(Pending)")){
                    recipientList.push(adv2Str.replace(" (Pending)",""));
                }else{
                    recipientList.push(adv2Str);
                }
          }
          // กรองเอาเฉพาะคนที่ไม่ใช่คนส่ง
          const finalRecipients = recipientList.filter(m => m && m !== senderUsername);
          // 2. บันทึกแจ้งเตือนลง DB เพียง "แถวเดียว" (ระบุผู้รับเป็น Array)
          if (finalRecipients.length > 0) {
              const newNoti = new Notification({
                  recipient: finalRecipients, // ✅ เปลี่ยนจาก recipient เป็น recipients (Array)
                  senderUsername: senderUsername,
                  senderName: sender,
                  type: 'added_to_group',
                  group: groupId,
                  text: messageText,
                  senderPic: senderPic, // ✅ เก็บรูปคนส่งไว้ด้วย
                  isRead: false // ค่าเริ่มต้น (ไม่ได้ใช้งานจริงสำหรับระบบแยกคนอ่านแต่ใส่ไว้กัน Error)
              });
              await newNoti.save();
              // 3. ส่ง Socket Real-time แยกรายคนตามรายชื่อผู้รับ
              finalRecipients.forEach((memberUsername) => {
                  io.to(memberUsername).emit("new_notification", {
                    recipient: recipientList,
                      _id: newNoti._id, // ✅ ส่ง ID ที่เพิ่งบันทึกไปเพื่อให้หน้าบ้านกดอ่านได้
                      senderName: sender,
                      text: messageText,
                      groupId: groupId,
                      senderPic: senderPic,
                      type: 'added_to_group'
                  }); 
              });
          }
        } else if (type === 'message') {
          // 1. หาข้อมูลกลุ่มและสมาชิก
          const groupData = await Group.findById(groupId);
          if (!groupData) return;
          
          // รวมรายชื่อสมาชิกทั้งหมด
          const allMembers = [groupData.member1, groupData.member2, groupData.advisor];
          
          // 2. กรองเอาเฉพาะคนที่ไม่ใช่คนส่ง (Recipients)
          const recipientList = allMembers.filter(m => m && m !== senderUsername);

          if (recipientList.length > 0) {
              // 3. บันทึกแจ้งเตือนลง DB เพียง "แถวเดียว" (ระบุผู้รับเป็น Array หรือใช้ห้องกลุ่ม)
              // เพื่อให้รองรับระบบแยกคนอ่าน เราจะตั้งค่า recipients เป็น Array
              const newNoti = new Notification({
                  recipient: recipientList, // ✅ เปลี่ยนจาก recipient เป็น recipients (Array)
                  senderUsername: senderUsername,
                  senderName: sender,
                  type: 'new_message',
                  group: groupId,
                  text: messageText,
                  expire: expire || null,
                  senderPic: senderPic, // ✅ เก็บรูปคนส่งไว้ด้วย
                  isRead: false // ค่าเริ่มต้น (ไม่ได้ใช้งานจริงสำหรับระบบแยกคนอ่านแต่ใส่ไว้กัน Error)
              });
              await newNoti.save();

              // 4. ส่ง Socket Real-time แยกรายคนตามรายชื่อผู้รับ
              recipientList.forEach((memberUsername) => {
                  io.to(memberUsername).emit("new_notification", {
                      recipient: recipientList,
                      _id: newNoti._id, // ✅ ส่ง ID ที่เพิ่งบันทึกไปเพื่อให้หน้าบ้านกดอ่านได้
                      senderName: sender,
                      text: messageText,
                      groupId: groupId,
                      senderPic: senderPic,
                      type: 'new_message'
                  });
              });
          }
        }else if (type === 'alert_group') {
            // 1. บันทึกลง DB แค่ 1 อัน (ใช้ recipient: 'ALL')
            let recipientList = [];
            if (member1) recipientList.push(member1);
            if (member2) recipientList.push(member2);
            if (advisor) recipientList.push(advisor);
            if (extraRecipient && !recipientList.includes(extraRecipient)) recipientList.push(extraRecipient);
            const globalNoti = new Notification({
                recipient: recipientList,
                senderUsername: senderUsername,
                senderName: sender,
                type: 'group_alert', // ปรับให้ตรงกับ Enum ใน Schema
                group: groupId,
                text: messageText,
                isRead: false,
                expireAt: expire || undefined,
                mention: mention || null,
            });
            await globalNoti.save();
            // 2. ส่ง Socket Real-time ถึงทุกคนที่ออนไลน์อยู่
            recipientList.forEach((memberUsername) => {
                io.to(memberUsername).emit("new_notification", {
                    recipient: recipientList,
                    _id: globalNoti._id, // ✅ ส่ง ID ที่เพิ่งบันทึกไปเพื่อให้หน้าบ้านกดอ่านได้
                    senderName: sender,
                    text: messageText,
                    groupId: groupId,
                    senderPic: senderPic,
                    type: 'group_alert'
                });
            });
        }else if (type === 'alert_paper') {
            let recipientList = [];
            if (member1) recipientList.push(member1);
            if (member2) recipientList.push(member2);
            if (advisor) recipientList.push(advisor);
            const globalNoti = new Notification({
                recipient: recipientList,
                senderUsername: senderUsername,
                senderName: sender,
                type: 'alert_paper', // ปรับให้ตรงกับ Enum ใน Schema
                group: groupId,
                text: messageText,
                isRead: false,
                expireAt: expire || undefined,
                mention: mention || null,
            });
            await globalNoti.save();
            // 2. ส่ง Socket Real-time ถึงทุกคนที่ออนไลน์อยู่
            recipientList.forEach((memberUsername) => {
                io.to(memberUsername).emit("new_notification", {
                    recipient: recipientList,
                    _id: globalNoti._id, // ✅ ส่ง ID ที่เพิ่งบันทึกไปเพื่อให้หน้าบ้านกดอ่านได้
                    senderName: sender,
                    text: messageText,
                    groupId: groupId,
                    senderPic: senderPic,
                    type: 'alert_paper'
                });
            });
        }else if (type === 'alert_event') {
            const recipientList = ["ALL"];
            const globalNoti = new Notification({
                recipient: recipientList,
                senderUsername: senderUsername,
                senderName: sender,
                type: 'alert_event', // ปรับให้ตรงกับ Enum ใน Schema
                group: groupId,
                text: messageText,
                isRead: false,
                expireAt: expire || undefined,
                mention: mention || null,
            });
            await globalNoti.save();
            // 2. ส่ง Socket Real-time ถึงทุกคนที่ออนไลน์อยู่
            recipientList.forEach((memberUsername) => {
                io.to(memberUsername).emit("new_notification", {
                    recipient: recipientList,
                    _id: globalNoti._id, // ✅ ส่ง ID ที่เพิ่งบันทึกไปเพื่อให้หน้าบ้านกดอ่านได้
                    senderName: sender,
                    text: messageText,
                    groupId: groupId,
                    senderPic: senderPic,
                    type: 'alert_paper'
                });
            });
        }

    } catch (err) {
        console.error("❌ Notification Error:", err);
    }
}

function requireNotRole(role) {
    return (req, res, next) => {
        if (role.includes(req.session.user.role)) {
            return res.redirect("/"); // หรือส่งข้อความว่าไม่อนุญาตก็ได้
        }
        next();
    };
}

// Routes
app.get("/" ,requireLogin, async (req, res) => {
  if(req.session.user.role === "admin" || req.session.user.role === "secretary") {
    return res.redirect("/userInfo");
  }else{
    return res.redirect("/group");
  }
  try {
    const newsList = await News.find().sort({ createdAt: -1 });
    const newsData = newsList.map(item => ({
            ...item.toObject(), 
            imgId: item.img && item.img.id ? item.img.id.toString() : null 
    }));
    renderWithLayout(res, "index", { title: "KMUTNB Project - Main" ,news: newsData,user: req.session.user,truncateText: truncateText} , req.path,req);
  }catch(err){
    console.error("Error fetching news:", err);
    return res.status(500).send("Error loading news");
  }
});
app.get("/upload", requireLogin, (req, res) => {
  renderWithLayout(res, "upload", { title: "KMUTNB Project - Upload" }, req.path,req);
});

app.post("/upload-file/:groupId", requireLogin, apiLimiter, upload.array("files"), async (req, res) => {
    let group;
  try {
    const messages = [];

    const groupId = req.params.groupId;
    group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "ไม่พบข้อมูลกลุ่ม" });

    let hasMovement = false;

    let mem1 = null;
    let mem2 = null;
    let adv = null;

    const expireTime = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);

    if(group.member1 && !group.member1.includes("(Pending)")){
      const cleanMem1 = group.member1.replace(" (Pending)","");
      mem1 = cleanMem1;
    }
    if(group.member2 && !group.member2.includes("(Pending)")){
      const cleanMem2 = group.member2.replace(" (Pending)","");
      mem2 = cleanMem2;
    }
    if(group.advisor && !group.advisor.includes("(Pending)")){
      const cleanAdv = group.advisor.replace(" (Pending)","");
      adv = cleanAdv;
    }

    // ถ้ามีข้อความ
    if(req.body.text && req.body.text.trim() !== ""){
      const textMessage = new Message({
        groupId: req.params.groupId,
        senderUsername: req.session.user.username,
        senderName: req.session.user.name,
        type: "text",
        text: escapeHTML(req.body.text.trim()), // 🛡️ Escape HTML ป้องกัน XSS
        senderPic: req.session.user.picture,
        timestamp: new Date(),
        groupMember: [mem1,mem2,adv]
      });
      await textMessage.save();
      messages.push(textMessage);

      io.to(req.params.groupId).emit("group message", textMessage);
      await sendGroupNotification('message',groupId, req.session.user.username, req.session.user.name, req.body.text.trim(), req.session.user.picture ? req.session.user.picture : null , null , expireTime , null , null , null);

      hasMovement = true;
    }

    // ถ้ามีไฟล์
    if(req.files && req.files.length > 0){
      // 🛡️ 1. ตรวจสอบความปลอดภัยของทุกไฟล์ก่อนทำการอัปโหลด (Pre-flight Validation)
      for (const file of req.files) {
        const allowedMimeTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', // กลุ่มรูปภาพ
            'application/pdf', // กลุ่ม PDF
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // กลุ่ม Word
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // กลุ่ม Excel
            'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', // กลุ่ม Powerpoint
            'application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed', // กลุ่มไฟล์บีบอัด
            'text/plain' // กลุ่มไฟล์ข้อความ
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
            return res.status(400).json({ error: `ไม่อนุญาตให้อัปโหลดไฟล์ ${file.originalname} (รองรับแค่รูปภาพ, เอกสาร Office, PDF, ZIP, RAR, TXT)` });
        }

        // ตรวจสอบ Magic Number ของรูปภาพ
        if (file.mimetype.startsWith('image/') && !isValidImageSignature(file.buffer)) {
            return res.status(400).json({ error: `ไฟล์รูปภาพ ${file.originalname} เสียหายหรือถูกปลอมแปลง` });
        }

        // ตรวจสอบ Magic Number ของเอกสาร Office/PDF
        const docTypes = ['application/pdf', 'application/msword', 'application/vnd.ms-powerpoint', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
        if (docTypes.includes(file.mimetype) && !isValidDocumentSignature(file.buffer, file.mimetype)) {
            return res.status(400).json({ error: `ไฟล์เอกสาร ${file.originalname} เสียหายหรือถูกปลอมแปลง` });
        }
      }

      // 🛡️ 2. ดำเนินการอัปโหลดเมื่อไฟล์ทั้งหมดผ่านการตรวจสอบความปลอดภัย
      for (const file of req.files) {
        const uploadStream = bucket.openUploadStream(file.originalname, { contentType: file.mimetype });

        uploadStream.end(file.buffer);

        await new Promise((resolve, reject) => {
          uploadStream.on("finish", resolve);
          uploadStream.on("error", reject);
        });

        const fileId = uploadStream.id;

        const fileMessage = new Message({
          groupId: req.params.groupId,
          senderUsername: req.session.user.username,
          senderName: req.session.user.name,
          type: "file",
          file: {
            filename: file.originalname,
            contentType: file.mimetype,
            length: file.size,
            uploadDate: new Date(),
            fileId: fileId
          },
          senderPic: req.session.user.picture || null,
          timestamp: new Date(),
          groupMember: [mem1,mem2,adv]
        });

        await fileMessage.save();
        messages.push(fileMessage);

        io.to(req.params.groupId).emit("group message", fileMessage);
        await sendGroupNotification('message',groupId, req.session.user.username, req.session.user.name, `ส่งไฟล์: ${file.originalname}`, req.session.user.picture || null , null , expireTime , null , null , null);

        hasMovement = true;
      }
    }

    if (hasMovement) {
      await Group.findByIdAndUpdate(groupId, { lastUpdatedTime: new Date() });
    }

    res.json(messages);
    } catch(err){
      console.error(err);
      res.status(500).json({ error: "Upload error" });
    }

    await createLog(req, "SENT_CHAT", { 
        groupName: group.projectName,
        type: req.body.text && req.body.text.trim() !== "" ? "message" : "file" // ดึงชื่อกิจกรรมมาเก็บไว้ดูย้อนหลังได้
    });
  });

  


app.get('/file/download/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        
        // ลองหาจากทั้ง 2 แหล่งเพื่อเช็คว่าไฟล์อยู่ที่ไหน
        const fileFromFS = await bucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray().then(files => files[0]);
        
        if (!fileFromFS) {
            // ลองหาในคอลเลกชันที่คุณอาจจะตั้งชื่อไว้เอง (ถ้ามี)
            return res.status(404).send(`ไม่พบไฟล์ ID: ${fileId} ในระบบ`);
        }

        const encodedName = encodeURIComponent(fileFromFS.filename);
        res.set({
            'Content-Type': fileFromFS.contentType || 'application/octet-stream',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`
        });

        bucket.openDownloadStream(fileFromFS._id).pipe(res);

    } catch (err) {
        console.error("❌ Error:", err);
        return res.status(500).send("ID ไฟล์ไม่ถูกต้อง");
    }
});

app.get("/status", requireLogin, async (req, res) => {
  try {
    const groups = await Group.find().sort({ projectName: 1 });
    const groupsWithData = await Promise.all(groups.map(async (g) => {
      const user = await User.findOne({ username: g.member1 }); 
      return {
          ...g.toObject(),
          leaderName: user ? `${user.name} ${user.lastname}` : g.member1
      };
    }));

    // ✅ ต้องมี return เพื่อป้องกัน Error Headers Sent
    return renderWithLayout(res, "status", { title: "KMUTNB Project - Status", groups: groupsWithData }, req.path, req);
    
  } catch (err) {
    console.error("Error fetching groups:", err);
    // ✅ ต้องมี return ตรงนี้ด้วย
    return res.status(500).send("Error loading status");
  }
});

app.get("/ownedGroupStatus", requireLogin, async (req, res) => {
  try {
    if(req.session.user.role === 'user' && req.session.user.group && req.session.user.group.length > 0){
        const group = req.session.user.group[0];
        return res.redirect("/ownedGroupInfo/"+group);
    }
    const username = req.session.user.username;
    const groups = await Group.find({
        $and:[
            {$or:[
                { member1: username },
                { member2: username },
                { advisor: username }
            ]},
            {status: { $nin: ["ผ่านการสอบป้องกันปริญญานิพนธ์","ไม่ผ่านการสอบป้องกันปริญญานิพนธ์","ไม่ผ่านการสอบหัวข้อปริญญานิพนธ์"] }}
        ]
    }).sort({ projectName: 1 });
    const groupsWithData = await Promise.all(groups.map(async (g) => {
      const user = await User.findOne({ username: g.member1 }); 
      return {
          ...g.toObject(),
          leaderName: user ? `${user.name} ${user.lastname}` : g.member1
      };
    }));

    // ✅ ต้องมี return เพื่อป้องกัน Error Headers Sent
    return renderWithLayout(res, "ownedGroupStatus", { title: "KMUTNB Project - Group Status", groups: groupsWithData }, req.path, req);
    
  } catch (err) {
    console.error("Error fetching groups:", err);
    // ✅ ต้องมี return ตรงนี้ด้วย
    return res.status(500).send("Error loading status");
  }
});

app.get("/login", checkFailModal, checkSuccessModal, (req, res) => {
  const inputUsername = req.session.inputUsername || "";
  req.session.inputUsername = null; // ล้างค่าหลังใช้งาน
  renderWithLayout(res, "login", { 
    title: "KMUTNB Project - Login", 
    failModal: res.locals.failModal,
    successModal: res.locals.successModal,
    inputUsername  // ส่งค่าไป EJS
  }, req.path, req);
  
});
app.get("/flowchart", requireLogin, requireNotRole(['secretary']) ,(req, res) => {
  renderWithLayout(res, "flowchart", { title: "KMUTNB Project - Flowchart" }, req.path,req);
});
app.get("/file", requireLogin, (req, res) => {
  renderWithLayout(res, "file", { title: "KMUTNB Project - File" }, req.path,req);
});
app.get("/group", requireLogin , requireNotRole(['secretary']) ,async (req, res) => {
  try{

    if (req.session.user && Array.isArray(req.session.user.group) && req.session.user.group.length === 0 ){
      return res.redirect("/addGroup");
    }

    const username = req.session.user.username;

    let groups;   
    groups = await Group.find({ allMember: { $in: [username] } }).sort({ lastUpdatedTime: -1 });

    let userInfo = []; // เก็บข้อมูลสมาชิกแยกตามกลุ่ม

    const activeGroups = groups.filter(g => g.member1 === username || g.member2 === username || g.advisor === username); // ปรับเงื่อนไขตามฟิลด์ status ของคุณ
    const pastGroups = groups.filter(g => g.member1 != username && g.member2 != username && g.advisor != username && (g.status === "ผ่านการสอบป้องกันปริญญานิพนธ์" || g.status.includes('ไม่ผ่าน')));

    if (activeGroups && activeGroups.length > 0) {
        const myUsername = username; // username ของคุณ

        for (const group of activeGroups) {
            // 1. เช็คว่ากลุ่มนี้เราเป็น member1 หรือ member2 หรือไม่
            if (group.member1 === myUsername || group.member2 === myUsername) {
                
                // 2. ถ้าใช่ ดึงข้อมูล User ของกลุ่มนี้ออกมา
                const [mem1, mem2, adv] = await Promise.all([
                    User.findOne({ username: group.member1 }),
                    group.member2 ? User.findOne({ username: group.member2 }) : null,
                    group.advisor ? User.findOne({ username: group.advisor }) : null
                ]);

                // 3. เก็บข้อมูลเข้า Array (อาจจะเก็บคู่กับ Group ID เพื่อให้นำไปใช้ง่าย)
                userInfo = [mem1, mem2, adv]
            }
        }
    }
    renderWithLayout(res, "group", { 
      title: "KMUTNB Project - Group",
      userInfo, 
      activeGroups,
      pastGroups,
      user: req.session.user
    }, req.path,req);
  }catch(err){
    console.error("❌ Error deleting news:", err);
    res.status(500).send("Error loading groups");
  }
  await createLog(req, "ENTER_CHAT", { 
        username: req.session.user.username
    });
});

app.get("/chat", requireLogin, async (req, res) => {
  try {
    // ดึงรายชื่อ user ทั้งหมด ยกเว้นตัวเอง
    const users = await User.find({ username: { $ne: req.session.user.username } });
    renderWithLayout(res, "chat", { 
      title: "KMUTNB Project - Chat", 
      users,
      user: req.session.user
    }, req.path, req);
  } catch (err) {
    return res.status(500).send("Error loading users");
  }
});
app.get("/group/messages/group/:groupId", requireLogin, async (req, res) => {
  try {
    const messages = await Message.find({ groupId: req.params.groupId })
      .sort({ timestamp: 1 })
      .lean(); // แปลงเป็น object ปกติ ไม่ใช่ mongoose doc
    
    const formatted = messages.map(m => {
      if (m.file && m.file.fileId) {
        m.file.fileId = m.file.fileId.toString();
      }
      return m;
    });

    res.json({ messages: formatted });
  } catch (err) {
    res.status(500).json({ error: "Failed to load group messages" });
  }
});

app.get("/profile", requireLogin, (req, res) => {
  renderWithLayout(res, "profile", { title: "Profile" }, req.path,req);
});

app.get("/viewProfile/:id", requireLogin, async (req, res) => {
  try {
    const id = req.params.id;
    let viewUser;
    
    // 1. ลองค้นหาด้วย _id ของ MongoDB ก่อน
    if (mongoose.Types.ObjectId.isValid(id)) {
        viewUser = await User.findById(id);
    }
    // 2. ถ้าไม่เจอ หรือ ID ที่ส่งมาเป็นรหัสนักศึกษา/อาจารย์ (username) ให้หาด้วย username แทน
    if (!viewUser) {
        const cleanId = id.replace(" (Pending)", ""); // ลบ Pending ออกเผื่อมีติดมา
        viewUser = await User.findOne({ username: cleanId });
    }
    if (!viewUser) {
        return res.status(404).send("ไม่พบข้อมูลผู้ใช้งาน");
    }

    // แปลงข้อมูลเป็น Object เพื่อเพิ่มตัวแปรพิเศษ
    let viewUserData = viewUser.toObject ? viewUser.toObject() : viewUser;
    
    // ค้นหากลุ่มทั้งหมดที่ผู้ใช้เคยอยู่ หรืออยู่ปัจจุบัน
    const userGroups = await Group.find({ 
        $or: [
            { allMember: { $in: [viewUserData.username] } },
            { member1: viewUserData.username },
            { member2: viewUserData.username },
            { member2: `${viewUserData.username} (Pending)` },
            { advisor: viewUserData.username },
            { advisor: `${viewUserData.username} (Pending)` }
        ]
    }).sort({ _id: -1 }).lean();
    
    let pastGroups = (viewUserData.pastGroups || []).map(pg => ({
        _id: pg.groupId,
        projectName: pg.projectName,
        engName: pg.engName,
        joinedAt: pg.joinedAt,
        leftAt: pg.leftAt
    }));
    let currentGroup = null;

    userGroups.forEach(g => {
        // เช็คว่าปัจจุบันยังอยู่ในกลุ่มนี้ไหม
        if (g.member1 === viewUserData.username || 
            g.member2 === viewUserData.username || 
            g.member2 === `${viewUserData.username} (Pending)` ||
            g.advisor === viewUserData.username ||
            g.advisor === `${viewUserData.username} (Pending)`
        ) {
            if (g.status === "ผ่านการสอบป้องกันปริญญานิพนธ์" || g.status.includes("ไม่ผ่าน")) {
                const isDuplicate = pastGroups.some(pg => pg._id && pg._id.toString() === g._id.toString());
                if (!isDuplicate) {
                    pastGroups.push({ _id: g._id, projectName: g.projectName, engName: g.engName, joinedAt: g.createdAt, leftAt: g.updatedAt || new Date() });
                }
            } else {
                if (!currentGroup) currentGroup = g;
            }
        }
    });

    // หากเป็นนักศึกษา ให้ค้นหาสถานะโครงงานล่าสุดมาแสดง
    if (viewUserData.role === 'user') {
        if (currentGroup) {
            viewUserData.displayStatus = currentGroup.status;
        } else {
            viewUserData.displayStatus = viewUserData.status || "ไม่มีกลุ่ม";
        }
    }

    renderWithLayout(res, "viewProfile", { 
        title: "KMUTNB Project - View Profile", 
        viewUser: viewUserData,
        currentGroup: currentGroup,
        pastGroups: pastGroups
    }, req.path, req);
  } catch (err) {
    console.error("Error loading user profile:", err);
    return res.status(500).send("เกิดข้อผิดพลาดในการโหลดโปรไฟล์");
  }
});

app.get("/reportIssue", requireLogin, (req, res) => {
  renderWithLayout(res, "reportIssue", { title: "KMUTNB Project - แจ้งปัญหาการใช้งาน" }, req.path, req);
});

app.post("/api/reportIssue", apiLimiter, requireLogin, async (req, res) => {
    try {
        const { subject, description } = req.body;
        if (!subject || !description) {
            return res.status(400).json({ success: false, message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
        }

        const username = req.session.user.username;
        const name = req.session.user.name;

        // 1. หาแอดมินทั้งหมด
        const admins = await User.find({ role: 'admin' });
        const adminUsernames = admins.map(a => a.username);

        // 2. ส่งแจ้งเตือนแบบ In-app ไปยังแอดมินทุกคน
        if (adminUsernames.length > 0) {
            const noti = new Notification({
                recipient: adminUsernames,
                senderUsername: username,
                senderName: name,
                type: 'new_alert',
                text: `แจ้งปัญหา: ${subject} จาก ${name}`,
                isRead: false
            });
            await noti.save();

            adminUsernames.forEach(admin => {
                io.to(admin).emit("new_notification", {
                    recipient: adminUsernames,
                    _id: noti._id,
                    senderName: name,
                    text: `แจ้งปัญหา: ${subject} จาก ${name}`,
                    type: 'new_alert',
                    senderPic: req.session.user.picture || null
                });
            });
        }

        // 3. (Optional) ส่งอีเมลแจ้งเตือนแอดมิน
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
                tls: { rejectUnauthorized: false }
            });
            const mailOptions = {
                from: `"KMUTNB System" <${process.env.EMAIL_USER}>`,
                to: process.env.EMAIL_USER, // ส่งหาอีเมลระบบเอง
                subject: `🚨 แจ้งปัญหาการใช้งานระบบ: ${subject}`,
                html: `<h3>มีการแจ้งปัญหาการใช้งานใหม่</h3>
                       <p><strong>ผู้แจ้ง:</strong> ${name} (${username})</p>
                       <p><strong>หัวข้อ:</strong> ${escapeHTML(subject)}</p>
                       <p><strong>รายละเอียด:</strong><br/>${escapeHTML(description).replace(/\n/g, '<br>')}</p>`
            };
            await transporter.sendMail(mailOptions).catch(e => console.warn("Email alert failed:", e.message));
        }

        await createLog(req, "REPORT_ISSUE", { subject });
        res.json({ success: true, message: "ส่งการแจ้งปัญหาถึงผู้ดูแลระบบเรียบร้อยแล้ว" });
    } catch (err) {
        console.error("❌ Report Issue Error:", err);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการส่งข้อมูล" });
    }
});

app.get("/api/message", (req, res) => {
  res.json({ message: "Hello from Node.js API!" });
});
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error(err);
      return res.status(500).send('Logout failed');
    }
    res.clearCookie('connect.sid'); // 💡 ล้างไฟล์ Cookie ในเครื่อง User ออกไปด้วย
    res.redirect('/login'); // 💡 ส่งกลับไปหน้า login
  });
});

app.post("/login" , authLimiter,async (req, res) => {
  const { username, password ,rememberMe} = req.body;
  const user = await User.findOne({ username });

  if (!user) {
    req.session.failModal = "user"; // ตั้งค่าเพื่อแสดง modal
    return req.session.save(() => res.redirect("/login"));
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    req.session.failModal = "password"; // ตั้งค่าเพื่อแสดง modal
    req.session.inputUsername = username; // เก็บ username ไว้
    return req.session.save(() => res.redirect("/login"));
  }
  
  // 🛡️ ป้องกัน Session Fixation Attack โดยสร้าง Session ID ใหม่หลังล็อกอินสำเร็จ
  req.session.regenerate(async (err) => {
    if (err) return res.status(500).send("Session error");

    req.session.user = {
      username: user.username,
      title: user.title,
      name: user.name,
      lastname: user.lastname,
      role: user.role,
      email: user.email,
      phone: user.phone,
      // 💡 บรรทัดสำคัญ: ป้องกันค่า null/undefined จาก Database
      group: Array.isArray(user.group) ? user.group : (user.group ? [user.group] : []), 
      picture: user.picture && user.picture.id ? user.picture.id.toString() : null
    };

    if (rememberMe === "on") {
      // ถ้าติ๊ก Remember Me ให้ Cookie อยู่ได้ 30 วัน
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      req.session.cookie.maxAge = thirtyDays;
    } else {
      // ถ้าไม่ติ๊ก ให้ Cookie ตายเมื่อปิด Browser
      req.session.cookie.expires = false;
    }

    await createLog(req, "LOGIN", { 
          username: req.session.user.username
      });

    return res.redirect("/");
  });
});

// ค้นหาผู้ใช้ (ยกเว้นตัวเอง)
app.get("/search-users", requireLogin, async (req, res) => {
  const keyword = req.query.keyword || "";
  // ทำการ Escape อักขระพิเศษของ Regex เพื่อป้องกัน ReDoS Attack
  const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const users = await User.find({
      $and: [
        { username: { $ne: req.session.user.username } }, // ไม่เอาตัวเอง
        { role: "user" }, // ไม่เอาอาจารย์
        { lastname: { $ne: "Registration"} },
        { name: { $ne: "Pending"}}, // ไม่เอาบัญชีที่รอการลงทะเบียน
        {
          $or: [
                { username: { $regex: safeKeyword, $options: "i" } },
                { name: { $regex: safeKeyword, $options: "i" } },
                { lastname: { $regex: safeKeyword, $options: "i" } }
          ]
        }
      ]
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/search-advisor", requireLogin, async (req, res) => {
  const keyword = req.query.keyword || "";
  const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const users = await User.find({
      $and: [
        { username: { $ne: req.session.user.username } }, // ไม่เอาตัวเอง
        { role: { $nin: ["user"] } }, // เอาอาจารย์
        {
          $or: [
                { username: { $regex: safeKeyword, $options: "i" } },
                { name: { $regex: safeKeyword, $options: "i" } },
                { lastname: { $regex: safeKeyword, $options: "i" } }
          ]
        }
      ]
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});


// ✅ บันทึกกลุ่มใหม่
app.post("/groups", apiLimiter,requireLogin, async (req, res) => {
    let {projectName,member1,engName} = req.body;
  try {
    const {member2, advisor} = req.body;

    projectName = projectName ? projectName.trim() : "";
    member1 = member1 ? member1.trim() : "";
    engName = engName ? engName.trim() : "";

    const status = "ไม่มีอาจารย์ที่ปรึกษา";

    let existingGroup;

    if (!projectName||!engName||!member1) {
      return res.status(400).send("ข้อมูลไม่ครบ");
    }

    // ตรวจสอบว่ามีใครอยู่ในกลุ่มแล้วหรือยัง
    if(member2 != null && member2 !== "" && member2 !== "undefined"){
      existingGroup = await Group.findOne({
      $or: [
        { member1: member1 },
        { member2: member2 }
      ]
    });
  } else {
      existingGroup = await Group.findOne({
      $or: [
        { member1: member1 }
      ]
    });
  }

    if (existingGroup) {
      return res.status(400).send("สมาชิกนี้มีกลุ่มอยู่แล้ว");
    }

    const mem1 = await User.findOne({ username: member1 });

    const mem2 = member2 === null || member2 === "" || member2 === "undefined" ? null : `${member2} (Pending)`;

    const adv = advisor === null || advisor === "" || advisor === "undefined" ? null : `${advisor} (Pending)`;

    // บันทึกกลุ่มใหม่
    const newGroup = new Group({ projectName, engName, member1: member1, member2: mem2 , advisor : adv,status , allMember: [member1]});
    await newGroup.save();

    // ✅ สร้างกล่อง "ส่งเอกสารได้ตลอดเวลา" ทันทีที่สร้างกลุ่มสำเร็จ
    const newPaper = new Paper({
        eventId: "default",
        groupId: newGroup._id,
        mention: "สามารถส่งเอกสารได้ตลอดเวลา",
        passTimes: 0,
        date: new Date('2099-12-31')
    });
    await newPaper.save();

    const expireTime = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000); // กำหนดเวลาหมดอายุ (120 วัน)

    sendGroupNotification("addGroup", newGroup._id, "ระบบ", "ระบบ", `คุณถูกเพิ่มเข้ากลุ่มโดย ${mem1.name}`, null, null , expireTime , null ,  member2 , advisor)

    await User.findOneAndUpdate(
      { username: member1 }, // หรือฟิลด์สำหรับค้นหาผู้ใช้ เช่น { username: member1 }
      { $set: { group: [newGroup._id], currentGroupJoinedAt: new Date() } }
    );

    // อัปเดต session.user.group = "true"
    req.session.user.group = [newGroup._id];

    res.status(201).send("บันทึกกลุ่มสำเร็จ");
  } catch (err) {
    console.error("❌ Error saving group:", err);
    return res.status(500).send("เกิดข้อผิดพลาดในการบันทึกกลุ่ม");
  }
  await createLog(req, "CREATE_GROUP", { 
        groupName: projectName,
        createBy: member1 // ดึงชื่อกิจกรรมมาเก็บไว้ดูย้อนหลังได้
    });
});


app.post("/group/accept-invitation/:groupId/:notiId", apiLimiter,requireLogin, async (req, res) => {
  try {
    const { groupId, notiId } = req.params;
    const username = req.session.user.username;
    const userRole = req.session.user.role;
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).send("ไม่พบกลุ่ม");
    }

    let user = await User.findOne({ username: username }); // ดึงข้อมูลผู้ใช้จาก DB เพื่อความแน่นอน

    // ตรวจสอบว่ามีคนอื่นมาเสียบแทนไปก่อนหรือยังแยกตามตำแหน่ง
    if (user.role === "teacher" || user.role === "admin") {
      if (group.advisor && group.advisor !== `${username} (Pending)`) {
        return res.status(400).send("กลุ่มนี้มีอาจารย์ที่ปรึกษาแล้ว");
      }
      group.advisor = username;
      if (!group.allMember.includes(username)) {
          group.allMember.push(username);
      }
      group.status = group.passTimes === 0 ? "รอนำเสนอหัวข้อ" : "ผ่านการสอบหัวข้อปริญญานิพนธ์";
    } else {
      if (group.member2 && group.member2 !== `${username} (Pending)`) {
        return res.status(400).send("กลุ่มนี้มีสมาชิกครบแล้ว");
      }
      group.member2 = username;
      if (!group.allMember.includes(username)) {
          group.allMember.push(username);
      }
    }
    await group.save();

    //แก้ recipient เอา username ออกจาก array recipients ใน DB แต่ถ้าไมมี recipient ก็ลบเอกสารนั้นทิ้งไปเลย

    let noti = await Notification.findById(notiId);
    if (noti) {
        noti.recipient.pull(username);
        if (noti.recipient.length === 0) {
            await Notification.findByIdAndDelete(notiId);
        } else {
            await noti.save();
        }
    }
    
    let updatedUser;
    if (req.session.user.role !== "teacher" && req.session.user.role !== "admin") {
        updatedUser = await User.findOneAndUpdate(
            { username: username },
            { $set: { group: [group._id], currentGroupJoinedAt: new Date() } },
            { new: true } // ✅ คืนค่าที่อัปเดตแล้วกลับมา
        );
    } else {
        updatedUser = await User.findOneAndUpdate(
            { username: username },
            { $addToSet: { group: group._id }, $set: { currentGroupJoinedAt: new Date() } },
            { new: true } // ✅ คืนค่าที่เพิ่มกลุ่มใหม่เข้าไปแล้วกลับมา
        );
    }

    // 4. อัปเดต Session และบันทึกให้เสร็จก่อนตอบกลับ
    req.session.user.group = updatedUser.group;
    
    req.session.save((err) => {
      if (err) {
        console.error("❌ Session Save Error:", err);
        return res.status(500).send("เกิดข้อผิดพลาดในการบันทึกข้อมูลเซสชัน");
      }
      // ส่ง Response กลับเมื่อบันทึก Session เสร็จชัวร์ๆ แล้วเท่านั้น
      res.status(200).send("เข้าร่วมกลุ่มสำเร็จ");
    });

  } catch (err) {
    console.error("❌ Error accepting invitation:", err);
    return res.status(500).send("เกิดข้อผิดพลาดในการเข้าร่วมกลุ่ม");
  }
  await createLog(req, "ACCEPT_INVITATION", { 
        username: req.session.user.username,
        type: "accept" // ดึงชื่อกิจกรรมมาเก็บไว้ดูย้อนหลังได้
    });
});

app.post("/group/deny-invitation/:groupId/:notiId", apiLimiter,requireLogin, async (req, res) => {
  try {
    const { groupId, notiId } = req.params;
    const group = await Group.findById(groupId);
    
    if (!group) return res.status(404).send("ไม่พบกลุ่ม");

    const username = req.session.user.username;

    // ✅ 1. ล้างชื่อสมาชิกคนที่ 2 ออกเพื่อให้กลุ่มว่าง
    if(group.member2 && group.member2 === `${username} (Pending)`){
        group.member2 = null;
    }else if(group.advisor && group.advisor === `${username} (Pending)`){
        group.advisor = null;
    }
    await group.save();

    // ✅ 2. ลบการแจ้งเตือนทิ้งเพื่อให้หายไปจากหน้าจอผู้ใช้
    let noti = await Notification.findById(notiId);
    if (noti) {
        noti.recipient.pull(username);
        if (noti.recipient.length === 0) {
            await Notification.findByIdAndDelete(notiId);
        } else {        
            await noti.save();
        }
    }

    // ✅ 3. อัปเดต Session ของผู้ใช้ที่กดปฏิเสธให้กลับเป็นไม่มีกลุ่ม (null)
    
    req.session.save(() => {
        res.status(200).send("ปฏิเสธเรียบร้อย");
    });
  } catch (err) {
    console.error("❌ Error denying invitation:", err);
    return res.status(500).send("เกิดข้อผิดพลาดในการปฏิเสธ");
  }
  await createLog(req, "DENY_INVITATION", { 
        username: req.session.user.username,
        type: "deny" // ดึงชื่อกิจกรรมมาเก็บไว้ดูย้อนหลังได้
    });
});

app.post("/groups-update/:groupId", apiLimiter,requireLogin, async (req, res) => {
    let group;
  try {
    const { member2, advisor ,name,engName} = req.body;
    const { groupId } = req.params;

    const expireTime = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000); // กำหนดเวลาหมดอายุ (120 วัน)

     group = await Group.findById(groupId);
    if (!group) return res.status(404).send("ไม่พบข้อมูลกลุ่ม");

    const inviter = await User.findOne({ username: req.session.user.username });

    const mem2 = group.member2;
    const adv = group.advisor;

    const member2Info = member2 ? await User.findOne({username: member2}) : null;


    let addedMember2 = null;
    let addedAdvisor = null;

    if (!mem2 && member2) {
        group.member2 = `${member2} (Pending)`;
        addedMember2 = member2;
    }else if(mem2 && mem2.includes("Pending") && member2){
        return res.status(404).send("มีคำเชิญสมาชิกคนที่ 2 อยู่แล้ว")
    }else if(member2Info && Array.isArray(member2Info.group) && member2Info.group.length > 0 && member2 && member2Info.group[0] && groupId !== member2Info.group[0].toString()){
        return res.status(404).send("ผู้ใช้คนนี้มีกลุ่มอยู่แล้ว")
    }

    if (!adv && advisor) {
        group.advisor = `${advisor} (Pending)`;
        addedAdvisor = advisor;
    }else if(adv && adv.includes("Pending") && advisor){
        return res.status(404).send("มีคำเชิญอาจารย์ที่ปรึกษาอยู่แล้ว")
    }

    group.projectName = name;
    group.engName = engName;

    await group.save();

    // แจ้งเตือนเฉพาะคนที่มีการเชิญใหม่เท่านั้น
    if (addedMember2 || addedAdvisor) {
        await sendGroupNotification(
          "addGroup", groupId, "ระบบ", "ระบบ", 
          `คุณถูกเพิ่มเข้ากลุ่มโดย ${inviter.name || 'หัวหน้ากลุ่ม'}`, 
          null, null, expireTime, null, 
          addedMember2, 
          addedAdvisor
        );
    }

    res.status(201).send("ส่งคำเชิญกลุ่มสำเร็จ");
  } catch (err) {
    console.error("❌ Error:", err);
    return res.status(500).send("เกิดข้อผิดพลาด: " + err.message);
  }
    await createLog(req, "UPDATE_GROUP", {
        groupName: group ? group.projectName : "Unknown Group",
        updateBy: req.session.user.username 
    });
});

/*app.post("/groups/activate-add-member", requireLogin, async (req, res) => {
  try {
    req.session.user.group = "false"; // อัปเดตค่า session
    req.session.user.canAddMember = "true"; // อนุญาตเพิ่มสมาชิก
    req.session.save((err) => {
      if (err) {
        console.error("❌ Error saving session:", err);
        return res.status(500).send("เกิดข้อผิดพลาดในการบันทึก session");
      }
      res.status(200).send("อัปเดต session สำเร็จ");
    });
  } catch (err) {
    console.error("❌ Error:", err);
    return res.status(500).send("เกิดข้อผิดพลาดที่ server");
  }
});*/

app.post("/groups/leave/:groupId", apiLimiter,async (req, res) => {
    let group;
  try {
    const groupId = req.params.groupId;

     if (!groupId || groupId === "null" || groupId === "undefined") {
      return res.status(400).send("Group ID ไม่ถูกต้อง");
    }

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).send("Group ID ไม่ถูกต้อง");
    }

    const username = req.session.user.username; // สมมติใน session มี username

    group = await Group.findById(groupId);
    if (!group) return res.status(404).send("ไม่พบกลุ่ม");

    // ✅ ตรวจสอบสถานะว่าต้องขออนุมัติหรือไม่ (ถ้าเป็น user และสถานะไม่ใช่รอนำเสนอหัวข้อ และไม่ใช่ไม่มีอาจารย์ที่ปรึกษา)
    if (req.session.user.role === 'user' && group.status !== 'รอนำเสนอหัวข้อ' && group.status !== 'ไม่มีอาจารย์ที่ปรึกษา' && group.advisor) {
        const advisorClean = group.advisor.replace(" (Pending)", "");
        
        // ป้องกันการส่งคำขอซ้ำ
        const existingNoti = await Notification.findOne({
            type: 'leave_group_request',
            group: groupId,
            senderUsername: username
        });
        if (existingNoti) {
            return res.status(400).send("คุณได้ส่งคำขอออกกลุ่มไปแล้ว กรุณารออาจารย์ที่ปรึกษาอนุมัติ");
        }

        const newNoti = new Notification({
            recipient: [advisorClean],
            senderUsername: username,
            senderName: req.session.user.name,
            type: 'leave_group_request',
            group: groupId,
            text: `นักศึกษา ${req.session.user.name} ขออนุมัติออกจากกลุ่ม ${group.projectName}`,
            isRead: false
        });
        await newNoti.save();
        
        await createLog(req, "REQUEST_LEAVE_GROUP", { groupName: group.projectName, requestBy: username });
        return res.status(200).send("REQUEST_SENT"); // ให้หน้าบ้านรู้ว่าต้องรออนุมัติ
    }

    // ตรวจสอบว่า user อยู่ field ไหน
    if (group.member1 === username) {
      group.member1 = group.member2; // เลื่อน member2 ขึ้นมาแทนที่
      group.member2 = null; // ล้าง member2
    } else if (group.member2 === username) {
      group.member2 = null;
    }  else if (group.advisor === username) {
      group.advisor = null;
      group.status = "ไม่มีอาจารย์ที่ปรึกษา";
    } else {
      return res.status(400).send("คุณไม่ได้อยู่ในกลุ่มนี้");
    }

    if(group.member1 === null && !group.status.includes("ไม่ผ่าน")){
      group.status = "ไม่มีสมาชิก";
    }

    await group.save();

    const currentUser = await User.findOne({ username });
    const joinedAt = currentUser.currentGroupJoinedAt || group.createdAt;

    const pastGroupData = {
        groupId: group._id,
        projectName: group.projectName,
        engName: group.engName,
        joinedAt: joinedAt,
        leftAt: new Date()
    };

    let updatedUser;
    // อัปเดต User ด้วย (ถ้า User มี field group)
    if (req.session.user.role !== "teacher" && req.session.user.role !== "admin"){
        updatedUser = await User.findOneAndUpdate(
        { username },
        { 
            $set: { group: [], currentGroupJoinedAt: null },
            $push: { pastGroups: pastGroupData }
        },
        { new: true }
        );
    }else{
        updatedUser = await User.findOneAndUpdate(
        { username },
        { 
            $pull: { group: groupId },
            $push: { pastGroups: pastGroupData }
        },
        { new: true }
        );
    }

    // อัปเดต session
    req.session.user.group = updatedUser.group;
    req.session.save((err) => {
        if (err) {
            console.error("❌ Session Save Error:", err);
            return res.status(500).send("เกิดข้อผิดพลาดในการบันทึกข้อมูลเซสชัน");
        }
        res.send("ออกจากกลุ่มสำเร็จ");
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("เกิดข้อผิดพลาดที่ server");
  }
    await createLog(req, "LEAVE_GROUP", {
        groupName: group ? group.projectName : "Unknown Group",
        leaveBy: req.session.user.username // ดึงชื่อกิจกรรมมาเก็บไว้ดูย้อนหลังได้
    });
});

// ✅ เส้นทางสำหรับให้อาจารย์อนุมัติการออกจากกลุ่ม
app.post("/group/accept-leave/:groupId/:notiId/:targetUser", apiLimiter, requireLogin, async (req, res) => {
    try {
        const { groupId, notiId, targetUser } = req.params;
        const group = await Group.findById(groupId);

        if (group) {
            // ถอดชื่อผู้ใช้ออกจากกลุ่ม
            if (group.member1 === targetUser) {
                group.member1 = group.member2;
                group.member2 = null;
            } else if (group.member2 === targetUser) {
                group.member2 = null;
            }

            if (group.member1 === null && !group.status.includes('ไม่ผ่าน')) {
                group.status = 'ไม่มีสมาชิก';
            }

            if (group.allMember) {
                group.allMember = group.allMember.filter(m => m !== targetUser);
            }
            await group.save();

            // อัปเดตข้อมูลนักศึกษาที่ถูกถอดออก
            const currentUser = await User.findOne({ username: targetUser });
            if (currentUser) {
                const joinedAt = currentUser.currentGroupJoinedAt || group.createdAt;
                await User.findOneAndUpdate(
                    { username: targetUser },
                    { 
                        $set: { group: [], currentGroupJoinedAt: null },
                        $push: { pastGroups: { groupId: group._id, projectName: group.projectName, engName: group.engName, joinedAt: joinedAt, leftAt: new Date() } }
                    }
                );
            }
        }
        await Notification.findByIdAndDelete(notiId);
        res.status(200).send("อนุมัติการออกจากกลุ่มสำเร็จ");
    } catch (err) {
        res.status(500).send("เกิดข้อผิดพลาดในการอนุมัติ");
    }
});

// ✅ เส้นทางสำหรับปฏิเสธการขอออกกลุ่ม
app.post("/group/deny-leave/:groupId/:notiId/:targetUser", apiLimiter, requireLogin, async (req, res) => {
    try {
        await Notification.findByIdAndDelete(req.params.notiId);
        res.status(200).send("ปฏิเสธการออกจากกลุ่มเรียบร้อย");
    } catch (err) {
        res.status(500).send("เกิดข้อผิดพลาดในการปฏิเสธ");
    }
});

app.get("/addGroup", requireLogin, requireNotRole(["secretary"]), async (req, res) => {
  if(req.session.user && Array.isArray(req.session.user.group) && req.session.user.group.length > 0){
      return res.redirect("/group");
  }
  try{
    const group = await Group.findOne({
      $or: [
        { member1: req.session.user.username },
        { member2: req.session.user.username }
      ]
    });

    const username = req.session.user.username;
    const groups = await Group.find({
      $or: [
        { member1: username },
        { member2: username },
        { advisor: username }
      ]
    });

    let userInfo = [];

    if (groups.length > 0) {
      const mem1 = await User.findOne({username: groups[0].member1});
      const mem2 = await User.findOne({username: groups[0].member2});
      const adv = await User.findOne({username: groups[0].advisor});
      userInfo = [mem1, mem2, adv];
    }

  renderWithLayout(res, "addGroup", { 
      title: "KMUTNB Project - Group",
      groups,
      user: req.session.user
    }, req.path,req);
    }catch(err){
    console.error("❌ Error deleting news:", err);
    return res.status(500).send("Error loading groups");
  }
});

app.get("/updateGroup", requireLogin, requireRole(["user"]), async (req, res) => {
  try {
    const username = req.session.user.username;
    
    // 1. ดึงกลุ่มของผู้ใช้
    const groups = await Group.find({
      $and: [
        {
          $or: [
            { member1: username },
            { member2: username },
          ]
        },
        { status: { $nin: ["ผ่านการสอบป้องกันปริญญานิพนธ์", "ไม่ผ่านการสอบป้องกันปริญญานิพนธ์", "ไม่ผ่านการสอบหัวข้อปริญญานิพนธ์", "ไม่มีสมาชิก"] } }
      ]
    });

    // 2. ถ้าไม่พบกลุ่ม ให้ Redirect หรือส่งค่าว่างไปป้องกันการ Crash
    if (!groups || groups.length === 0) {
      return res.redirect("/group"); // หรือส่ง [] ไปที่ render
    }

    let userInfo = [];
    const targetGroup = groups[0];

    // 3. ดึงข้อมูลสมาชิกด้วยความระมัดระวัง
    const mem1 = await User.findOne({ username: targetGroup.member1 });
    
    // เช็คกรณี member2 อาจจะเป็นค่าว่าง หรือเป็น String "(Pending)"
    let mem2 = null;
    let mem2Username = String(targetGroup.member2);
    if (targetGroup.member2) {
        // ลบคำว่า (Pending) ออกก่อนค้นหาใน DB ถ้ามีการเก็บแบบต่อท้าย string
        const cleanM2Username = targetGroup.member2.replace(" (Pending)", "");
        const user2 = await User.findOne({ username: cleanM2Username });
        
        if (mem2Username.includes("(Pending)")) {
            mem2 = user2 ? { ...user2.toObject(), lastname: `${user2.lastname} (Pending)` } : null;
        } else {
            mem2 = user2;
        }
    }

    let adv = null;
    let advUsername = String(targetGroup.advisor);
    if (targetGroup.advisor) {
        // ลบคำว่า (Pending) ออกก่อนค้นหาใน DB ถ้ามีการเก็บแบบต่อท้าย string
        const cleanAdUsername = targetGroup.advisor.replace(" (Pending)", "");
        const advisor = await User.findOne({ username: cleanAdUsername });
        
        if (advUsername.includes("(Pending)")) {
            adv = advisor ? { ...advisor.toObject(), lastname: `${advisor.lastname} (Pending)` } : null;
        } else {
            adv = advisor;
        }
    }

    userInfo = [mem1, mem2, adv];

    renderWithLayout(res, "updateGroup", { 
      title: "KMUTNB Project - Update Group", 
      groups, 
      userInfo 
    }, req.path, req);

  } catch (err) {
    console.error("❌ Crash in /updateGroup:", err);
    return res.status(500).send("เกิดข้อผิดพลาดในการโหลดข้อมูลกลุ่ม");
  }
});

app.get("/image/:id", async (req, res) => {
    try {
        const { id } = req.params;
        // ใช้ mongoose.Types.ObjectId.isValid เพื่อตรวจสอบ ID
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).send("Invalid file ID");
        }

        const fileId = new mongoose.Types.ObjectId(id);
        const files = await bucket.find({ _id: fileId }).toArray();
        if (!files || files.length === 0) {
            return res.status(404).send("Image not found");
        }

        // ตั้งค่า Content-Type เพื่อให้ Browser แสดงรูปภาพโดยตรง
        res.set("Content-Type", files[0].contentType); 
        bucket.openDownloadStream(fileId).pipe(res);
    } catch (err) {
        console.error("Error streaming news image:", err);
        return res.status(500).send("Error streaming image");
    }
});

app.post("/profile/update", requireLogin, apiLimiter,upload.single("profileImage"), async (req, res) => {
    try {
        const { email, phone } = req.body;
        const username = req.session.user.username;

        // 1. ดึงข้อมูล User ปัจจุบันมาเพื่อตรวจสอบไฟล์เดิม
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: "ไม่พบผู้ใช้งาน" });

        // 2. เตรียมข้อมูลพื้นฐานที่จะอัปเดต (Email, Phone)
        let updateFields = { email, phone };

        // 3. ตรวจสอบว่ามีการอัปโหลด "ไฟล์ใหม่" มาหรือไม่
        if (req.file) {
            // --- กรณีมีการเลือกรูปใหม่ ---
            
            // 🛡️ ตรวจสอบความปลอดภัยของรูปภาพด้วย Magic Number
            const safeImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!safeImageTypes.includes(req.file.mimetype) || !isValidImageSignature(req.file.buffer)) {
                return res.status(400).json({ success: false, message: "รองรับเฉพาะไฟล์รูปภาพของจริงเท่านั้น" });
            }
            
            // A. ลบรูปเก่าออกจาก GridFS (ถ้ามี) เพื่อไม่ให้รกเซิร์ฟเวอร์
            if (user.picture && user.picture.id) {
                try {
                    await bucket.delete(new mongoose.Types.ObjectId(user.picture.id));
                } catch (err) {
                    console.warn("⚠️ ไม่สามารถลบไฟล์เก่าได้ (อาจไม่มีไฟล์จริง):", err.message);
                }
            }

            // B. บันทึกรูปใหม่ลง GridFS
            const uploadStream = bucket.openUploadStream(req.file.originalname, {
                contentType: req.file.mimetype,
            });

            await new Promise((resolve, reject) => {
                uploadStream.once('finish', resolve);
                uploadStream.once('error', reject);
                uploadStream.end(req.file.buffer);
            });

            // C. เพิ่มข้อมูลรูปใหม่เข้าไปในรายการที่จะอัปเดต
            updateFields.picture = {
                filename: req.file.originalname,
                contentType: req.file.mimetype,
                id: uploadStream.id
            };

            // อัปเดต ID รูปใน Session สำหรับแสดงผล
            req.session.user.picture = uploadStream.id.toString();
        } 
        // --- ถ้าไม่มี req.file (ไม่ได้เลือกรูปใหม่) ---
        // เราจะไม่ใส่ฟิลด์ picture ลงใน updateFields 
        // ทำให้ MongoDB ไม่ไปเขียนทับข้อมูลรูปภาพเดิมใน Database

        // 4. บันทึกการเปลี่ยนแปลง
        await User.findOneAndUpdate({ username }, { $set: updateFields });

        // อัปเดต Session ข้อมูลอื่นๆ
        req.session.user.email = email;
        req.session.user.phone = phone;

        req.session.save((err) => {
            if (err) throw err;
            res.status(200).json({ success: true, message: "อัปเดตโปรไฟล์สำเร็จ" });
        });

    } catch (err) {
        console.error("❌ Profile Update Error:", err);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการอัปเดต" });
    }
    await createLog(req, "UPDATE_PROFILE", { 
        username: req.session.user.username,
    });
});

app.get("/addUser",requireLogin,requireRole(['admin']) ,(req, res) => {
  renderWithLayout(res, "addUser", { title: "KMUTNB Project - Add User" }, req.path,req);
});

app.get("/addUserExcel",requireLogin,requireRole(['admin']),(req, res) => {
  renderWithLayout(res, "addUserExcel", { title: "KMUTNB Project - Add User Excel" }, req.path,req);
});

app.get("/addUserSingle",requireLogin,requireRole(['admin']),(req, res) => {
  renderWithLayout(res, "addUserSingle", { title: "KMUTNB Project - Add User Single" }, req.path,req);
});

// API สำหรับเพิ่มผู้ใช้รายคน
app.post("/api/addUserSingle", apiLimiter,requireLogin , async (req, res) => {
    // 🛡️ เช็คสิทธิ์ Admin
    if (req.session.user.role !== "admin") {
        return res.status(403).json({ success: false, error: "สิทธิ์ไม่เพียงพอ" });
    }

    try {
        // 1. รับค่าจาก req.body (ชื่อต้องตรงกับ JSON ที่ส่งมาจากหน้าบ้าน)
        const { titleText, name, lastname, username, role } = req.body;

        // 2. ตรวจสอบข้อมูลเบื้องต้น
        if (!titleText || !name || !lastname || !username || !role) {
            return res.status(400).json({ success: false, error: "กรุณากรอกข้อมูลให้ครบถ้วน" });
        }

        // 3. ตรวจสอบว่ามี User นี้แล้วหรือยัง
        const existingUser = await User.findOne({ username: username.trim() });
        if (existingUser) {
            return res.status(400).json({ success: false, error: "รหัสผู้ใช้นี้มีอยู่ในระบบแล้ว" });
        }

        // 4. เตรียมข้อมูลก่อนบันทึก
        const PENDING_PASS_STRING = crypto.randomBytes(16).toString('hex');
        const pendingHashedPassword = await bcrypt.hash(PENDING_PASS_STRING, 12);
        const trimmedUsername = String(username).trim();
        const emailGenerated = ("s" + trimmedUsername + "@kmutnb.ac.th").toLowerCase();

        // ✅ ตัดส่วน branch ออกตามที่คุณต้องการ
        const newUser = new User({
            username: trimmedUsername,
            email: emailGenerated,
            password: pendingHashedPassword,
            title: titleText,
            name: name.trim(),
            lastname: lastname.trim(),
            role: role, 
            phone: null, 
            group: [],
            picture: "" // ตั้งเป็นค่าว่างตามที่คุณเคยต้องการ
        });

        await newUser.save();

        res.json({ success: true, message: "เพิ่มผู้ใช้เรียบร้อยแล้ว" });

    } catch (err) {
        console.error("❌ Add User Error:", err);
        res.status(500).json({ success: false, error: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์" });
    }
    await createLog(req, "ADD_USER_SINGLE", { 
        username: req.session.user.username,
        addedUser: req.body.username // ดึงชื่อผู้ใช้ที่ถูกเพิ่มมาเก็บไว้ดูย้อนหลังได้
    });
});

app.post('/api/excel-upload', apiLimiter,requireLogin, upload.single('file'), async (req, res) => {
    // 💡 เนื่องจากใช้ multer.memoryStorage() เราจะใช้ req.file.buffer
    if (!req.file) {
        return res.status(400).json({ error: 'No Excel file uploaded.' });
    }

    const fileName = req.file.originalname.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
        return res.status(400).json({ error: 'ระบบต้องการไฟล์ Excel เท่านั้น' });
    }

    try {
        // 1. ประมวลผลและอ่านข้อมูลจาก Buffer
        const excelData = processExcelFile(req.file.buffer); 
        
        // 2. บันทึกข้อมูลลง MongoDB
        const result = await saveUsersFromExcel(excelData);

        // ❌ ไม่ต้องลบไฟล์ชั่วคราว เพราะถูกเก็บในหน่วยความจำ

        res.status(200).json({ 
            success: true,
            message: 'Excel data saved to MongoDB successfully.',
            insertedCount: result.insertedCount
        });

    } catch (error) {
        // 3. จัดการ Error
        console.error("❌ Excel upload error:", error);
        res.status(500).json({ 
            error: 'Failed to process or save data to MongoDB.', 
            details: error.message 
        });
    }
});

app.get("/register", checkFailModal ,async (req, res) => {
  renderWithLayout(res, "register", { title: "KMUTNB Project - Register" ,failModal: res.locals.failModal}, req.path,req);
});

app.post("/register", authLimiter, upload.single("profileImage"), async (req, res) => {
  let username = (req.body.username || "").toString().trim();
  try {
    const {password, name, lastname, phone ,passwordConfirm ,email} = req.body;

    username = String(username).trim(); // ตัดช่องว่างรอบๆ ออก

    if (username === "" || password === "" || name === "" || lastname === "" || phone === "") {
      req.session.failModal = "incomplete";
      return req.session.save(() => res.redirect("/register"));
    }

    if (password !== passwordConfirm) {
      req.session.failModal = "mismatch";
      return req.session.save(() => res.redirect("/register"));
    }


    const existingUser = await User.findOne({ username : username });

    let img = {};

    if (req.file) {
        // 1. สร้าง Stream สำหรับอัปโหลด
        const uploadStream = bucket.openUploadStream(req.file.originalname, { 
            contentType: req.file.mimetype,
        });

        // 2. ใช้ Promise ครอบการทำงานทั้งหมด
        await new Promise((resolve, reject) => {
            // สร้าง Readable Stream จาก Buffer แล้ว Pipe เข้าสู่ GridFS
            const { Readable } = require('stream');
            const readableStream = Readable.from(req.file.buffer);

            readableStream.pipe(uploadStream);

            uploadStream.on('finish', () => {
                // ✅ กำหนดค่า img เฉพาะเมื่ออัปโหลดเสร็จสมบูรณ์เท่านั้น
                img = {
                    filename: req.file.originalname,
                    contentType: req.file.mimetype,
                    id: uploadStream.id // GridFS จะเจน ID ให้ตั้งแต่เปิด Stream
                };
                resolve();
            });

            uploadStream.on('error', (err) => {
                console.error("❌ GridFS Upload Error:", err);
                reject(err);
            });
        });
    }

    
    const hashedPassword = await bcrypt.hash(password, 12);

    if (existingUser && existingUser.email && existingUser.phone === null && existingUser.name === name && existingUser.lastname === lastname && existingUser.role !== "teacher" && existingUser.role !== "secretary") {
      await User.findOneAndUpdate(
        { username: username },
        { password: hashedPassword, name, lastname, phone ,picture: req.file ? img : null}
      );
      req.session.successModal = "success";
      req.session.save(() => res.redirect("/login"));
    }else if(existingUser && existingUser.email && existingUser.phone === null && (existingUser.role === "secretary" || existingUser.role === "teacher")){
        await User.findOneAndUpdate(
        { username: username },
        { password: hashedPassword, name, lastname, phone ,email ,picture: req.file ? img : null}
      );
      req.session.successModal = "success";
      req.session.save(() => res.redirect("/login"));
    }else if (!existingUser) {
      req.session.failModal = "not_found"; // เปลี่ยนเป็น not_found เพื่อไม่ให้สับสน
      req.session.save(() => res.redirect("/register"));
    }else{
      req.session.failModal = "complete"; // ตั้งค่าเพื่อแสดง modal
      req.session.save(() => res.redirect("/register"));
    }
  } catch (err) {
    req.session.failModal = "error"; // ตั้งค่าเพื่อแสดง modal
    return req.session.save(() => res.redirect("/register"));
  }
    await createLog(req, "REGISTER", {
        username: username // ดึงชื่อผู้ใช้ที่พยายามลงทะเบียนมาเก็บไว้ดูย้อนหลังได้
    });
});

app.get("/api/notifications/unread", requireLogin, async (req, res) => {
    try {
        const username = req.session.user.username;
        
        // รับค่าหน้าปัจจุบันจาก query string (ถ้าไม่มีให้เป็นหน้า 1)
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5; // โหลดทีละ 5 ตามที่เราตั้งใน JS
        const skip = (page - 1) * limit;

        // 1. ดึงแจ้งเตือนที่มีชื่อเรา หรือส่งถึง 'ALL' พร้อมทำ Pagination
        const notifications = await Notification.find({
            $or: [
                { recipient: username }, 
                { recipient: 'ALL' }
            ]
        })
        .sort({ createdAt: -1 })
        .skip(skip)   // ข้ามรายการที่โหลดไปแล้ว
        .limit(limit) // ดึงมาแค่ตามจำนวนที่กำหนด
        .lean();

        // 2. ดึงรายการ ID ที่คนนี้ "เคยอ่านแล้ว"
        const readRecords = await NotificationRead.find({ userId: username })
            .distinct('notificationId');

        // 3. รวมร่างข้อมูล: เช็คสถานะการอ่านรายบุคคล
        const finalNotifications = notifications.map(noti => {
            // เช็คว่า ID ของแจ้งเตือนนี้ อยู่ในรายการที่อ่านแล้วหรือไม่
            const hasRead = readRecords.some(rId => rId.toString() === noti._id.toString());
            return {
                ...noti,
                isRead: hasRead
            };
        });

        res.json(finalNotifications);
    } catch (err) {
        console.error("❌ Error loading notifications:", err);
        res.status(500).json({ error: "Failed to load notifications" });
    }
});

app.post("/api/notifications/mark-read-all", apiLimiter, requireLogin, async (req, res) => {
    try {
        const username = req.session.user.username;
        const { type } = req.body; // รับค่า 'alert' หรือ 'message'

        // 1. กำหนดเงื่อนไขการกรองประเภท (ให้ตรงกับ Logic การนับจำนวนของคุณ)
        let typeFilter;
        if (type === 'alert') {
            typeFilter = { $in: ['group_alert', 'alert_event', 'alert_paper'] };
        } else {
            typeFilter = 'new_message';
        }

        // 2. หาแจ้งเตือนที่ยังไม่ได้อ่าน
        const notifications = await Notification.find({
            $or: [
                { recipient: username },
                { recipient: 'ALL' }
            ],
            type: typeFilter
        }).select('_id expireAt');

        if (notifications.length === 0) return res.json({ success: true });

        // 3. บันทึกลง NotificationRead แบบ Bulk
        const ops = notifications.map(noti => ({
            updateOne: {
                filter: { notificationId: noti._id, userId: username },
                update: { $setOnInsert: { readAt: new Date(), expireAt: noti.expireAt } },
                upsert: true
            }
        }));

        await NotificationRead.bulkWrite(ops);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ Mark all read error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/api/notifications/count", requireLogin, async (req, res) => {
    try {
        const username = req.session.user.username;

        // 1. หา ID ทั้งหมดที่เราอ่านแล้ว
        const readIds = await NotificationRead.find({ userId: username }).distinct("notificationId");

        // 2. นับแยกประเภท
        
        // --- แก้ไข Alert: ให้นับรวม ALL และ added_to_group ที่ส่งถึงเรา ---
        const alertUnread = await Notification.countDocuments({
            $or: [
                { recipient: 'ALL' },
                { recipient: username, type: 'added_to_group' },
                { recipient: username, type: 'group_alert' }, // นับการดึงเข้ากลุ่มเป็น Alert
                { recipient: username, type: 'new_alert' },
                { recipient: username, type: 'alert_event' },
                { recipient: username, type: 'alert_paper' },
                { recipient: username, type: 'leave_group_request' }
            ],
            _id: { $nin: readIds }
        });

        // --- Message (คงเดิม หรือเช็คให้ชัวร์ว่าไม่เอา added_to_group มารวม) ---
        const messageUnread = await Notification.countDocuments({
            recipient: username,
            type: 'new_message', // เฉพาะข้อความแชทเท่านั้น
            _id: { $nin: readIds }
        });

        res.json({ alertUnread, messageUnread });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/event", requireLogin,requireNotRole(['secretary']),(req, res) => {
  renderWithLayout(res, "event", { title: "KMUTNB Project - Event" }, req.path,req);
});

app.get("/addEvent", requireLogin,requireRole(['admin']) ,(req, res) => {
  renderWithLayout(res, "addEvent", { title: "KMUTNB Project - Add Event" }, req.path,req);
});

app.post("/api/addEvent", apiLimiter, requireLogin, requireRole(['admin']), upload.single("file"), async (req, res) => {
    try {
        const { title, date, description ,examSchedule} = req.body;
        const file = req.file;
        let missingGroups = [];
        let testData = [];
        let loopCount = 0;


        if (!title) {
            return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
        }

        if(title === "วันส่งเอกสาร" && (!date || date.trim() === '')){
            return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
        }

        const eventId = generateEventId();
        let date1 = date ? new Date(date) : null; 
        let date2 = null;

        // --- ส่วนที่แก้ไข: จัดการไฟล์ Excel เข้า GridFS ---
        let uploadedFileId = null;
        if (file) {
            // สร้าง Stream เพื่ออัปโหลดไฟล์จาก Buffer
            const uploadStream = bucket.openUploadStream(file.originalname, {
                contentType: file.mimetype
            });

            uploadedFileId = uploadStream.id; // ดึง ID มาเตรียมไว้

            await new Promise((resolve, reject) => {
                streamifier.createReadStream(file.buffer).pipe(uploadStream)
                    .on('error', reject)
                    .on('finish', resolve);
            });
        }



        if (title === "วันส่งเอกสาร") {
              // 1. สร้าง bucket เฉพาะกิจตรงนี้เลยเพื่อให้มั่นใจว่าไม่เป็น undefined

              const allGroups = await Group.find({ 
                  status: { $nin: ["ผ่านการสอบป้องกันปริญญานิพนธ์", "ไม่มีสมาชิก" ,"ไม่ผ่านการสอบป้องกันปริญญานิพนธ์","พร้อมสอบนำเสนอหัวข้อปริญญานิพนธ์", "พร้อมสอบก้าวหน้าปริญญานิพนธ์",  "พร้อมสอบป้องกันปริญญานิพนธ์","ไม่มีอาจารย์ที่ปรึกษา"] } 
              });

              for (const group of allGroups) {
                  const [year, month, day] = date.split('-').map(Number);
                  date1 =  new Date(year, month - 1, day);
                    date1.setHours(23, 59, 59, 999);

                  let existingPaper = await Paper.findOne({
                      groupId: group._id,
                      passTimes: group.passTimes,
                      mention: { $not: /จะมีการจัดสอบ/ }
                  });

                  let savedPaper;
                  if (existingPaper) {
                      existingPaper.eventId = eventId;
                      existingPaper.mention = description || title;
                      existingPaper.expireAt = date1;
                      existingPaper.date = date1;
                      savedPaper = await existingPaper.save();
                  } else {
                      const newPaper = new Paper({
                          eventId: eventId,
                          groupId: group._id,
                          mention: description || title,
                          expireAt: date1,
                          passTimes: group.passTimes,
                          date: date1
                      });
                      savedPaper = await newPaper.save(); 
                  }

              }
          } else if (title === "วันสอบ" && examSchedule) {
            try{
                let paperPlatforms = [];
                const parsedSchedule = JSON.parse(examSchedule);
                for (const session of parsedSchedule) {
                    const examDate = session.date;
                    const [year, month, day] = examDate.split('-').map(Number);
                    const finalDate = new Date(year, month - 1, day);
                    loopCount++;
                    if (loopCount === 1) {
                        date1 = new Date(finalDate);
                    }
                    date2 = new Date(finalDate);
                    for (const slot of session.slots) {
                        const totalMinutes = slot.time;     // จาก value ของ selectTime
                        // 1. คำนวณหาชั่วโมงและนาทีจาก totalMinutes
                        const hours = Math.floor(totalMinutes / 60);
                        const minutes = totalMinutes % 60;
                        const finalDateTime = new Date(finalDate);
                        finalDateTime.setHours(hours, minutes, 0, 0);
                        const testresultsdate = new Date(finalDate);
                        testresultsdate.setDate(testresultsdate.getDate() + 7);


                        // 1. หาข้อมูลกลุ่มจาก DB เพื่อเอา id และ advisor (ใช้ findOne เพราะมีกลุ่มเดียว)
                        const group = await Group.findOne({ 
                            $and: [
                                { _id: slot.group },
                                { status: { $in: ["พร้อมสอบนำเสนอหัวข้อปริญญานิพนธ์", "พร้อมสอบก้าวหน้าปริญญานิพนธ์",  "พร้อมสอบป้องกันปริญญานิพนธ์"] }}
                            ]
                        });

                        if (!group) {
                            const missing = await Group.findById(slot.group);
                            if (missing) missingGroups.push(missing.projectName);
                            continue; // ข้ามกลุ่มนี้ไปถ้าสถานะถูกเปลี่ยนไปแล้วและเพิ่มเข้า list กลุ่มที่มีปัญหา
                        }
                        
                        let advisorUsername = null;
                        if (slot.advisor) { // slot.advisor should be the username
                            advisorUsername = slot.advisor;
                        }

                        let greatDirectorUsername = null;
                        if (slot.greatDirector) { // slot.greatDirector should be the username
                            greatDirectorUsername = slot.greatDirector;
                        }

                        let directorUsername = null;
                        if (slot.director) { // slot.director should be an array of usernames
                            directorUsername = slot.director
                        }


                        testData.push({
                            groupName: group.projectName,
                            advisor: advisorUsername,
                            greatDirector: greatDirectorUsername,
                            director: directorUsername,
                            date: finalDateTime,
                        });

                        const paperPassTimes = group.passTimes || 0;

                        // 4. เตรียมข้อมูล Paper สำหรับบันทึก (1 กลุ่มต่อ 1 Card)
                        paperPlatforms.push({
                            eventId: eventId,
                            groupId: group._id,
                            mention: description || title,
                            expireAt: testresultsdate,
                            passTimes: paperPassTimes,
                            date: finalDateTime,
                            advisor: advisorUsername, // Store username
                            greatDirector: greatDirectorUsername, // Store username
                            director: directorUsername // Store array of usernames
                        });
                        const mem1 = await User.findOne({ username: group.member1 });
                        const mem2 = group.member2 ? await User.findOne({ username: group.member2 }) : null;

                        if(group.passTimes === 0){
                            group.status = "รอสอบนำเสนอหัวข้อปริญญานิพนธ์"
                        }else if (group.passTimes >= 1){
                            if(mem1?.branch === "ECT" || mem2?.branch === "ECT"){
                            group.status = "รอสอบก้าวหน้าปริญญานิพนธ์";
                            }else{
                            group.status = "รอสอบป้องกันปริญญานิพนธ์";
                            }
                        }
                        await group.save();
                    }  
                }

                if (paperPlatforms.length > 0) {
                    const savedPapers = await Paper.insertMany(paperPlatforms);
                    for (const savedPaper of savedPapers) {
                        const previousPaper = await Paper.findOne({
                            groupId: savedPaper.groupId,
                            passTimes: savedPaper.passTimes,
                            _id: { $ne: savedPaper._id },
                            mention: { $not: /จะมีการจัดสอบ/ }
                        }).sort({ _id: -1 });

                        if (previousPaper) {
                            const oldFiles = await PaperFile.find({ paperId: previousPaper._id });
                            for (const oldFile of oldFiles) {
                                if (oldFile.file && oldFile.file.fileId) {
                                    try {
                                        const uploadStream = bucket.openUploadStream(oldFile.file.filename, {
                                            contentType: oldFile.file.contentType
                                        });
                                        const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(oldFile.file.fileId));
                                        
                                        await new Promise((resolve, reject) => {
                                            downloadStream.pipe(uploadStream)
                                                .on('error', reject)
                                                .on('finish', resolve);
                                        });

                                        const newPaperFile = new PaperFile({
                                            paperId: savedPaper._id,
                                            groupId: savedPaper.groupId,
                                            file: {
                                                fileId: uploadStream.id,
                                                filename: oldFile.file.filename,
                                                contentType: oldFile.file.contentType
                                            },
                                            check: oldFile.check
                                        });
                                        await newPaperFile.save();
                                    } catch (copyErr) {
                                        console.error("❌ Failed to copy file for exam:", copyErr);
                                    }
                                }
                            }
                        }
                    }
                }
                
            }catch(err){
               return  res.status(500).json({ error: err.message });
            }
        }

        // 🛠️ ป้องกันบั๊ก new Date(null) = 1970 
        // ถ้ามี date2 ใช้ date2, ถ้าไม่มีดู date1, ถ้าไม่มีทั้งคู่ใช้วันปัจจุบัน
        const expire = date2 ? new Date(date2) : (date1 ? new Date(date1) : new Date());
        expire.setHours(23, 59, 59, 999);

        const newEvent = new Event({
            id: eventId,
            title,
            description,
            testData: testData,
            date: date1,
            toDate: date2,
            expireAt: expire,
            fileId: uploadedFileId // 🛠️ เซฟ ID ไฟล์เก็บไว้ (คุณอาจจะต้องเช็คใน Model Event ว่าใช้ชื่อฟิลด์อะไร)
        });

        await newEvent.save();
        // 🔔 เรียกแจ้งเตือน (เช็คให้ชัวร์ว่าลบบั๊กในฟังก์ชันนี้แล้ว)
        await sendGroupNotification('alert', null, req.session.user.username, req.session.user.name, `มีกิจกรรมใหม่: ${title}`, req.session.user.picture || null , eventId , expire , null , null , null);

         await createLog(req, "ADD_EVENT", {
            username: req.session.user.username,
            eventTitle: req.body.title // เก็บชื่อกิจกรรมที่ถูกเพิ่มเข้ามาใน Log ด้วย
        });

        if (missingGroups.length > 0) {
            return res.status(201).json({ 
                message: "บันทึกสำเร็จ", 
                warning: "ไม่พบข้อมูลกลุ่มดังต่อไปนี้ในระบบ:", 
                missingGroups: missingGroups 
            });
        }else{ 
            return res.status(201).json({ message: "บันทึกสำเร็จ" });
        }
       
    } catch (err) {  
        console.error("❌ API Error:", err); 

        // 💡 ส่ง Error กลับไปหาหน้าบ้านแบบ string
        return res.status(500).json({ 
            message: err.message || err.toString() || "Server Internal Error" 
        });
    }
    
});

app.get("/api/getEvents", requireLogin, async (req, res) => {
    try {
        let events;
        const userGroups = Array.isArray(req.session.user.group) ? req.session.user.group : [];
        if(req.session.user.role === "admin" || userGroups.length === 0){
            events = await Event.find().sort({ date: 1 });
        }else{
            events = await Event.find({
                $or: [
                    { toGroup: null },
                    { toGroup: { $in: userGroups } }
                ]
            }).sort({ date: 1 });
        }
        res.json(events || []);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch events" });
    }
});

app.get("/eventInfo/:id", requireLogin,requireNotRole(['secretary']), async (req, res) => {
    try {
        const event = await Event.findOne({ id: req.params.id }); 
        
        if (!event) {
            return res.status(404).send("ไม่พบกิจกรรมนี้ในระบบ");
        }

        const group = await Group.findById(event.toGroup);
        const groupName = group ? group.projectName : null;

        let tableData = event.testData;

        // แปลง Username ของอาจารย์เป็นชื่อเพื่อแสดงผล
        const allTeachers = await User.find({ role: { $in: ["admin", "teacher"] } }).lean();
        const getTeacherName = (username) => {
            if (!username) return "";
            const teacher = allTeachers.find(t => t.username === username);
            return teacher ? "อ."+ teacher.name : username;
        };

        tableData = tableData.map(row => {
            const rowObj = row.toObject ? row.toObject() : row;
            let dirs = rowObj.director || rowObj.directors || [];
            if (!Array.isArray(dirs)) dirs = typeof dirs === 'string' ? dirs.split(',').map(s => s.trim()) : [];
            return { ...rowObj, advisor: getTeacherName(rowObj.advisor), greatDirector: getTeacherName(rowObj.greatDirector), director: dirs.map(getTeacherName).join(', ') };
        });

        // ส่ง tableData เข้าไปด้วย
        renderWithLayout(res, "eventInfo", { 
            title: "KMUTNB Project - Event Info", 
            event,
            tableData,
            groupName
        }, req.path, req);

    } catch (err) {
        console.error("❌ Error fetching event info:", err);
        return res.status(500).send("เกิดข้อผิดพลาดในการดึงข้อมูลกิจกรรม");
    }
});


app.delete("/deleteEvent/:id", requireLogin, async (req, res) => {
    let event; // ประกาศตัวแปร event ไว้ข้างนอกเพื่อให้เข้าถึงได้ในส่วนของ createLog หลังจากการลบข้อมูลทั้งหมดแล้ว
    try {
        const uuidFromParams = req.params.id; // รับ UUID String จาก URL
        event = await Event.findOne({ id: uuidFromParams });
        if (!event) {
            return res.status(404).json({ success: false, message: "ไม่พบกิจกรรมนี้ในระบบ" });
        }

        // 1. ค้นหา Paper ทั้งหมดที่ใช้ UUID นี้อ้างอิง
        const papers = await Paper.find({ eventId: uuidFromParams });
        const paperIds = papers.map(p => p._id); // เก็บ _id ของ Paper (อันนี้เป็น ObjectId)

        let deletedFilesCount = 0;
        let deletedPapersCount = 0;

        if (event.title === "วันส่งเอกสาร") {
            // คืนค่า Paper กลับเป็นค่าเริ่มต้น (เปิดรับตลอด) แทนการลบเพื่อป้องกันไฟล์นักศึกษาหาย
            await Paper.updateMany(
                { eventId: uuidFromParams },
                { 
                    $unset: { expireAt: 1 },
                    $set: { 
                        eventId: "default",
                        mention: "สามารถส่งเอกสารได้ตลอดเวลา",
                        date: new Date('2099-12-31')
                    }
                }
            );
            await Notification.deleteMany({ mention: uuidFromParams }); 
        } else {
            // 2. ค้นหา PaperFile ทั้งหมดที่เชื่อมกับ Paper เหล่านั้น
            const paperFiles = await PaperFile.find({ paperId: { $in: paperIds } });
            deletedFilesCount = paperFiles.length;
            deletedPapersCount = papers.length;

            // 3. ลบไฟล์จริงใน GridFS
            for (const pf of paperFiles) {
                if (pf.file && pf.file.fileId) {
                    try {
                        await bucket.delete(new mongoose.Types.ObjectId(pf.file.fileId));
                    } catch (err) {
                        console.warn(`⚠️ Could not delete file ${pf.file.fileId}:`, err.message);
                    }
                }
            }

            const group = await Group.find({status: { $ne: "ผ่านการสอบป้องกันปริญญานิพนธ์" } });

            if (event.title === "วันสอบ") {
              const groupExamDone = group.filter(g => g.status === "รอสอบป้องกันปริญญานิพนธ์" || g.status === "รอสอบก้าวหน้าปริญญานิพนธ์" || g.status === "รอสอบนำเสนอหัวข้อปริญญานิพนธ์");
              for (const g of groupExamDone) {
                const checkFile = await PaperFile.findOne({
                    $and: [
                        { paperId: { $in: paperIds } },
                        { groupId: g._id }
                    ] 
                });
                let baselineStatus = "รอนำเสนอหัวข้อ";
                if (g.passTimes === 1) baselineStatus = "ผ่านการสอบหัวข้อปริญญานิพนธ์";
                else if (g.passTimes === 2) baselineStatus = "ผ่านการสอบก้าวหน้าปริญญานิพนธ์";
                if(g.status === "รอสอบป้องกันปริญญานิพนธ์"){
                    if(checkFile && checkFile.check === true){
                        g.status = "พร้อมสอบป้องกันปริญญานิพนธ์";
                    }else if(checkFile && checkFile.check === false){
                        g.status = "ไม่พร้อมสอบป้องกันปริญญานิพนธ์";
                    }else{
                        g.status = baselineStatus;
                    }
                }else if(g.status === "รอสอบก้าวหน้าปริญญานิพนธ์"){
                    if(checkFile && checkFile.check === true){
                        g.status = "พร้อมสอบก้าวหน้าปริญญานิพนธ์";
                    }else if(checkFile && checkFile.check === false){
                        g.status = "ไม่พร้อมสอบก้าวหน้าปริญญานิพนธ์";
                    }else{
                        g.status = baselineStatus;
                    }
                }else if(g.status === "รอสอบนำเสนอหัวข้อปริญญานิพนธ์"){
                    if(checkFile && checkFile.check === true){
                        g.status = "พร้อมสอบนำเสนอหัวข้อปริญญานิพนธ์";
                    }else if(checkFile && checkFile.check === false){
                        g.status = "ไม่พร้อมสอบนำเสนอหัวข้อปริญญานิพนธ์";
                    }else{
                        g.status = baselineStatus;
                    }
                }
                await Group.findByIdAndUpdate(g._id, { $set: { status: g.status } });
              }
            }

            // 4. ลบข้อมูล Metadata อื่นๆ
            await PaperFile.deleteMany({ paperId: { $in: paperIds } }); 
            await Paper.deleteMany({ eventId: uuidFromParams }); // ลบโดยใช้ UUID
            await Notification.deleteMany({ mention: uuidFromParams }); 
        }

        
        // 5. ลบตัว Event เอง (ค้นหาด้วยฟิลด์ id แทน _id)
        const result = await Event.findOneAndDelete({ id: uuidFromParams });

        await createLog(req, "DELETE_EVENT", { 
            eventId: uuidFromParams,
            eventTitle: event ? event.title : "Unknown" 
        });

        const expire = new Date();
        expire.setDate(expire.getDate() + 7);
        expire.setHours(23, 59, 59, 999);

        if (result) {
            sendGroupNotification('alert_event', null, null, "ระบบ", `มีกิจกรรมถูกเปลี่ยนแปลง กรุณาตรวจสอบ`, null , event.title , expire , null , null , null);
            return res.json({ 
                success: true, 
                message: "ลบกิจกรรมและไฟล์ที่เกี่ยวข้องทั้งหมดเรียบร้อยแล้ว",
                details: {
                    filesDeleted: deletedFilesCount,
                    platformsDeleted: deletedPapersCount
                }
            });
        } else {
            return res.status(404).json({ success: false, message: "ไม่พบกิจกรรมนี้ในระบบ" });
        }
        

    } catch (err) {
        console.error("❌ Error during full deletion:", err);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการลบข้อมูลทั้งหมด" });
    }

});

app.get("/paper", requireLogin, requireNotRole(['secretary']), async (req, res) => {
  try {
      // 2. เพิ่ม await เพื่อรอให้ดึงข้อมูลจาก MongoDB เสร็จก่อน
      const groups = await Group.find({});
      
      const result = await Result.find({});

      const paperFile = await PaperFile.find({});


      const now = new Date();

      const processedGroups = await Promise.all(groups.map(async (group) => {
            if (group && !group.status.includes("ไม่ผ่าน") && !group.status.includes("ผ่านการสอบป้องกัน") && group.status !== "ไม่มีสมาชิก") {
                const existingPaper = await Paper.findOne({
                    groupId: group._id,
                    passTimes: group.passTimes,
                    mention: { $not: /จะมีการจัดสอบ/ }
                });
                if (!existingPaper) {
                    const newPaper = new Paper({
                        eventId: "default",
                        groupId: group._id,
                        mention: "สามารถส่งเอกสารได้ตลอดเวลา",
                        passTimes: group.passTimes,
                        date: new Date('2099-12-31') // ตั้งไว้ไกลๆ ให้กล่องส่งเอกสารทำงานได้ตลอด
                    });
                    await newPaper.save();
                }
            }

            const latestPaper = await Paper.findOne({ groupId: group._id }).sort({ _id: -1 });// หา Paper ล่าสุดของกลุ่มนี้เพื่อดูวันหมดอายุ
            if (latestPaper && latestPaper.expireAt && now > latestPaper.expireAt) {
            // เช็คว่าสถานะปัจจุบันต้องไม่ใช่สถานะที่ "จบกระบวนการแล้ว" หรือ "เป็นค่าที่ต้องการอยู่แล้ว"
            const forbiddenStatus = [
                "ผ่านการสอบป้องกันปริญญานิพนธ์",
                "ไม่ผ่านการสอบป้องกันปริญญานิพนธ์",
                "ไม่มีสมาชิก",
                "รอสอบป้องกันปริญญานิพนธ์",
                "รอสอบก้าวหน้าปริญญานิพนธ์",
                "รอสอบนำเสนอหัวข้อปริญญานิพนธ์", // ✅ ถ้าเป็นค่านี้อยู่แล้ว ไม่ต้อง save ซ้ำ
                "อยู่ระหว่างการแก้ไข", // 🛡️ ป้องกันไม่ให้ระบบเขียนทับตอนอาจารย์สั่งให้แก้
                "รอแก้ไขเอกสาร", // 🛡️ เผื่อสถานะเก่าตกค้าง
                "ไม่พร้อมสอบ" // 🛡️ ป้องกันไม่ให้โดนเขียนทับตอนอาจารย์กดไม่พร้อมสอบ
            ];

            const isFinished = forbiddenStatus.some(status => group.status.includes(status));

            if (!isFinished) {
                const oldStatus = group.status;
                if(group.passTimes === 0){
                    group.status = "รอสอบนำเสนอหัวข้อปริญญานิพนธ์";
                }else if(group.passTimes >= 1){
                    const mem1 = await User.findOne({ username: group.member1 });
                    const mem2 = group.member2 ? await User.findOne({ username: group.member2 }) : null;
                    if(mem1?.branch === "ECT" || mem2?.branch === "ECT"){
                        group.status = "รอสอบก้าวหน้าปริญญานิพนธ์";
                    }else{
                        group.status = "รอสอบป้องกันปริญญานิพนธ์";
                    }
                }
                await group.save();
        
                await createLog(req, "AUTO_EXPIRE_UPDATE", {
                    projectName: group.projectName,
                    from: oldStatus,
                    to: group.status
                });

                await sendGroupNotification('alert_group', group._id, null, null, `สถานะกลุ่ม ${group.projectName} ถูกอัปเดตอัตโนมัติเป็น "${group.status}" เนื่องจากหมดเวลาส่งเอกสาร`, null , null , null , group.member1 , group.member2 , group.advisor);
            }
        }
        return group;
    }));


      renderWithLayout(res, "paper", { 
          title: "KMUTNB Project - Paper Management", 
          groups,
          result,
          paperFile
      }, req.path, req);
      
  } catch (err) {
      console.error("Fetch Groups Error:", err);
      return res.status(500).send("Internal Server Error");
  }
});

app.post("/api/PaperUploadFile", requireLogin, apiLimiter,async (req, res) => {
    let paperGroup; // ประกาศตัวแปร paperGroup ไว้ข้างนอกเพื่อให้เข้าถึงได้ในส่วนของ createLog หลังจากการบันทึกข้อมูลทั้งหมดแล้ว
    try {
        const { paperId, filesData} = req.body;

        // 1. ตรวจสอบข้อมูลพื้นฐาน
        const paper = await Paper.findById(paperId);
        if (!paper) return res.status(404).send("ไม่พบรายการเอกสาร");

        paperGroup = await Group.findById(paper.groupId);
        if (!paperGroup) return res.status(404).send("ไม่พบข้อมูลกลุ่ม");

        if (filesData && filesData.length > 0) {
            const savePromises = filesData.map(file => {
                return new PaperFile({
                    paperId: paperId,
                    groupId: paperGroup._id,
                    file: { 
                        fileId: file.id, 
                        filename: file.filename,
                        contentType: file.contentType
                    }
                }).save();
            });
            await Promise.all(savePromises);
        }

        await Paper.findByIdAndUpdate(paperId, { 
            $set: { expireAt: null } 
        });

        // 5. อัปเดตสถานะกลุ่ม กลับสู่สภาวะปกติหากเคยเป็น ไม่พร้อมสอบ, รอแก้ไข หรือ อยู่ระหว่างการแก้ไข
        let newStatus = paperGroup.status;
        if (paperGroup.status.includes("ไม่พร้อมสอบ") || paperGroup.status.includes("รอแก้ไขเอกสาร") || paperGroup.status.includes("อยู่ระหว่างการแก้ไข")) {
            if (paperGroup.passTimes === 0) newStatus = "รอนำเสนอหัวข้อ";
            else if (paperGroup.passTimes === 1) newStatus = "ผ่านการสอบหัวข้อปริญญานิพนธ์";
            else if (paperGroup.passTimes === 2) newStatus = "ผ่านการสอบก้าวหน้าปริญญานิพนธ์";
        }
        if (newStatus !== paperGroup.status) {
            await Group.findByIdAndUpdate(paperGroup._id, { 
                $set: { status: newStatus } 
            });
        }

        // เผื่อนักศึกษาไปส่งในกล่อง "ส่งเอกสารได้ตลอดเวลา" ให้ดึง username ของอาจารย์ที่สั่งแก้ (ถ้ามี)
        let extraRecipient = paper.commentBy;
        if (!extraRecipient) {
            const lastFixPaper = await Paper.findOne({
                groupId: paperGroup._id,
                passTimes: paperGroup.passTimes,
                commentBy: { $ne: null }
            }).sort({ _id: -1 });
            
            if (lastFixPaper) {
                extraRecipient = lastFixPaper.commentBy;
            }
        }

        if(req.session.user.username === paperGroup.member1){
            sendGroupNotification('alert_paper', null, req.session.user.username, req.session.user.name, `กลุ่ม ${paperGroup.projectName} ส่งเอกสารเรียบร้อยแล้วโดย ${req.session.user.name}`, req.session.user.picture || null , paper.eventId , null , null , paperGroup.member2 , paperGroup.advisor, extraRecipient);
        }else if(req.session.user.username === paperGroup.member2){
            sendGroupNotification('alert_paper', null, req.session.user.username, req.session.user.name, `กลุ่ม ${paperGroup.projectName} ส่งเอกสารเรียบร้อยแล้วโดย ${req.session.user.name}`, req.session.user.picture || null , paper.eventId , null , paperGroup.member1 , null , paperGroup.advisor, extraRecipient);
        }else if(req.session.user.username === paperGroup.advisor){
            sendGroupNotification('alert_paper', null, req.session.user.username, req.session.user.name, `กลุ่ม ${paperGroup.projectName} ส่งเอกสารเรียบร้อยแล้วโดย อาจารย์ ${req.session.user.name}`, req.session.user.picture || null , paper.eventId , null , paperGroup.member1 , paperGroup.member2 , null, extraRecipient);
        }

        

        res.status(200).send("สำเร็จ");
    } catch (err) { 
        console.error("❌ PaperUpload Error:", err.message);
        return res.status(500).send("เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + err.message); 
    }
    await createLog(req, "PAPER_UPLOAD", {
        username: req.session.user.username,
        groupName: paperGroup ? paperGroup.name : null // เก็บชื่อกลุ่มที่เกี่ยวข้องไว้ใน Log ด้วย
    });
});

app.post("/api/paper/upload-raw", requireLogin, apiLimiter,upload.array("files"), async (req, res) => {
    try {
        const results = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {

                const allowedMimeTypes = [
                    'application/pdf',
                    'application/vnd.ms-powerpoint', // .ppt
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',    // .docx
                ];

                if (!allowedMimeTypes.includes(file.mimetype)) {
                    return res.status(400).send("รองรับเฉพาะไฟล์ PDF DOCX PPT และ PPTX เท่านั้น");
                }
                // 3. จำกัดขนาด (เช่น 50MB)
                if (file.size > 50 * 1024 * 1024) {
                    return res.status(400).send("ไฟล์ต้องมีขนาดไม่เกิน 50MB");
                }
                
                // 🛡️ ป้องกันการปลอมแปลงนามสกุลไฟล์ด้วย Magic Number
                if (!isValidDocumentSignature(file.buffer, file.mimetype)) {
                    return res.status(400).send("ไฟล์ถูกปลอมแปลงนามสกุล หรือข้อมูลเสียหาย");
                }

                const uploadStream = bucket.openUploadStream(file.originalname, { 
                    contentType: file.mimetype 
                });
                uploadStream.end(file.buffer);

                await new Promise((resolve, reject) => {
                    uploadStream.on("finish", resolve);
                    uploadStream.on("error", reject);
                });

                results.push({
                    fileId: uploadStream.id,
                    filename: file.originalname,
                    contentType: file.mimetype
                });
            }
        }
        res.json(results);
    } catch (err) {
        console.error("❌ Raw Upload Error:", err);
        res.status(500).json({ error: "Upload failed" });
    }
});

app.get("/api/getMyPapers", requireLogin, async (req, res) => {
    try {
        const userGroupIds = req.session.user.group;
        const username = req.session.user.username; // เปลี่ยนจาก name เป็น username

        const platforms = await Paper.find({ 
            $or: [
                { groupId: { $in: userGroupIds } },
                { director: { $regex: username, $options: "i" } },
                { advisor: { $regex: username, $options: "i" } },
                { greatDirector: { $regex: username, $options: "i" } }
            ]
        }).lean();
        
        const finalData = await Promise.all(platforms.map(async (p) => {
            const fileRecords = await PaperFile.find({ paperId: p._id });
            return {
                ...p,
                isSubmitted: fileRecords.length > 0,
                files: fileRecords.map(f => f.file)
            };
        }));

        res.json(finalData);
    } catch (err) {
        console.error("❌ Error in getMyPapers:", err);
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลเอกสาร" });
    }
});

// ตรวจสอบว่าเขียนแบบนี้หรือไม่
app.get("/api/getPaperFiles/:paperId", requireLogin, async (req, res) => {
    try {
        const files = await PaperFile.find({ paperId: req.params.paperId }).sort({ createdAt: -1 });
        res.json(files); // ส่ง Array ของไฟล์ทั้งหมดกลับไป
    } catch (err) {
        res.status(500).json([]);
    }
});

app.post("/api/submitPaperResult", apiLimiter,requireLogin, async (req, res) => {
    let group; // ประกาศตัวแปร group ไว้ข้างนอกเพื่อให้เข้าถึงได้ในส่วนของ createLog หลังจากการบันทึกข้อมูลทั้งหมดแล้ว
    try {
        // 1. รับค่าให้ตรงกับที่ Client ส่งมา
        const { paperId, result, comment, editOptions, voteFor } = req.body;
        const user = req.session.user.name;
        const username = req.session.user.username;

        const currentPaper = await Paper.findById(paperId);
        if (!currentPaper) return res.status(404).json({ error: "ไม่พบรายการเอกสาร" });

        group = await Group.findById(currentPaper.groupId);
        if (!group) return res.status(404).json({ error: "ไม่พบข้อมูลกลุ่ม" });

        const mem1 = await User.findOne({ username: group.member1 });
        const mem2 = group.member2 ? await User.findOne({ username: group.member2 }) : null;

        const expire = new Date();
        expire.setDate(expire.getDate() + 7);
        expire.setHours(23, 59, 59, 999);

        // ตรวจสอบว่าเป็นที่ปรึกษาที่ลงคะแนนแทนหลังจากที่เคยมีการให้ "แก้ไข" มาก่อนหรือไม่
        const isAdvisor = currentPaper.advisor && currentPaper.advisor.split(",").map(s => s.trim()).includes(username);
        let actualVoterUsername = username;
        let actualVoterName = user;
        
        if (voteFor && voteFor !== username) {
            if (currentPaper.editCount > 0 && isAdvisor) {
                actualVoterUsername = voteFor;
                const voteForUser = await User.findOne({ username: voteFor });
                if (voteForUser) {
                    actualVoterName = voteForUser.name;
                }
            } else {
                return res.status(403).json({ error: "คุณไม่มีสิทธิ์ลงคะแนนแทนกรรมการท่านอื่น" });
            }
        }

        if (result === "แก้ไข") {
            // ไม่สร้างกล่องส่งเอกสารใหม่แล้ว 
            // แต่บันทึกว่าใครเป็นคนสั่งให้แก้ไขไว้ที่กล่องเอกสารปัจจุบัน (เพื่อใช้แจ้งเตือนเวลานักศึกษาส่งไฟล์มาใหม่)
            currentPaper.commentBy = actualVoterUsername;
            // บันทึกหัวข้อที่ต้องแก้ไขเป็น Array
            currentPaper.editOptions = Array.isArray(editOptions) ? editOptions : [];
            currentPaper.editCount = (currentPaper.editCount || 0) + 1; // อัปเดตจำนวนครั้ง
            await currentPaper.save();

            // ✅ ส่งข้อความเข้าระบบแชทกลุ่ม
            let mem1Chat = group.member1 ? group.member1.replace(" (Pending)", "") : null;
            let mem2Chat = group.member2 ? group.member2.replace(" (Pending)", "") : null;
            let advChat = group.advisor ? group.advisor.replace(" (Pending)", "") : null;

            let editOptionsText = currentPaper.editOptions && currentPaper.editOptions.length > 0 
                ? `\n📌 หัวข้อที่ต้องแก้ไข: ${currentPaper.editOptions.join(", ")}` 
                : "";

            const textMessage = new Message({
                groupId: currentPaper.groupId,
                senderUsername: "system",
                senderName: "ระบบ",
                type: "text",
                text: `[ระบบแจ้งเตือน] เปลี่ยนสถานะเป็น "อยู่ระหว่างการแก้ไข" ⚠️\nอาจารย์ ${actualVoterName} ให้ทำการแก้ไขเอกสาร (ครั้งที่ ${currentPaper.editCount})${editOptionsText}\n💬 รายละเอียดเพิ่มเติม: ${comment || "-"}`,
                senderPic: null,
                timestamp: new Date(),
                groupMember: [mem1Chat, mem2Chat, advChat]
            });
            await textMessage.save();
            io.to(currentPaper.groupId.toString()).emit("group message", textMessage);

            sendGroupNotification('alert_paper', group._id, actualVoterUsername, actualVoterName, `กลุ่ม ${group.projectName} เปลี่ยนสถานะเป็น "อยู่ระหว่างการแก้ไข"`, req.session.user.picture || null , currentPaper.eventId , expire, group.member1 , group.member2 , group.advisor);

            const fixGroupPaper = await Group.findByIdAndUpdate(
                currentPaper.groupId,
                { $set: { status: "อยู่ระหว่างการแก้ไข" } },
                { new: true }
            );
          
            return res.status(200).json({ success: true, message: "บันทึกการแก้ไขเรียบร้อยแล้ว" });
        } 

        // --- กรณี ผ่าน หรือ ไม่ผ่าน ---

        let examResult = await Result.findOne({ groupId: currentPaper.groupId , passTimes: currentPaper.passTimes });

        if (!examResult) {
            examResult = new Result({
                groupId: currentPaper.groupId,
                pass: [],
                fail: [],
                passTimes: group.passTimes,
                submittedAt: new Date()
            });
        }

        // เช็คไม่ให้ลงคะแนนซ้ำ
        if (examResult.pass.includes(actualVoterUsername) || examResult.fail.includes(actualVoterUsername)) {
            return res.status(400).json({ error: `กรรมการ (${actualVoterUsername}) ได้ลงคะแนนไปแล้ว` });
        }

        if (result === "ผ่าน") examResult.pass.push(actualVoterUsername);
        else examResult.fail.push(actualVoterUsername);

        await examResult.save();

        // 🔔 แจ้งเตือนเวลาอาจารย์แต่ละท่านทำการประเมินผลเสร็จสิ้น
        sendGroupNotification('alert_group', group._id, actualVoterUsername, actualVoterName, `อาจารย์ ${actualVoterName} ได้ส่งผลการประเมินการสอบสำหรับกลุ่ม ${group.projectName} เรียบร้อยแล้ว`, req.session.user.picture || null , currentPaper.eventId , expire, group.member1 , group.member2 , group.advisor);

        // คำนวณจำนวนกรรมการทั้งหมด (นับจาก string ที่อาจคั่นด้วยลูกน้ำ)
        const countVoters = (str) => str ? str.split(",").filter(s => s.trim() !== "").length : 0;
        const expectedVotersCount = countVoters(currentPaper.advisor) + countVoters(currentPaper.greatDirector) + countVoters(currentPaper.director);

        // ตรวจสอบว่ากรรมการลงครบทุกคนหรือยัง
        if (examResult.pass.length + examResult.fail.length >= expectedVotersCount) {
            
            // ดึงข้อมูลสมาชิกเพื่อเช็คสาขา (EnET หรือสาขาอื่น)
            const student = await User.findOne({ username: group.member1 });
            const isEnET = student && student.branch === "EnET";


            if (examResult.fail.length > 0) {
                // มีคนให้ตกแม้แต่คนเดียว = ตก
                group.status = group.passTimes === 0 ? "ไม่ผ่านการสอบหัวข้อปริญญานิพนธ์" : (isEnET ? "ไม่ผ่านการสอบป้องกันปริญญานิพนธ์" : "ไม่ผ่านการสอบก้าวหน้าปริญญานิพนธ์");
                group.fileTimes = 0;
            } else {
                // ผ่านทุกคน
                if (group.passTimes === 0) {
                    group.status = "ผ่านการสอบหัวข้อปริญญานิพนธ์";
                    group.passTimes = 1;
                    group.fileTimes = 0;
                    await User.findOneAndUpdate(
                        { username: group.member1 }, 
                        { status: "ผ่านการสอบหัวข้อปริญญานิพนธ์" },
                        { new: true }
                    );

                    // ✅ 2. เช็คสมาชิกคนที่ 2
                    if (group.member2 != null) {
                        await User.findOneAndUpdate(
                            { username: group.member2 }, 
                            { status: "ผ่านการสอบหัวข้อปริญญานิพนธ์" }, 
                            { new: true }
                        );
                    }
                } else if (group.passTimes === 1) {
                    group.status = isEnET ? "ผ่านการสอบป้องกันปริญญานิพนธ์" : "ผ่านการสอบก้าวหน้าปริญญานิพนธ์";
                    group.passTimes = 2;
                    group.fileTimes = 0;
                    await User.findOneAndUpdate(
                        { username: group.member1 }, 
                        { status: "ผ่านการสอบป้องกันปริญญานิพนธ์" }, 
                        { new: true }
                    );

                    // ✅ 2. เช็คสมาชิกคนที่ 2
                    if (group.member2 != null) {
                        await User.findOneAndUpdate(
                            { username: group.member2 }, 
                            { status: "ผ่านการสอบป้องกันปริญญานิพนธ์" }, 
                            { new: true }
                        );
                    }
                }
            }
            await group.save();
            sendGroupNotification('alert_group', group._id, username, user, `ผลการสอบของกลุ่ม ${group.projectName} เสร็จสิ้นแล้ว ${group.status}`, req.session.user.picture || null , currentPaper.eventId , expire, group.member1 , group.member2 , group.advisor);
        }

        res.status(200).json({ success: true, message: "บันทึกผลการสอบเรียบร้อยแล้ว" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
        await createLog(req, "SUBMIT_PAPER_RESULT", {
        username: req.session.user.username,
        groupName: group ? group.name : null
    });
});

app.get("/admin", requireLogin, requireRole(['admin']), async (req, res) => {
  try {
      renderWithLayout(res, "admin", { title: "KMUTNB Project - Admin Panel" }, req.path,req);
  } catch (err) {
      console.error("Admin Panel Error:", err);
      return res.status(500).send("Internal Server Error");
  }
});

app.post("/api/admin", requireLogin, apiLimiter,async (req, res) => {
    // 🛡️ 1. เช็คสิทธิ์ Admin ปัจจุบัน
    if (req.session.user.role !== "admin") {
        return res.status(403).json({ error: "Unauthorized" });
    }

    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ error: "Missing chosenAdvisor" });
        }

        // ป้องกันการโอนสิทธิ์ให้ตัวเอง (ซึ่งจะทำให้ Role มั่ว)
        if (username === req.session.user.username) {
            return res.status(400).json({ error: "คุณเป็น Admin อยู่แล้ว" });
        }

        // 2. เริ่มกระบวนการโอนสิทธิ์
        // เปลี่ยนคนใหม่ให้เป็น Admin
        const advisorUser = await User.findOneAndUpdate(
            { username: username }, 
            { role: "admin" },
            { new: true }
        );

        if (!advisorUser) {
            return res.status(404).json({ error: "ไม่พบผู้ใช้ที่ต้องการมอบสิทธิ์ให้" });
        }

        // เปลี่ยนตัวเอง (Admin คนเก่า) ให้เป็น Teacher
        const oldAdmin = await User.findOneAndUpdate(
            { username: req.session.user.username }, 
            { role: "teacher" },
            { new: true }
        );

        // 🔴 จุดสำคัญ: อัปเดต Session ของตัวเองด้วย 
        // ไม่เช่นนั้นคุณจะยังเข้าหน้า Admin ได้จนกว่าจะ Logout แต่จะแก้ข้อมูลไม่ได้เพราะ DB ไม่ตรง
        req.session.user.role = "teacher";

        res.json({ 
            success: true, 
            message: `โอนสิทธิ์ Admin ให้ ${advisorUser.name} เรียบร้อยแล้ว ขณะนี้คุณมีสิทธิ์เป็น อาจารย์` 
        });

    } catch (err) {
        console.error("❌ Admin Transfer Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
    await createLog(req, "TRANSFER_ADMIN", {
        from: req.session.user.username,
        to: req.body.chosenAdvisor
    });
});

app.get("/api/server-time", (req, res) => {
    res.json({ now: new Date().getTime() }); // ส่ง timestamp ปัจจุบันของ Server ไป
});

app.get("/forgotPassword" ,checkFailModal, (req, res) => {
    renderWithLayout(res, "forgotPassword", { title: "Forgot Password" , failModal: res.locals.failModal}, req.path, req);
});

app.post("/forgot-password" , authLimiter,async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email }); // ประกาศตัวแปร user ไว้ข้างนอกเพื่อให้เข้าถึงได้ในส่วนของ createLog หลังจากการดำเนินการทั้งหมดแล้ว
    try {

        if (!email) {
            req.session.failModal = "email_failed";
            return req.session.save(() => res.redirect("/forgotPassword"));
        }
        if (!user) {
            req.session.failModal = "user_failed";
            return req.session.save(() => res.redirect("/forgotPassword"));
        }

        // สร้าง Token (ต้องแก้ Schema เพิ่ม 2 ฟิลด์นี้ก่อนตามที่คุยกัน)
        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 ชั่วโมง
        await user.save();

        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true, // ใช้ true สำหรับพอร์ต 465
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: {
                // ช่วยให้ส่งผ่านได้แม้ระบบรักษาความปลอดภัยของ Server จะเข้มงวด
                rejectUnauthorized: false 
            }
        });

        const resetUrl = `https://${req.get('host')}/reset-password/${token}`;
        
        const mailOptions = {
            from: `"KMUTNB System" <${process.env.EMAIL_USER}>`,
            to: `${email}`, // ✅ ส่งหาอีเมลสถาบัน
            subject: '🔒 คำขอรีเซ็ตรหัสผ่าน',
            html: `<h3>สวัสดีคุณ ${user.name}</h3>
                   <p>คลิกลิงก์ด้านล่างเพื่อตั้งรหัสผ่านใหม่:</p>
                   <a href="${resetUrl}">${resetUrl}</a>
                   <p>ลิงก์จะหมดอายุใน 1 ชม.</p>`
        };

        await transporter.sendMail(mailOptions);
        
        req.session.successModal = "forget_success";
        req.session.save(() => res.redirect("/login"));
    } catch (err) {
            console.error("❌ Forgot Password Error:", err); // ✅ ให้ปริ้นท์สาเหตุที่แท้จริงออกมาดู
        req.session.failModal = "forget_failed";
        return req.session.save(() => res.redirect("/forgotPassword"));
    }
    await createLog(req, "FORGOT_PASSWORD", {
        email: req.body.email,
        username: user ? user.username : null // เก็บ username ถ้ามีข้อมูลผู้ใช้ที่ตรงกับอีเมลนั้น
    });
});


app.get("/reset-password/:token", checkFailModal , async (req, res) => {
    try {
        // ค้นหา User ที่มี Token ตรงกันและยังไม่หมดอายุ
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() } // $gt คือ Greater Than (ยังไม่ถึงเวลาหมดอายุ)
        });

        if (!user) {
            // ถ้า Token ผิดหรือหมดอายุ ให้ส่งกลับไปหน้าลืมรหัสผ่านพร้อมข้อความเตือน
            req.session.failModal = "token_expired"; 
            return req.session.save(() => res.redirect(`/reset-password/${req.params.token}`));
        }

        // ถ้า Token ถูกต้อง ให้แสดงหน้าตั้งรหัสผ่านใหม่
        renderWithLayout(res, "resetPassword", { 
            title: "Reset Password",
            failModal: res.locals.failModal, 
            token: req.params.token 
        }, req.path, req);
    } catch (err) {
        console.error(err);
        return res.status(500).send("Server Error");
    }
});



app.post("/reset-password/:token", authLimiter,async (req, res) => {
    let user; // ประกาศตัวแปร user ไว้ข้างนอกเพื่อให้เข้าถึงได้ในส่วนของ createLog หลังจากการดำเนินการทั้งหมดแล้ว
    try {
        const { password, passwordConfirm } = req.body;

        if (password !== passwordConfirm) {
            req.session.failModal = "password_mismatch";
            return req.session.save(() => res.redirect(`/reset-password/${req.params.token}`));
        }

        user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            req.session.failModal = "token_expired";
            return req.session.save(() => res.redirect(`/reset-password/${req.params.token}`));
        }

        // 1. Hash รหัสผ่านใหม่
        const hashedPassword = await bcrypt.hash(password, 12);
        user.password = hashedPassword;

        // 2. ล้างค่า Token และวันหมดอายุทิ้ง (เพื่อไม่ให้ใช้ซ้ำได้อีก)
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();

        // 3. แจ้งเตือนสำเร็จและให้ไป Login ใหม่
        req.session.successModal = "reset_success";
        req.session.save(() => res.redirect("/login"));
    } catch (err) {
        req.session.failModal = "reset_failed";
        return req.session.save(() => res.redirect(`/reset-password/${req.params.token}`));
    }
    await createLog(req, "RESET_PASSWORD", {
        username: user ? user.username : null
    });

});

app.post("/change-password" , requireLogin, authLimiter,async (req, res) => {
    try{
        const {username} = req.body;
        const userData = await User.findOne({username: username});
        if(!userData){
            return res.status(404).json({ error: "ไม่พบบัญชีผู้ใช้" });
        }
        const email = userData.email;
        if(!email){
            return res.status(404).json({ error: "ไม่พบอีเมลผู้ใช้" });
        }

        const token = crypto.randomBytes(20).toString('hex');
        userData.resetPasswordToken = token;
        userData.resetPasswordExpires = Date.now() + 3600000; // 1 ชั่วโมง
        await userData.save();

        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true, // ใช้ true สำหรับพอร์ต 465
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: {
                // ช่วยให้ส่งผ่านได้แม้ระบบรักษาความปลอดภัยของ Server จะเข้มงวด
                rejectUnauthorized: false 
            }
        });

        const resetUrl = `https://${req.get('host')}/changePassword/${token}`;
        
        const mailOptions = {
            from: `"KMUTNB System" <${process.env.EMAIL_USER}>`,
            to: `${email}`, // ✅ ส่งหาอีเมลสถาบัน
            subject: '🔒 คำขอรีเซ็ตรหัสผ่าน',
            html: `<h3>สวัสดีคุณ ${userData.name}</h3>
                   <p>คลิกลิงก์ด้านล่างเพื่อตั้งรหัสผ่านใหม่:</p>
                   <a href="${resetUrl}">${resetUrl}</a>
                   <p>ลิงก์จะหมดอายุใน 1 ชม.</p>`
        };

        await transporter.sendMail(mailOptions);

        res.json({ success: true });

    }catch(err){
            console.error("❌ Change Password Email Error:", err);
        return res.status(500).send("เกิดข้อผิดพลาด: " + err.message);
    }
});

app.get("/changePassword/:token", checkFailModal , async (req, res) => {
    try {
        // ค้นหา User ที่มี Token ตรงกันและยังไม่หมดอายุ
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() } // $gt คือ Greater Than (ยังไม่ถึงเวลาหมดอายุ)
        });

        if (!user) {
            // ถ้า Token ผิดหรือหมดอายุ ให้ส่งกลับไปหน้าลืมรหัสผ่านพร้อมข้อความเตือน
            req.session.failModal = "token_expired"; 
            return req.session.save(() => res.redirect(`/changePassword/${req.params.token}`));
        }

        // ถ้า Token ถูกต้อง ให้แสดงหน้าตั้งรหัสผ่านใหม่
        renderWithLayout(res, "changePassword", { 
            title: "Change Password",
            failModal: res.locals.failModal, 
            token: req.params.token 
        }, req.path, req);
    } catch (err) {
        console.error(err);
        return res.status(500).send("Server Error");
    }
});



app.post("/changePassword/:token", authLimiter,async (req, res) => {
    let user; // ประกาศตัวแปร user ไว้ข้างนอกเพื่อให้เข้าถึงได้ในส่วนของ createLog หลังจากการดำเนินการทั้งหมดแล้ว
    try {
        const { password, passwordConfirm } = req.body;

        if (password !== passwordConfirm) {
            req.session.failModal = "password_mismatch";
            return req.session.save(() => res.redirect(`/changePassword/${req.params.token}`));
        }

        user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            req.session.failModal = "token_expired";
            return req.session.save(() => res.redirect(`/changePassword/${req.params.token}`));
        }

        // 1. Hash รหัสผ่านใหม่
        const hashedPassword = await bcrypt.hash(password, 12);
        user.password = hashedPassword;

        // 2. ล้างค่า Token และวันหมดอายุทิ้ง (เพื่อไม่ให้ใช้ซ้ำได้อีก)
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();
        req.session.destroy(err => {
            if (err) {
            console.error(err);
            return res.status(500).send('Logout failed');
            }
            res.clearCookie('connect.sid'); // 💡 ล้างไฟล์ Cookie ในเครื่อง User ออกไปด้วย
        });
        // 3. แจ้งเตือนสำเร็จและให้ไป Login ใหม่
        req.session.successModal = "reset_success";
        req.session.save(() => res.redirect("/login"));
    } catch (err) {
        req.session.failModal = "reset_failed";
        return req.session.save(() => res.redirect(`/reset-password/${req.params.token}`));
    }
    await createLog(req, "CHANGE_PASSWORD", {
        username: user ? user.username : null
    });

});

app.post("/api/groups/mark-ready-for-exam", apiLimiter,async (req, res) => {
    // ตรวจสอบสิทธิ์ (ต้องเป็นอาจารย์เท่านั้น)
    if (!req.session.user || (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin')) {
        return res.status(403).json({ error: "คุณไม่มีสิทธิ์ดำเนินการนี้" });
    }

    try {
        const { groupId , paperId, isReady, comment } = req.body;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: "ไม่พบข้อมูลกลุ่ม" });

        const mem1 = await User.findOne({username: group.member1})
        const mem2 = group.member2 ? await User.findOne({username: group.member2}) : null;
        let statusCheck;

        if (isReady !== false) {
            if (group.passTimes === 0) {
              statusCheck = "พร้อมสอบนำเสนอหัวข้อปริญญานิพนธ์";
            } else if(group.passTimes >= 1) {
              if(mem1?.branch === "EnET" || mem2?.branch === "EnET"){
                statusCheck = "พร้อมสอบป้องกันปริญญานิพนธ์";
              }else{
                statusCheck = "พร้อมสอบก้าวหน้าปริญญานิพนธ์";
              }
            }
        } else {
            if (group.passTimes === 0) {
                  statusCheck = "ไม่พร้อมสอบนำเสนอหัวข้อปริญญานิพนธ์";
            } else if(group.passTimes >= 1) {
              if(mem1?.branch === "EnET" || mem2?.branch === "EnET"){
                    statusCheck = "ไม่พร้อมสอบป้องกันปริญญานิพนธ์";
              }else{
                    statusCheck = "ไม่พร้อมสอบก้าวหน้าปริญญานิพนธ์";
              }
            }
        }
        

        const result = await PaperFile.updateMany(
            { $and: [
             { groupId: groupId }, 
             { paperId: paperId },
            ] },
            { $set: { check: isReady !== false } }
        );

        if (result.matchedCount === 0) {
            return res.status(400).json({ error: "ยังไม่มีการส่งเอกสารสำหรับการสอบนี้" });
        }


        
        // อัปเดตสถานะเฉพาะกลุ่มที่ส่ง ID มา
        const updatedGroup = await Group.findByIdAndUpdate(
            groupId, 
            { status: statusCheck },
            { new: true }
        );

        if (!updatedGroup) {
            return res.status(404).json({ error: "ไม่พบข้อมูลกลุ่ม" });
        }

        // ✅ เพิ่มการบันทึกแชทและแจ้งเตือน Real-time เมื่อไม่พร้อมสอบและมี comment
        if (isReady === false && comment && comment.trim() !== "") {
            let mem1 = group.member1 ? group.member1.replace(" (Pending)", "") : null;
            let mem2 = group.member2 ? group.member2.replace(" (Pending)", "") : null;
            let adv = group.advisor ? group.advisor.replace(" (Pending)", "") : null;

            const textMessage = new Message({
                groupId: groupId,
                senderUsername: req.session.user.username,
                senderName: req.session.user.name,
                type: "text",
                text: `[ระบบแจ้งเตือน] อาจารย์ลงความเห็นว่า "ไม่พร้อมสอบ" เนื่องจาก: ${comment.trim()}`,
                senderPic: req.session.user.picture || null,
                timestamp: new Date(),
                groupMember: [mem1, mem2, adv]
            });
            await textMessage.save();
            io.to(groupId).emit("group message", textMessage);
        }
        
        if (isReady !== false) {
            sendGroupNotification('alert_paper', null, req.session.user.username, req.session.user.name, `กลุ่ม ${group.projectName} พร้อมสำหรับการสอบแล้ว`, req.session.user.picture || null , null , group.member1 , group.member2 , null);
        } else {
            sendGroupNotification('alert_paper', null, req.session.user.username, req.session.user.name, `กลุ่ม ${group.projectName} ถูกเปลี่ยนสถานะเป็นไม่พร้อมสอบ`, req.session.user.picture || null , null , group.member1 , group.member2 , null);
        }

        res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/groupInfo/:id", requireLogin ,async (req, res) => {
    try {
        const id = req.params.id;
        
        // 1. หาข้อมูลกลุ่ม
        const group = await Group.findById(id).lean();
        if (!group) return res.status(404).send("ไม่พบข้อมูลกลุ่ม");


        let member2username ,advisorUsername;
        // 2. ดึงข้อมูลชื่อ-นามสกุลสมาชิกและที่ปรึกษา
        if(String(group.member2).includes("Pending")){
          member2username = null; // แปลงค่า Pending เป็น null เพื่อให้แสดง "ไม่มีข้อมูล" ใน getUserFullName
        }else{
          member2username = group.member2;
        }

        if(String(group.advisor).includes("Pending")){
          advisorUsername = null; // แปลงค่า Pending เป็น null เพื่อให้แสดง "ไม่มีข้อมูล" ใน getUserFullName
        }else{
          advisorUsername = group.advisor;
        }
        const memberUsernames = [group.member1, member2username, advisorUsername].filter(Boolean);
        const users = await User.find({ username: { $in: memberUsernames } }).lean();
        
        const getUserFullName = (username) => {
            const u = users.find(user => user.username === username);
            return u ? `${u.name} ${u.lastname}` : username || "ไม่มีข้อมูล";
        };

        const getUserId = (username) => {
            const u = users.find(user => user.username === username);
            return u ? u._id : null;
        };

        // 3. ดึงหัวข้อเอกสาร (Paper) ทั้งหมด และไฟล์ที่เคยส่ง (PaperFile)
        const allPapers = await Paper.find({ groupId: id }).sort({ submittedAt: -1 }).lean();
        const allFiles = await PaperFile.find({ groupId: id }).lean();

        // 4. ดึงข้อมูลผลการสอบ (Result)
        const allResults = await Result.find({ groupId: id }).lean();
        
        let resultUsernames = [];
        allResults.forEach(r => {
            if (r.pass) resultUsernames = resultUsernames.concat(r.pass);
            if (r.fail) resultUsernames = resultUsernames.concat(r.fail);
        });
        const resultUsers = await User.find({ username: { $in: resultUsernames } }).lean();
        
        const getResultUserFullName = (username) => {
            const u = resultUsers.find(user => user.username === username);
            return u ? `${u.title && u.title !== 'รอเพิ่มข้อมูล' ? u.title + ' ' : ''}${u.name} ${u.lastname}`.trim() : username;
        };

        // นำไฟล์ไปใส่ไว้ในแต่ละ Paper
        const papersWithFiles = allPapers.map(paper => {
            const rawResult = allResults.find(r => r.passTimes === paper.passTimes);
            let formattedResult = rawResult ? { pass: (rawResult.pass || []).map(getResultUserFullName), fail: (rawResult.fail || []).map(getResultUserFullName) } : null;
            return {
                ...paper,
                submittedFiles: allFiles.filter(f => f.paperId.toString() === paper._id.toString()),
                result: formattedResult
            };
        });

        renderWithLayout(res, "groupInfo", { 
            title: "รายละเอียดกลุ่ม",
            group,
            member1Name: getUserFullName(group.member1),
            member2Name: getUserFullName(group.member2),
            advisorName: getUserFullName(group.advisor),
            member1Id: getUserId(group.member1),
            member2Id: getUserId(member2username),
            papers: papersWithFiles
        }, req.path, req);

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.get("/ownedGroupInfo/:id", async (req, res) => {
    try {
        const id = req.params.id;
        
        // 1. หาข้อมูลกลุ่ม
        const group = await Group.findById(id).lean();
        if (!group) return res.status(404).send("ไม่พบข้อมูลกลุ่ม");


        let member2username ,advisorUsername;
        // 2. ดึงข้อมูลชื่อ-นามสกุลสมาชิกและที่ปรึกษา
        if(String(group.member2).includes("Pending")){
          member2username = null; // แปลงค่า Pending เป็น null เพื่อให้แสดง "ไม่มีข้อมูล" ใน getUserFullName
        }else{
          member2username = group.member2;
        }

        if(String(group.advisor).includes("Pending")){
          advisorUsername = null; // แปลงค่า Pending เป็น null เพื่อให้แสดง "ไม่มีข้อมูล" ใน getUserFullName
        }else{
          advisorUsername = group.advisor;
        }
        const memberUsernames = [group.member1, member2username, advisorUsername].filter(Boolean);
        const users = await User.find({ username: { $in: memberUsernames } }).lean();
        
        const getUserFullName = (username) => {
            const u = users.find(user => user.username === username);
            return u ? `${u.name} ${u.lastname}` : username || "ไม่มีข้อมูล";
        };

        const getUserId = (username) => {
            const u = users.find(user => user.username === username);
            return u ? u._id : null;
        };

        // 3. ดึงหัวข้อเอกสาร (Paper) ทั้งหมด และไฟล์ที่เคยส่ง (PaperFile)
        const allPapers = await Paper.find({ groupId: id }).sort({ submittedAt: -1 }).lean();
        const allFiles = await PaperFile.find({ groupId: id }).lean();

        // 4. ดึงข้อมูลผลการสอบ (Result) และแปลงชื่ออาจารย์
        const allResults = await Result.find({ groupId: id }).lean();
        
        let resultUsernames = [];
        allResults.forEach(r => {
            if (r.pass) resultUsernames = resultUsernames.concat(r.pass);
            if (r.fail) resultUsernames = resultUsernames.concat(r.fail);
        });
        const resultUsers = await User.find({ username: { $in: resultUsernames } }).lean();
        
        const getResultUserFullName = (username) => {
            const u = resultUsers.find(user => user.username === username);
            return u ? `${u.title && u.title !== 'รอเพิ่มข้อมูล' ? u.title + ' ' : ''}${u.name} ${u.lastname}`.trim() : username;
        };

        // นำไฟล์ไปใส่ไว้ในแต่ละ Paper
        const papersWithFiles = allPapers.map(paper => {
            const rawResult = allResults.find(r => r.passTimes === paper.passTimes);
            let formattedResult = rawResult ? { pass: (rawResult.pass || []).map(getResultUserFullName), fail: (rawResult.fail || []).map(getResultUserFullName) } : null;
            return {
                ...paper,
                submittedFiles: allFiles.filter(f => f.paperId.toString() === paper._id.toString()),
                result: formattedResult
            };
        });

        renderWithLayout(res, "ownedGroupInfo", { 
            title: "รายละเอียดกลุ่ม",
            group,
            member1Name: getUserFullName(group.member1),
            member2Name: getUserFullName(group.member2),
            advisorName: getUserFullName(group.advisor),
            member1Id: getUserId(group.member1),
            member2Id: getUserId(member2username),
            papers: papersWithFiles
        }, req.path, req);

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.get("/userInfo", requireLogin, requireRole(['admin', 'secretary']) ,async (req, res) => {
    // 1. ตรวจสอบสิทธิ์ Admin
    try {
        // 2. ดึงเฉพาะคนที่เป็น user และเรียงลำดับรหัส
        const students = await User.find({ role: 'user' }).sort({ username: 1 }).lean();
        const groups = await Group.find({}).sort({ _id: -1 }).lean();

        const timeSince = (date) => {
            if (!date) return "";
            const seconds = Math.floor((new Date() - new Date(date)) / 1000);
            if (seconds < 0) return "เพิ่งอัปเดต";
            let interval = Math.floor(seconds / 31536000);
            if (interval >= 1) return interval + " ปีที่แล้ว";
            interval = Math.floor(seconds / 2592000);
            if (interval >= 1) return interval + " เดือนที่แล้ว";
            interval = Math.floor(seconds / 86400);
            if (interval >= 1) return interval + " วันที่แล้ว";
            interval = Math.floor(seconds / 3600);
            if (interval >= 1) return interval + " ชั่วโมงที่แล้ว";
            interval = Math.floor(seconds / 60);
            if (interval >= 1) return interval + " นาทีที่แล้ว";
            return "เพิ่งอัปเดต";
        };

        // แมปสถานะของกลุ่มให้กับผู้ใช้แต่ละคน
        students.forEach(student => {
            let rawStatusTime;
            if (student.status && (student.status.includes("ผ่านการสอบป้องกัน") || student.status === "จบแล้ว" || student.status === "สำเร็จการศึกษา")) {
                student.displayStatus = student.status;
                rawStatusTime = student.updatedAt || student.createdAt;
            } else {
                const studentGroup = groups.find(g => 
                    g.member1 === student.username || 
                    g.member2 === student.username || 
                    g.member2 === `${student.username} (Pending)`
                );
                if (studentGroup) {
                    student.displayStatus = studentGroup.status;
                    rawStatusTime = studentGroup.updatedAt || studentGroup.lastUpdatedTime;
                } else {
                    student.displayStatus = "ไม่มีกลุ่ม";
                    rawStatusTime = "";
                }
            }

            if (rawStatusTime) {
                student.statusTime = new Date(rawStatusTime).toLocaleString('th-TH', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                });
            } else {
                student.statusTime = "";
            }
        });

        // 3. Logic การจัดกลุ่ม (Group by Prefix 2 ตัวหน้าของ username)
        const groupedData = students.reduce((acc, student) => {
            // ตรวจสอบว่ามี username และมีความยาวพอไหม เพื่อกัน Error
            if (student.username && student.username.length >= 2) {
                const prefix = student.username.substring(0, 2); // ดึง 63, 64...
                if (!acc[prefix]) acc[prefix] = [];
                acc[prefix].push(student);
            }
            return acc;
        }, {});

        // 4. ส่งข้อมูลไปที่หน้า userInfo.ejs ผ่าน Layout
        renderWithLayout(res, "userInfo", { 
            title: "KMUTNB Project - User Info", 
            groupedData // ส่งก้อนข้อมูลที่จัดกลุ่มแล้วไปให้ EJS
        }, req.path, req);

    } catch (err) {
        console.error("❌ Error fetching users:", err);
        res.status(500).send("Error fetching users");
    }
});

app.post("/update-exam-schedule", apiLimiter, requireLogin, async (req, res) => {
    if (req.session.user.role !== "admin") return res.status(403).send("สิทธิ์ไม่เพียงพอ");

    try {
        const { eventId, data: updatedData } = req.body;
        const event = await Event.findOne({ id: eventId });
        if (!event) return res.status(404).send("ไม่พบข้อมูลกิจกรรม");

        let newTestData = [];

        const allTeachers = await User.find({ role: { $in: ["admin", "teacher"] } }).lean();
        const getTeacherUsername = (name) => {
            if (!name) return null;
            const teacher = allTeachers.find(t => t.name.includes(name) || name.includes(t.name));
            return teacher ? teacher.username : name; // fallback to name if not found
        };

        for (const row of updatedData) {
            const newGroupName = (row['ชื่อกลุ่ม'] || "").trim();
            const originalGroupName = (row['originalGroupName'] || "").trim();

            let targetGroup = null;
            let finalGroupName = newGroupName; // Assume new name is valid by default

            // 1. Try to find group by the new name
            if (newGroupName) {
                targetGroup = await Group.findOne({ projectName: newGroupName });
            }

            // 2. If new name didn't match, try to find by original name
            if (!targetGroup && originalGroupName) {
                targetGroup = await Group.findOne({ projectName: originalGroupName });
                if (targetGroup) {
                    finalGroupName = originalGroupName; // Revert to original name
                }
            }

            // 3. If no group found at all, skip this row (or handle error)
            if (!targetGroup) {
                console.warn(`⚠️ Skipping row: No group found for new name "${newGroupName}" or original name "${originalGroupName}"`);
                continue;
            }

            // จัดการกรรมการ
                    const cleanAndSplit = (val) => {
                        if (!val) return [];
                        return String(val)
                            .split(/[,\/;]|\sและ\s/)
                            .map(s => s.trim().replace(/^(ผู้ช่วยศาสตราจารย์\s?|รองศาสตราจารย์\s?|ศาสตราจารย์\s?|ดร\.\s?|ผศ\.\s?ดร\.\s?|ผศ\.\s?|รศ\.\s?ดร\.\s?|รศ\.\s?|ศ\.\s?|มร\.\s?|นาย\s?|นางสาว\s?|นาง\s?|อาจารย์\s?|อ\.\s?)+/g, ""))
                            .filter(Boolean); // กรองเอาเฉพาะข้อมูลที่มีค่าจริงๆ
                    };

                    let advisorsStr = cleanAndSplit(row['อาจารย์ที่ปรึกษา']);
                    let greatDirectorsStr = cleanAndSplit(row['ประธานกรรมการ']);
                    let directorStr = cleanAndSplit(row['กรรมการ']);

                    let advisorUsername = advisorsStr.map(getTeacherUsername).filter(Boolean);
                    let greatDirectorUsername = greatDirectorsStr.map(getTeacherUsername).filter(Boolean);
                    let directorUsername = directorStr.map(getTeacherUsername).filter(Boolean);

            const datePart = row['dateOnly']; // '2026-04-15'
            const timePart = row['timeOnly'] || "00:00"; // '09:30'

            // รวมร่างวันและเวลา
            let finalDate = new Date(`${datePart}T${timePart}`);

            // ถ้า New Date แล้ว Error (Invalid) ให้ใช้ค่าวันกิจกรรมหลักแทน
            if (isNaN(finalDate.getTime())) {
                finalDate = new Date(event.date);
            }

            // 🚩 เก็บลง testData ของ Event
            newTestData.push({
                 groupName: finalGroupName, // Use the validated group name
                advisor: advisorUsername.join(", "), // Store username
                greatDirector: greatDirectorUsername.join(", "), // Store username
                director: directorUsername.join(", "), // Store array of usernames as string
                date: finalDate,
                time: timePart
            });

            // อัปเดต Paper (Logic เดิม)
            const testResultsExpire = new Date(finalDate); // Use finalDate from the row
            testResultsExpire.setDate(testResultsExpire.getDate() + 7);

            await Paper.findOneAndUpdate(
                { eventId: event.id, groupId: targetGroup._id }, // Use targetGroup._id here
                { 
                    $set: {
                        advisor: advisorUsername.join(", "), // Store username
                        greatDirector: greatDirectorUsername.join(", "), // Store username
                        director: directorUsername.join(", "), // Store array of usernames as string
                        mention: event.description || event.title,
                        expireAt: testResultsExpire,
                        date: finalDate
                    } 
                },
                { upsert: true }
            );
        }

        // 🚩 อัปเดต testData ลงใน Event Model
        event.testData = newTestData;
        await event.save();

        sendGroupNotification('alert', null, req.session.user.username, req.session.user.name, `มีอัปเดตตาราง กรุณาตรวจสอบ`, req.session.user.picture || null , null , null , null , null);
        res.json({ success: true, message: "อัปเดตตารางสอบเรียบร้อยแล้ว" });

    } catch (err) {
        console.error("❌ Update Error:", err);
        res.status(500).send("เกิดข้อผิดพลาด: " + err.message);
    }
});

app.get("/addSecretary", requireLogin, requireRole(['admin']), async (req, res) => {
  try {
      renderWithLayout(res, "addSecretary", { title: "KMUTNB Project - Add Secretary" }, req.path,req);
  } catch (err) {
      console.error("Add Secretary Error:", err);
      res.status(500).send("Internal Server Error");
  }
});

app.post("/api/addSecretary", apiLimiter, requireLogin, async (req, res) => {
    if (req.session.user.role !== "admin") {
        return res.status(403).json({ error: "คุณไม่มีสิทธิ์ดำเนินการในส่วนนี้" });
    }

    // 🛡️ ตรวจสอบไฟล์ Excel ของจริงด้วย Magic Number
    const hex = req.file.buffer.toString('hex', 0, 8).toUpperCase();
    const isXlsx = hex.startsWith('504B0304'); // .xlsx
    const isXls = hex.startsWith('D0CF11E0A1B11AE1'); // .xls
    if (!isXlsx && !isXls) {
        return res.status(400).json({ error: 'ไฟล์ Excel ไม่ถูกต้องหรือถูกปลอมแปลง' });
    }

    try {
        const { username , email} = req.body;

        if (!username || !email) {
            return res.status(400).json({ error: "ข้อมูลไม่ครบ" });
        }

        const checkUser = await User.find({username: username});
        if(checkUser.length > 0) return res.status(400).json({ error: "ชื่อผู้ใช้ถูกใช้ไปแล้ว" });
        const pendingHashedPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12); 
        
        const newSecretary = new User({
            username: username.trim(),
            email: email,
            password: pendingHashedPassword,
            title: "รอเพิ่มข้อมูล",
            name: "รอเพิ่มข้อมูล",
            lastname: "รอเพิ่มข้อมูล",
            role: "secretary", 
            phone: null, 
            group: [],
            picture: "" 
        })

        await newSecretary.save();

        // ตรวจสอบว่ามีการตั้งค่าอีเมลหรือไม่
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.warn("⚠️ ไม่พบการตั้งค่าอีเมล (EMAIL_USER หรือ EMAIL_PASS)");
        } else {
            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true, // ใช้ true สำหรับพอร์ต 465
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                },
                tls: {
                    // ช่วยให้ส่งผ่านได้แม้ระบบรักษาความปลอดภัยของ Server จะเข้มงวด
                    rejectUnauthorized: false 
                }
            });

            const resetUrl = `https://${req.get('host')}/register`;
            
            const mailOptions = {
                from: `"KMUTNB System" <${process.env.EMAIL_USER}>`,
                to: `${email}`, // ✅ ส่งหาอีเมลสถาบัน
                subject: 'เพิ่มข้อมูลผู้ใช้',
                html: `<h3>สวัสดี</h3>
                       <p>มีการเพิ่มข้อมูลของคุณเป็นเลขานุการในระบบ กรุณาไปกรอกข้อมูลเพิ่มเติมในลิ้งค์</p>
                       <p>ชื่อผู้ใช้ของคุณคือ ${username}</p>
                       <a href="${resetUrl}">${resetUrl}</a>`
            };

            await transporter.sendMail(mailOptions);
        }
        
        res.json({ 
            success: true, 
            message: `มอบสิทธิ์เลขานุการให้แก่ผู้ใช้ ${username} เรียบร้อยแล้ว` 
        });

    } catch (err) {
        console.error("❌ Admin Grant Secretary Error:", err);
        res.status(500).json({ error: "เกิดข้อผิดพลาดภายในระบบ" });
    }
    await createLog(req, "GRANT_SECRETARY", { 
        from: req.session.user.username,
        to: req.body.username
    });
});

// ✅ API สำหรับสร้าง PDF สดตามข้อมูลกลุ่ม
app.get("/api/generate-pdf/:groupId", requireLogin, async (req, res) => {
    try {
        const groupId = req.params.groupId;
        
        // 1. ตรวจสอบความถูกต้องของ ID String
        if (!mongoose.Types.ObjectId.isValid(groupId)) {
            return res.status(400).send("❌ รูปแบบ ID ไม่ถูกต้อง");
        }

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send("ไม่พบข้อมูลกลุ่ม");

        const pdfBuffer = await generateAutoFilledPDF(group);
        if (!pdfBuffer) return res.status(500).send("ไม่สามารถสร้าง PDF ได้");

        const encodedFilename = encodeURIComponent(`แบบฟอร์ม_${group.projectName}.pdf`);
        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename*=UTF-8''${encodedFilename}`
        });
        
        res.send(Buffer.from(pdfBuffer));

    } catch (err) {
        console.error("❌ Generate PDF Error:", err.message);
        res.status(500).send("เกิดข้อผิดพลาด: " + err.message);
    }
});

app.get("/logs", requireLogin, async (req, res) => {
    if(req.session.user.role !== "admin"){
        return res.redirect("/");
    }
    try {
        // ดึง 200 รายการล่าสุด
        const logs = await Log.find().sort({ timestamp: -1 }).limit(200).lean();
        
        renderWithLayout(res, "logs", { 
            title: "System Activity Logs", 
            logs 
        }, req.path, req);
    } catch (err) {
        logger.error("Error fetching logs: " + err.message);
        res.status(500).send("Internal Server Error");
    }
    await createLog(req, "VIEW_LOGS", {
        username: req.session.user.username
    });
});

app.delete("/api/PaperFile/delete", apiLimiter, requireLogin, async (req, res) => {
    try {
        const { fileId } = req.body;

        const oldFiles = await PaperFile.findOne({ "file.fileId": fileId });
        const paper = await Paper.findById(oldFiles.paperId);

        if (!oldFiles) {
            return res.status(404).json({ error: "ไม่พบไฟล์เอกสารที่ต้องการลบ" });
        }
        if (oldFiles.file?.fileId) {
            try { 
                // ลบไฟล์จริงออกจาก GridFS
                await bucket.delete(new mongoose.Types.ObjectId(oldFiles.file.fileId)); 
            } catch (err) { 
                console.warn(`⚠️ Warning: ไม่สามารถลบไฟล์ ${oldFiles.file.fileId} ได้:`, err.message); 
            }
        }
        await PaperFile.deleteOne({ "file.fileId": fileId }); // ลบเรคคอร์ด PaperFile ที่อ้างถึงไฟล์นี้ออกจากฐานข้อมูล

        res.json({ 
            success: true, 
            message: "ลบไฟล์เอกสารเรียบร้อยแล้ว", 
            paperId: paper._id
        });
    } catch (err) {
        console.error("❌ Delete Paper File Error:", err);
        res.status(500).json({ error: "เกิดข้อผิดพลาดภายในระบบ" });
    }
});

app.get("/search-group", requireLogin, async (req, res) => {
  const keyword = req.query.keyword || "";
  const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const groups = await Group.find({
      $and: [
        { status: { $nin: ["ผ่านการสอบป้องกันปริญญานิพนธ์", "ไม่มีสมาชิก" ,"ไม่ผ่านการสอบป้องกันปริญญานิพนธ์"] } }, // ไม่เอาตัวเอง
        {
          $or: [
                { projectName: { $regex: safeKeyword, $options: "i" } },
                { engName: { $regex: safeKeyword, $options: "i" } }
          ]
        }
      ]
    }).limit(10);
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/addEventForGroup", apiLimiter, requireLogin, requireRole(['admin', 'teacher']), upload.single('file'), async (req, res) => {
    let groupNameStr;
    try {
        const { title, date, toDate, description, chosenGroup, advisor, greatDirector, director, dateTest, time } = req.body;
        const group = await Group.findById(chosenGroup);
        let missingGroups = [];

        if (!group) {
            return res.status(404).json({ error: "ไม่พบข้อมูลกลุ่ม" });
        }
        const rawGroupName = group.projectName;
        groupNameStr = rawGroupName.toString().trim();

        if (!title || !date) {
            return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
        }

        const eventId = generateEventId();
        let date1 = null;
        if (date && typeof date === 'string' && date.trim() !== '') {
            const [year, month, day] = date.split('-').map(Number);
            date1 = new Date(year, month - 1, day);
        }
        
        let date2 = null;
        if (toDate && typeof toDate === 'string' && toDate.trim() !== '') {
            const [year, month, day] = toDate.split('-').map(Number);
            date2 = new Date(year, month - 1, day);
        }
        
        const expire = date2 ? new Date(date2) : (date1 ? new Date(date1) : new Date());
        expire.setHours(23, 59, 59, 999);

        // --- ส่วนที่แก้ไข: จัดการไฟล์ Excel เข้า GridFS ---
        let uploadedFileId = null;

        let directorslist;


        if (title === "วันส่งเอกสาร") {
                if (group.status.includes('ผ่านการสอบป้องกันปริญญานิพนธ์') || group.status.includes('ไม่มีสมาชิก') || group.status.includes('ไม่ผ่านการสอบป้องกันปริญญานิพนธ์')){
                    return res.status(404).json({ error: "กลุ่มนี้ไม่สามารถตั้งวันส่งเอกสารได้เนื่องจาก"+ group.status + group.status === 'ผ่านการสอบป้องกันปริญญานิพนธ์' ? 'แล้ว' : ''});
                }
                
                if (group.status.includes('พร้อมสอบ')){
                    return res.status(404).json({ error: "กลุ่มนี้ไม่สามารถตั้งวันส่งเอกสารได้เนื่องจาก"+ group.status + 'อยู่แล้ว'});
                }

                  let existingPaper = await Paper.findOne({
                      groupId: group._id,
                      passTimes: group.passTimes,
                      mention: { $not: /จะมีการจัดสอบ/ }
                  });

                  let savedPaper;
                  if (existingPaper) {
                      existingPaper.eventId = eventId;
                      existingPaper.mention = description || title;
                      existingPaper.expireAt = expire;
                      existingPaper.date = expire;
                      savedPaper = await existingPaper.save();
                  } else {
                      const newPaper = new Paper({
                          eventId: eventId,
                          groupId: group._id,
                          mention: description || title,
                          expireAt: expire,
                          passTimes: group.passTimes,
                          date: expire
                      });
                      savedPaper = await newPaper.save(); 
                  }

                  const groupUpdate = await Group.findOneAndUpdate(
                      { _id: group._id },
                      { $inc: { fileTimes: 1 } },
                      { new: true }
                  );
                  const saveGroup = await groupUpdate.save();
          }else if (title === "วันสอบ") {
            if (group.status.includes('ผ่านการสอบป้องกันปริญญานิพนธ์') || group.status.includes('ไม่มีสมาชิก') || group.status.includes('ไม่ผ่านการสอบป้องกันปริญญานิพนธ์')){
                return res.status(404).json({ error: "กลุ่มนี้ไม่สามารถสอบได้" });
            }
            if (!group.status.includes('พร้อมสอบ')){
                return res.status(404).json({ error: "กลุ่มนี้ยังไม่พร้อมสอบ" });
            }
            directorslist = director;

            const testresultsdate = new Date(expire);
            testresultsdate.setDate(testresultsdate.getDate() + 7);

            const cleanNameFunc = (s) => s.trim().replace(/^(ดร\.|ผศ\.ดร\.|ผศ\.|รศ\.ดร\.|รศ\.|ศ\.|มร\.|นาย|นางสาว|นาง|อาจารย์|อ\.)\s?/, "").split(/\s+/)[0];

            let advStr = advisor ? advisor.toString().split(/[,\/;]|\sและ\s/).map(cleanNameFunc).filter(s => s !== "").join(", ") : "";
            let gDirStr = greatDirector ? greatDirector.toString().split(/[,\/;]|\sและ\s/).map(cleanNameFunc).filter(s => s !== "").join(", ") : "";
            let dirStr = director ? director.toString().split(/[,\/;]|\sและ\s/).map(cleanNameFunc).filter(s => s !== "").join(", ") : "";

            if(!dirStr && !advStr && !gDirStr){
                return res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง: ไม่มีกรรมการ" });
            }

            const paperPassTimes = group.passTimes || 0;

            const newPaper = new Paper({
                eventId: eventId,
                groupId: group._id,
                mention: description || title,
                expireAt: testresultsdate,
                passTimes: paperPassTimes,
                date: date1,
                advisor: advStr,
                greatDirector: gDirStr,
                director: dirStr
            });

            const savedPaper = await newPaper.save(); 
            
            const previousPaper = await Paper.findOne({
                groupId: savedPaper.groupId,
                passTimes: savedPaper.passTimes,
                _id: { $ne: savedPaper._id },
                mention: { $not: /จะมีการจัดสอบ/ }
            }).sort({ _id: -1 });

            if (previousPaper) {
                const oldFiles = await PaperFile.find({ paperId: previousPaper._id });
                for (const oldFile of oldFiles) {
                    if (oldFile.file && oldFile.file.fileId) {
                        try {
                            const uploadStream = bucket.openUploadStream(oldFile.file.filename, {
                                contentType: oldFile.file.contentType
                            });
                            const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(oldFile.file.fileId));
                            
                            await new Promise((resolve, reject) => {
                                downloadStream.pipe(uploadStream)
                                    .on('error', reject)
                                    .on('finish', resolve);
                            });

                            const newPaperFile = new PaperFile({
                                paperId: savedPaper._id,
                                groupId: savedPaper.groupId,
                                file: {
                                    fileId: uploadStream.id,
                                    filename: oldFile.file.filename,
                                    contentType: oldFile.file.contentType
                                },
                                check: oldFile.check
                            });
                            await newPaperFile.save();
                        } catch (copyErr) {
                            console.error("❌ Failed to copy file for exam:", copyErr);
                        }
                    }
                }
            }

            const mem1 = await User.findOne({ username: group.member1 });
            const mem2 = group.member2 ? await User.findOne({ username: group.member2 }) : null;

            if(group.passTimes === 0){
                group.status = "รอสอบนำเสนอหัวข้อปริญญานิพนธ์"
            }else if (group.passTimes >= 1){
                if(mem1?.branch === "ECT" || mem2?.branch === "ECT"){
                  group.status = "รอสอบก้าวหน้าปริญญานิพนธ์";
                }else{
                  group.status = "รอสอบป้องกันปริญญานิพนธ์";
                }
            }
            await group.save();
        }
        const newEvent = new Event({
            id: eventId,
            title,
            description,
            testTableSingle:{
                advisor: advStr,
                greatDirector: gDirStr,
                director: dirStr,  
                date:  dateTest, 
                time: time        
            },
            toGroup: chosenGroup,
            date: date1,
            toDate: date2,
            expireAt: expire,
            fileId: uploadedFileId // 🛠️ เซฟ ID ไฟล์เหมือนกัน
        });

        await newEvent.save();

        const mem1 = await User.findOne({ username: group.member1 });
        const mem2 = group.member2 ? await User.findOne({ username: group.member2 }) : null;
        const advisorInfo = await User.findOne({ username: group.advisor });

        // 🔔 เรียกแจ้งเตือน (เช็คให้ชัวร์ว่าลบบั๊กในฟังก์ชันนี้แล้ว)
        await sendGroupNotification('alert_group', chosenGroup, req.session.user.username, req.session.user.name, `มีกิจกรรมใหม่: ${title}`, req.session.user.picture || null , eventId , expire , mem1 , mem2 , advisorInfo);

         await createLog(req, "ADD_EVENT_GROUP", {
            username: req.session.user.username,
            eventTitle: req.body.title, // เก็บชื่อกิจกรรมที่ถูกเพิ่มเข้ามาใน Log ด้วย
            group: groupNameStr
        });

        if (missingGroups.length > 0) {
            return res.status(201).json({ 
                message: "บันทึกสำเร็จ", 
                warning: "ไม่พบข้อมูลกลุ่มดังต่อไปนี้ในระบบ:", 
                missingGroups: missingGroups 
            });
        }else{ 
            return res.status(201).json({ message: "บันทึกสำเร็จ" });
        }
       
    } catch (err) {  
        console.error("❌ API Error:", err); 

        // 💡 ส่ง Error กลับไปหาหน้าบ้านแบบ string
        return res.status(500).json({ 
            message: err.message || err.toString() || "Server Internal Error" 
        });
    }
    
});

app.get("/api/getMyGroups", requireLogin, async (req, res) => {
    try {
        const groups = await Group.find({ status: {$in: ["พร้อมสอบนำเสนอหัวข้อปริญญานิพนธ์", "พร้อมสอบป้องกันปริญญานิพนธ์", "พร้อมสอบก้าวหน้าปริญญานิพนธ์"]}});
        const teachers = await User.find({ role: {$in: ["teacher", "admin"]} });

        res.json({
            groups,
            teachers
        });
    }catch (err) {
        console.error("❌ Error in getMyPapers:", err);
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลเอกสาร" });
    }
});

app.get("/api/getUsers", async (req, res) => {
    try {
        const users = await User.find({});

        res.json({
            users,
        });
    }catch (err) {
        console.error("❌ Error in getMyPapers:", err);
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลเอกสาร" });
    }
});

// Socket.IO
io.on("connection", (socket) => {
  const username = socket.handshake.query.username;

  if (username) {
      socket.username = username;
      socket.join(username); // เข้าห้องส่วนตัวเพื่อรับ Notification
      userSockets.set(username, socket.id); // บันทึกข้อมูลลง Map
  }
  
  // รับข้อความใหม่
  socket.on("join group", (groupId) => {
      socket.join(groupId);
  });


  socket.on("disconnect", () => {
    if (socket.username) {
      userSockets.delete(socket.username);
    }
  });
});

// Start server with error handling
server.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`);
}).on('error', (err) => {
  console.error('❌ Server error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use`);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
