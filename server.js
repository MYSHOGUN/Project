const Message = require("./models/Message"); // ✅ import model

const Group = require("./models/Group"); // ✅ import group model

const News = require('./models/News'); // ✅ import news model

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

const Log = require("./models/Log");

const logger = require('./models/logger');

const nodemailer = require("nodemailer");

const streamifier = require('streamifier');

const crypto = require('crypto');

const { PDFDocument } = require('pdf-lib');

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
    console.log("✅ Migrated old notifications to read state.");
};

mongoose.connection.once("open", () => {
    bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "fs" });
    console.log("✅ GridFSBucket initialized and ready");
    
    // เรียก Migration แจ้งเตือนเก่าตรงนี้เลย (ถ้าต้องการรัน)
    migrateOldNotis().catch(err => console.error("Migration error:", err));
});

// ส่วนการเรียกใช้ connectDB ให้แยกออกมาต่างหาก
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;

const session = require("express-session");
const bcrypt = require("bcrypt");
const User = require("./models/User"); // ✅ import model

const multer = require("multer");
const { GridFSBucket, ObjectId } = require("mongodb");
const { userInfo, devNull } = require("os");
const { group } = require("console");

//GGEZ
// ใช้ memory storage ของ multer
const storage = multer.memoryStorage();
const upload = multer({ storage , limits: { fileSize: 20 * 1024 * 1024 }});

const fs = require('fs'); // ต้องใช้ในการลบไฟล์ แต่ในกรณีนี้เราจะใช้ Buffer แทน
const XLSX = require('xlsx'); // ✅ นำเข้าไลบรารีสำหรับอ่าน Excel
const { send } = require("process");


const processExcelFile = (buffer) => {
    try {
        // ใช้ XLSX.read() อ่าน Buffer โดยตรง
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0]; // อ่านชีทแรก
        const worksheet = workbook.Sheets[sheetName];

        // แปลงข้อมูลชีทเป็น JSON Array
        const data = XLSX.utils.sheet_to_json(worksheet, { range: 8 });
        
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
    const saltRounds = 10;
    const PENDING_PASS_STRING = crypto.randomBytes(16).toString('hex'); // สร้างรหัสผ่านชั่วคราวแบบสุ่ม
    const pendingHashedPassword = await bcrypt.hash(PENDING_PASS_STRING, saltRounds); 

    for (const row of dataArray) {
        // 1. ดึงเลขประจำตัว
        const rawUsername = row['เลขประจำตัว']; 
        if (!rawUsername || isNaN(rawUsername)) continue; 

        const trimmedUsername = String(rawUsername).trim();
        const emailExel = `s${trimmedUsername}@kmutnb.ac.th`.toLowerCase();

        // 2. จัดการเรื่องชื่อ (เอา คำนำหน้า + ชื่อ)
        const title = (row['คำนำหน้าชื่อ'] || '').trim();
        const firstName = (row['ชื่อ'] || 'Pending').trim();
        const lastName = (row['นามสกุล'] || 'Registration').trim();
        const role = (row['ตำแหน่ง'] === 'teacher' || row['ตำแหน่ง'] === 'อาจารย์' ? 'teacher' : row['ตำแหน่ง'] === 'secretary' || row['ตำแหน่ง'] === 'เลขานุการ' ? 'secretary' : 'user').trim().toLowerCase();


        const userData = {
            username: trimmedUsername,
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
                filter: { username: trimmedUsername },
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

let bucket;

/*connectDB().then(() => {
  bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "fs" });
  console.log("✅ GridFSBucket initialized");
});*/

async (req, res) => {
    try {
        // ดึงเฉพาะคนที่เป็น user และเรียงลำดับรหัส
        const students = await User.find({ role: 'user' }).sort({ username: 1 });

        // Logic การจัดกลุ่ม (Group by Prefix)
        const groupedData = students.reduce((acc, student) => {
            const prefix = student.username.substring(0, 2); // ดึง 63, 64...
            if (!acc[prefix]) acc[prefix] = [];
            acc[prefix].push(student);
            return acc;
        }, {});

        res.render('admin/user-list', { groupedData });
    } catch (err) {
        res.status(500).send("Error fetching users");
    }
}

async function generateAutoFilledPDF(groupData) {
    try {
        const templatePath = path.join(__dirname, 'app1', 'src', 'template', 'แบบฟอร์มขออนุมัติหัวข้อสอบก้าวหน้าและสอบป้องกัน.pdf');
        // ใช้ฟอนต์ Bold ตามที่คุณต้องการ
        const fontPath = path.join(__dirname, 'app1', 'src', 'fonts', 'THSarabunNew Bold.ttf');
        
        console.log("🔍 กำลังโหลดฟอนต์จาก:", fontPath);

        const templateBuffer = fs.readFileSync(templatePath);
        const fontBuffer = fs.readFileSync(fontPath);
        
        const pdfDoc = await PDFDocument.load(templateBuffer);
        pdfDoc.registerFontkit(fontkit);

        const thaiFont = await pdfDoc.embedFont(fontBuffer);
        const form = pdfDoc.getForm();

        const smartFill = (name, value) => {
            try {
                const field = form.getField(name);
                if (field && field.constructor.name === 'PDFTextField') {
                    const textValue = value ? value.toString() : "-";
                    
                    // 1. ดึงขนาดความกว้างของช่องจริงใน PDF
                    const widgets = field.acroField.getWidgets();
                    if (!widgets || widgets.length === 0) return;
                    const width = widgets[0].getRectangle().width;

                    // 2. ตั้งค่าเริ่มต้นสำหรับ Auto-fit
                    let fontSize = 12; // ขนาดเริ่มต้น (หนาและสวย)
                    field.updateAppearances(thaiFont);

                    // 3. คำนวณขนาดฟอนต์ให้พอดีช่อง (Auto-fit Logic)
                    let textWidth = thaiFont.widthOfTextAtSize(textValue, fontSize);
                    while (textWidth > width - 6 && fontSize > 6) { // Margin 6 pt
                        fontSize -= 0.5;
                        textWidth = thaiFont.widthOfTextAtSize(textValue, fontSize);
                    }

                    // 4. สั่งกรอกข้อมูลด้วยขนาดที่คำนวณได้
                    field.setFontSize(fontSize);
                    field.setText(textValue);
                    
                    // บังคับ Appearance อีกครั้งหลัง SetText
                    if (typeof field.updateAppearances === 'function') {
                        field.updateAppearances(thaiFont);
                    }
                }
            } catch (e) {
                console.warn(`⚠️ ข้ามฟิลด์ ${name}: ${e.message}`);
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
        console.log(`[LOG]: ${action} by ${newLog.username}`);
    } catch (err) {
        logger.error(`Failed to save log to DB: ${err.message}`);
    }
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "fallback-for-local-dev", // ควรใช้สตริงที่ยาวและเดายาก
  resave: false,
  saveUninitialized: false, // เปลี่ยนเป็น false เพื่อไม่ให้สร้าง session ว่างๆ ถ้ายังไม่ login
  cookie: {
    httpOnly: true, // ✅ ป้องกัน JavaScript เข้าถึง cookie (กัน XSS)
    secure: false,  // หากรันบน HTTPS (Production) ให้เปลี่ยนเป็น true
    sameSite: 'lax' // ช่วยป้องกันการโจมตีแบบ CSRF
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
      
      if (view === "login" || view === "register" || view === "forgotPassword" || view === "resetPassword") {
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
    if (!req.session.user || req.session.user.role !== role) {
      return res.status(403).send("⛔ ไม่ได้รับอนุญาต");
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

function generateEventId() {
    return crypto.randomUUID(); 
    // ผลลัพธ์จะเป็นแบบ: "123e4567-e89b-12d3-a456-426614174000"
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
    res.status(500).send("Error loading news");
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

    let hasMovement = false;

    let mem1 = null;
    let mem2 = null;
    let adv = null;

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
        text: req.body.text.trim(),
        senderPic: req.session.user.picture,
        timestamp: new Date(),
        groupMember: [mem1,mem2,adv]
      });
      await textMessage.save();
      messages.push(textMessage);

      io.to(req.params.groupId).emit("group message", textMessage);
      await sendGroupNotification('message',groupId, req.session.user.username, req.session.user.name, req.body.text.trim(), req.session.user.picture ? req.session.user.picture : null , null , undefined , null , null , null);

      hasMovement = true;
    }

    // ถ้ามีไฟล์
    if(req.files && req.files.length > 0){
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
        await sendGroupNotification('message',groupId, req.session.user.username, req.session.user.name, `ส่งไฟล์: ${file.originalname}`, req.session.user.picture || null , null , undefined , null , null , null);

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

  async function sendGroupNotification(type, groupId, senderUsername, sender, messageText, senderPic, mention , expire , member1, member2 , advisor) {
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
                senderName: sender,
                text: messageText,
                groupId: groupId,
                senderPic: senderPic,
                type: 'group_alert'
            });
        }else if (type === 'addGroup') {
          // 1. เตรียมรายชื่อสมาชิกกลุ่ม
          const recipientList = [];
          if (member2) recipientList.push(member2);
          if (advisor) recipientList.push(advisor);
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
            const recipientList = [];
            if (member1) recipientList.push(member1);
            if (member2) recipientList.push(member2);
            if (advisor) recipientList.push(advisor);
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
                    senderName: sender,
                    text: messageText,
                    groupId: groupId,
                    senderPic: senderPic,
                    type: 'group_alert'
                });
            });
        }

    } catch (err) {
        console.error("❌ Notification Error:", err);
    }
}


app.get("/file/download/:id", requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send("Invalid file ID");
    }

    const fileId = new ObjectId(req.params.id);
    const files = await bucket.find({ _id: fileId }).toArray();
    if (!files || files.length === 0) return res.status(404).send("File not found");

    res.set("Content-Type", files[0].contentType);
    res.set("Content-Disposition", `attachment; filename="${files[0].filename}"`);

    bucket.openDownloadStream(fileId).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error downloading file");
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

app.get("/login", checkFailModal, checkSuccessModal, (req, res) => {
  //console.log("Session failModal:", req.session.failModal);
  const inputUsername = req.session.inputUsername || "";
  req.session.inputUsername = null; // ล้างค่าหลังใช้งาน
  renderWithLayout(res, "login", { 
    title: "KMUTNB Project - Login", 
    failModal: res.locals.failModal,
    successModal: res.locals.successModal,
    inputUsername  // ส่งค่าไป EJS
  }, req.path, req);
  
});
app.get("/flowchart", requireLogin,(req, res) => {
  renderWithLayout(res, "flowchart", { title: "KMUTNB Project - Flowchart" }, req.path,req);
});
app.get("/file", requireLogin, (req, res) => {
  renderWithLayout(res, "file", { title: "KMUTNB Project - File" }, req.path,req);
});
app.get("/group", requireLogin, async (req, res) => {
  if(req.session.user.role === "admin" || req.session.user.role === "secretary" ) return res.redirect("/userInfo")
  try{

    if (req.session.user && Array.isArray(req.session.user.group) && req.session.user.group.length === 0 && req.session.user.role !== "teacher") {
      return res.redirect("/addGroup");
    }

    const username = req.session.user.username;

    let groups;
    if(req.session.user.role === "admin"){
      groups = await Group.find().sort({ lastUpdatedTime: -1 });
    }else{   
      groups = await Group.find({ allMember: { $in: [username] } }).sort({ lastUpdatedTime: -1 });
    }

    let userInfo = []; // เก็บข้อมูลสมาชิกแยกตามกลุ่ม

    const activeGroups = groups.filter(g => g.member1 === username || g.member2 === username || g.advisor === username); // ปรับเงื่อนไขตามฟิลด์ status ของคุณ
    const pastGroups = groups.filter(g => g.member1 != username && g.member2 != username && g.advisor != username);

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
    res.status(500).send("Error loading users");
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

app.post("/login" , apiLimiter,async (req, res) => {
  const { username, password ,rememberMe} = req.body;
  const user = await User.findOne({ username });

  //console.log("✅ User from DB:", user); // <-- ใส่ตรงนี้
  if (!user) {
    req.session.failModal = "user"; // ตั้งค่าเพื่อแสดง modal
    console.log("Set failModal = user");
    return req.session.save(() => res.redirect("/login"));
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    req.session.failModal = "password"; // ตั้งค่าเพื่อแสดง modal
    req.session.inputUsername = username; // เก็บ username ไว้
    console.log("Set failModal = password");
    return req.session.save(() => res.redirect("/login"));
  }
  
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

// ค้นหาผู้ใช้ (ยกเว้นตัวเอง)
app.get("/search-users", requireLogin, async (req, res) => {
  const keyword = req.query.keyword || "";
  try {
    const users = await User.find({
      $and: [
        { username: { $ne: req.session.user.username } }, // ไม่เอาตัวเอง
        { role: "user" }, // ไม่เอาอาจารย์
        { lastname: { $ne: "Registration"} },
        { name: { $ne: "Pending"}}, // ไม่เอาบัญชีที่รอการลงทะเบียน
        {
          $or: [
            { username: { $regex: keyword, $options: "i" } },
            { name: { $regex: keyword, $options: "i" } },
            { lastname: { $regex: keyword, $options: "i" } }
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
  try {
    const users = await User.find({
      $and: [
        { username: { $ne: req.session.user.username } }, // ไม่เอาตัวเอง
        { role: { $ne: "user"} }, // เอาอาจารย์
        {
          $or: [
            { username: { $regex: keyword, $options: "i" } },
            { name: { $regex: keyword, $options: "i" } },
            { lastname: { $regex: keyword, $options: "i" } }
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

    const status = "รอนำเสนอหัวข้อ";

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
      console.log(existingGroup, " สมาชิกนี้มีกลุ่มอยู่แล้ว");
      return res.status(400).send("สมาชิกนี้มีกลุ่มอยู่แล้ว");
    }

    const mem1 = await User.findOne({ username: member1 });

    const mem2 = member2 === null || member2 === "" || member2 === "undefined" ? null : `${member2} (Pending)`;

    const adv = advisor === null || advisor === "" || advisor === "undefined" ? null : `${advisor} (Pending)`;

    // บันทึกกลุ่มใหม่
    const newGroup = new Group({ projectName, engName, member1: member1, member2: mem2 , advisor : adv,status , allMember: [member1]});
    await newGroup.save();

    sendGroupNotification("addGroup", newGroup._id, "ระบบ", "ระบบ", `คุณถูกเพิ่มเข้ากลุ่มโดย ${mem1.name}`, null, null , undefined , null ,  member2 , advisor)

    await User.findOneAndUpdate(
      { username: member1 }, // หรือฟิลด์สำหรับค้นหาผู้ใช้ เช่น { username: member1 }
      { $set: { group: [newGroup._id] } }
    );

    // อัปเดต session.user.group = "true"
    req.session.user.group = [newGroup._id];

    res.status(201).send("บันทึกกลุ่มสำเร็จ");
  } catch (err) {
    console.error("❌ Error saving group:", err);
    res.status(500).send("เกิดข้อผิดพลาดในการบันทึกกลุ่ม");
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
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).send("ไม่พบกลุ่ม");
    }

    // ตรวจสอบว่ามีคนอื่นมาเสียบแทนไปก่อนหรือยัง
    if (group.member2 && group.member2 !== `${username} (Pending)`) {
      return res.status(400).send("กลุ่มนี้มีสมาชิกครบแล้ว");
    }
    
    // 1. อัปเดตข้อมูลกลุ่ม
    let user = await User.findOne({ username: username }); // ดึงข้อมูลผู้ใช้จาก DB เพื่อความแน่นอน
    if(user.role === "teacher"){
      group.advisor = username;
      if (!group.allMember.includes(username)) {
          group.allMember.push(username);
      }
    }else{
      group.member2 = username;
      if (!group.allMember.includes(username)) {
          group.allMember.push(username);
      }
    }
    await group.save();

    // 2. ลบแจ้งเตือนทิ้ง
    await Notification.findByIdAndDelete(notiId);

    let updatedUser;
    if (req.session.user.role !== "teacher") {
        updatedUser = await User.findOneAndUpdate(
            { username: username },
            { $set: { group: group._id } },
            { new: true } // ✅ คืนค่าที่อัปเดตแล้วกลับมา
        );
    } else {
        updatedUser = await User.findOneAndUpdate(
            { username: username },
            { $push: { group: group._id } },
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
    res.status(500).send("เกิดข้อผิดพลาดในการเข้าร่วมกลุ่ม");
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

    // ✅ 1. ล้างชื่อสมาชิกคนที่ 2 ออกเพื่อให้กลุ่มว่าง
    group.member2 = null; 
    await group.save();

    // ✅ 2. ลบการแจ้งเตือนทิ้งเพื่อให้หายไปจากหน้าจอผู้ใช้
    await Notification.findByIdAndDelete(notiId);

    // ✅ 3. อัปเดต Session ของผู้ใช้ที่กดปฏิเสธให้กลับเป็นไม่มีกลุ่ม (null)
    
    req.session.save(() => {
        res.status(200).send("ปฏิเสธเรียบร้อย");
    });
  } catch (err) {
    console.error("❌ Error denying invitation:", err);
    res.status(500).send("เกิดข้อผิดพลาดในการปฏิเสธ");
  }
  await createLog(req, "SENT_CHAT", { 
        username: req.session.user.username,
        type: "deny" // ดึงชื่อกิจกรรมมาเก็บไว้ดูย้อนหลังได้
    });
});

app.post("/groups-update/:groupId", apiLimiter,requireLogin, async (req, res) => {
    let group;
  try {
    const { member2, advisor } = req.body;
    const { groupId } = req.params;

    // 1. ค้นหากลุ่มด้วย ID ที่ได้มา (ตัวแปร group จะมีค่าแน่นอนถ้าเจอ)
     group = await Group.findById(groupId);
    if (!group) return res.status(404).send("ไม่พบข้อมูลกลุ่ม");

    const mem1 = await User.findOne({ username: group.member1 });

    // 2. อัปเดตข้อมูลเฉพาะที่มีการส่งมาใหม่
    if (member2 && member2 !== "" && !member2.includes("(Pending)")) {
        group.member2 = `${member2} (Pending)`;
    }

    if (advisor && advisor !== "" && !advisor.includes("(Pending)")) {
        group.advisor = `${advisor} (Pending)`;
    }

    // 3. บันทึก (ใช้ await group.save() มั่นใจว่าไม่ล่มเพราะ group ไม่เป็น null)
    await group.save();

    // 4. ส่งแจ้งเตือน
    await sendGroupNotification(
      "addGroup", groupId, "ระบบ", "ระบบ", 
      `คุณถูกเพิ่มเข้ากลุ่มโดย ${mem1?.name || 'หัวหน้ากลุ่ม'}`, 
      null, null, undefined, null, 
      (member2 && !member2.includes("(Pending)")) ? member2 : null, 
      advisor
    );

    res.status(201).send("ส่งคำเชิญกลุ่มสำเร็จ");
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).send("เกิดข้อผิดพลาด: " + err.message);
  }
    await createLog(req, "UPDATE_GROUP", {
        groupName: group ? group.projectName : "Unknown Group",
        updateBy: req.session.user.username // ดึงชื่อกิจกรรมมาเก็บไว้ดูย้อนหลังได้
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
    res.status(500).send("เกิดข้อผิดพลาดที่ server");
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

    // ตรวจสอบว่า user อยู่ field ไหน
    if (group.member1 === username) {
      group.member1 = group.member2; // เลื่อน member2 ขึ้นมาแทนที่
      group.member2 = null; // ล้าง member2
    } else if (group.member2 === username) {
      group.member2 = null;
    }  else if (group.advisor === username) {
      group.advisor = null;
    } else {
      return res.status(400).send("คุณไม่ได้อยู่ในกลุ่มนี้");
    }

    if(group.member1 === null){
      group.status = "ไม่มีสมาชิก";
    }

    await group.save();

    // อัปเดต User ด้วย (ถ้า User มี field group)
    await User.findOneAndUpdate(
      { username },
      { $set: { group: [] } } // เอา group ออก
    );

    // อัปเดต session
    req.session.user.group = [];

    res.send("ออกจากกลุ่มสำเร็จ");
  } catch (err) {
    console.error(err);
    res.status(500).send("เกิดข้อผิดพลาดที่ server");
  }
    await createLog(req, "LEAVE_GROUP", {
        groupName: group ? group.projectName : "Unknown Group",
        leaveBy: req.session.user.username // ดึงชื่อกิจกรรมมาเก็บไว้ดูย้อนหลังได้
    });
});

app.get("/addGroup", requireLogin, async (req, res) => {
  if(req.session.user && Array.isArray(req.session.user.group) && req.session.user.group.length > 0){
    console.log("User already in group, redirecting to /group");
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
    res.status(500).send("Error loading groups");
  }
});

app.get("/updateGroup", requireLogin, async (req, res) => {
  try {
    const username = req.session.user.username;
    
    // 1. ดึงกลุ่มของผู้ใช้
    const groups = await Group.find({
      $or: [
        { member1: username },
        { member2: username },
      ]
    });

    // 2. ถ้าไม่พบกลุ่ม ให้ Redirect หรือส่งค่าว่างไปป้องกันการ Crash
    if (!groups || groups.length === 0) {
      console.log("⚠️ No groups found for user:", username);
      return res.redirect("/group"); // หรือส่ง [] ไปที่ render
    }

    let userInfo = [];
    const targetGroup = groups[0];

    // 3. ดึงข้อมูลสมาชิกด้วยความระมัดระวัง
    const mem1 = await User.findOne({ username: targetGroup.member1 });
    
    // เช็คกรณี member2 อาจจะเป็นค่าว่าง หรือเป็น String "(Pending)"
    let mem2 = null;
    if (targetGroup.member2) {
        // ลบคำว่า (Pending) ออกก่อนค้นหาใน DB ถ้ามีการเก็บแบบต่อท้าย string
        const cleanM2Username = targetGroup.member2.replace(" (Pending)", "");
        const user2 = await User.findOne({ username: cleanM2Username });
        
        if (String(targetGroup.member2.includes("(Pending)"))) {
            mem2 = user2 ? { ...user2.toObject(), lastname: `${user2.lastname} (Pending)` } : null;
        } else {
            mem2 = user2;
        }
    }

    let adv = null;
    if (targetGroup.advisor) {
        // ลบคำว่า (Pending) ออกก่อนค้นหาใน DB ถ้ามีการเก็บแบบต่อท้าย string
        const cleanAdUsername = targetGroup.advisor.replace(" (Pending)", "");
        const advisor = await User.findOne({ username: cleanAdUsername });
        
        if ((String(targetGroup.advisor.includes("(Pending)")))) {
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
    res.status(500).send("เกิดข้อผิดพลาดในการโหลดข้อมูลกลุ่ม");
  }
});

app.post("/api/news", requireLogin, apiLimiter, upload.single("file"), async (req, res) => {
    try {
        const { newsTitle, newsData } = req.body;
        let imgInfo = {}; // ใช้อ็อบเจกต์เพื่อเก็บข้อมูลรูปภาพ

        // 1. ตรวจสอบว่ามีไฟล์รูปภาพหรือไม่
        if (req.file) {
            
            // 2. สร้าง Upload Stream ไปยัง GridFS
            // Note: ต้องใช้ req.file.filename (ที่ถูกกำหนดโดย multer) หรือ req.file.originalname 
            const uploadStream = bucket.openUploadStream(req.file.originalname, { 
                contentType: req.file.mimetype,
                // สามารถเพิ่ม metadata อื่นๆ ได้ที่นี่
            });
            
            // 3. กำหนดข้อมูลที่จะบันทึกลงใน Mongoose Schema
            imgInfo = {
                filename: req.file.originalname, // หรือใช้ req.file.filename ถ้า multer กำหนด
                contentType: req.file.mimetype,
                // Mongoose สามารถใช้ ID ที่ GridFS สร้างโดยอัตโนมัติมาอ้างอิงได้
                id: uploadStream.id // GridFS File ID (ObjectId)
            };

            // 4. ส่งไฟล์เข้าสู่ Stream และรอให้การอัปโหลดเสร็จสมบูรณ์
            // Note: การใช้ end() ไม่ใช่ async/await คุณควรใช้ Promise เพื่อรอ
            await new Promise((resolve, reject) => {
                uploadStream.once('finish', resolve);
                uploadStream.once('error', reject);
                uploadStream.end(req.file.buffer); 
            });

            console.log(`File uploaded to GridFS with ID: ${uploadStream.id}`);
        }

        // 5. สร้าง News Document ใหม่
        const newNews = new News({
            title: newsTitle,
            data: newsData,
            // บันทึกข้อมูลรูปภาพ (ถ้ามี)
            img: req.file ? imgInfo : null 
        });

        // 6. บันทึก Document ลงใน MongoDB
        await newNews.save();

        // 7. ส่งการตอบกลับสำเร็จ
        return res.status(201).json({ 
            message: "News created successfully", 
            newsId: newNews._id,
            fileId: imgInfo.id
        });

    } catch (err) {
        console.error("News creation error:", err);
        // หากเกิดข้อผิดพลาดในการอัปโหลด/บันทึก ให้ส่งสถานะ 500
        return res.status(500).json({ 
            error: "Failed to create news or upload file" 
        });
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
        res.status(500).send("Error streaming image");
    }
});

app.get("/news/details/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const news = await News.findOne({ _id: id });

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).send("Invalid news ID");
        } 

        renderWithLayout(res, "news", { title: "KMUTNB Project - News Details" ,newsDetails: news,user: req.session.user}, req.path,req);
      }catch (err) {
        console.error("Error fetching news details:", err);
        return res.status(500).send("Error fetching news details");
      }
});

app.post("/news-update/:newsId", requireLogin, apiLimiter,upload.single("newImage"), async (req, res) => {
    // ชื่อ field 'newImage' ต้องตรงกับชื่อที่ใช้ใน FormData ฝั่ง Client

    const newsId = req.params.newsId;

    if (!newsId || !mongoose.Types.ObjectId.isValid(newsId)) {
        return res.status(400).json({ success: false, message: "Invalid News ID" });
    }

    try {
        // 1. ดึงข้อมูล Text จาก req.body (แยกโดย Multer)
        const { newsTitle, newsData } = req.body; 
        
        let updateData = { 
            title: newsTitle,
            data: newsData
        };

        // 2. ค้นหาข่าวเดิมเพื่อดึง ID รูปภาพเก่า
        let oldNews = await News.findById(newsId);
        if (!oldNews) {
            return res.status(404).json({ success: false, message: "News not found" });
        }

        // 3. จัดการรูปภาพใหม่ (ถ้ามีไฟล์ใหม่ถูกส่งมา)
        if (req.file) {
            // A. ลบรูปภาพเก่าจาก GridFS (ถ้ามีรูปเก่าอยู่)
            if (oldNews.img && oldNews.img.id) {
                try {
                    // ใช้ bucket.delete() กับ GridFS ID เก่า
                    await bucket.delete(oldNews.img.id);
                    console.log(`✅ Old file deleted from GridFS: ${oldNews.img.id}`);
                } catch (deleteErr) {
                    // หากลบไม่ได้ (เช่น ไฟล์ไม่มีอยู่) ให้แสดงคำเตือนและดำเนินการต่อ
                    console.warn(`⚠️ Warning: Could not delete old file ID ${oldNews.img.id}. Error:`, deleteErr.message);
                }
            }

            // B. บันทึกไฟล์ใหม่เข้า GridFS
            const uploadStream = bucket.openUploadStream(req.file.originalname, { 
                contentType: req.file.mimetype
            });
            
            await new Promise((resolve, reject) => {
                uploadStream.once('finish', resolve);
                uploadStream.once('error', reject);
                uploadStream.end(req.file.buffer); // ส่ง buffer ของไฟล์เข้า stream
            });

            console.log(`✅ New file uploaded to GridFS with ID: ${uploadStream.id}`);

            // C. อัปเดตข้อมูล img ใน Document ด้วย ID ใหม่
            updateData.img = {
                filename: req.file.originalname,
                contentType: req.file.mimetype,
                id: uploadStream.id // ID ใหม่ที่สร้างโดย GridFS
            };
        } 
        // 🚨 หมายเหตุ: ถ้าไม่มี req.file (ไม่ได้เปลี่ยนรูป), updateData จะมีแค่ title/data
        // ทำให้ ID รูปภาพเก่าถูกเก็บไว้ตามที่คุณต้องการโดยอัตโนมัติ

        // 4. อัปเดต News Document ใน MongoDB
        const updatedNews = await News.findByIdAndUpdate(
            newsId,
            { $set: updateData }, // ใช้ $set เพื่ออัปเดตเฉพาะ field ที่เปลี่ยน
            { new: true, runValidators: true } // คืนค่าเอกสารที่อัปเดตแล้ว
        );

        if (!updatedNews) {
            return res.status(404).json({ success: false, message: "News not found during update." });
        }

        // 5. ส่งการตอบกลับสำเร็จ
        res.status(200).json({ success: true, message: "บันทึกข่าวสำเร็จ", news: updatedNews });

    } catch (err) {
        console.error("❌ Error updating news:", err);
        // สามารถใช้ err.message เพื่อส่งรายละเอียดกลับไปได้
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดที่ Server: การอัปเดตล้มเหลว" });
    }
});

app.delete("/news-delete/:newsId", requireLogin, async (req, res) => {
    // Note: ควรเพิ่ม requireRole('admin') เพื่อความปลอดภัยหากไม่ได้ใช้ requireLogin ที่มีการตรวจสอบ role ภายใน
    // เช่น: app.delete("/news-delete/:newsId", requireRole('admin'), async (req, res) => { ...

    const newsId = req.params.newsId;

    if (!newsId || !mongoose.Types.ObjectId.isValid(newsId)) {
        return res.status(400).json({ success: false, message: "Invalid News ID" });
    }

    try {
        // 1. ค้นหาข่าวเพื่อดึง ID รูปภาพเก่า
        const newsToDelete = await News.findById(newsId);
        if (!newsToDelete) {
            return res.status(404).json({ success: false, message: "ไม่พบข่าวสารที่ต้องการลบ" });
        }

        // 2. ลบรูปภาพที่เกี่ยวข้องออกจาก GridFS (ถ้ามี)
        if (newsToDelete.img && newsToDelete.img.id) {
            try {
                // ใช้ bucket.delete() กับ GridFS ID
                await bucket.delete(newsToDelete.img.id);
                console.log(`✅ File deleted from GridFS: ${newsToDelete.img.id}`);
            } catch (deleteErr) {
                // โดยปกติ GridFS Bucket Delete จะโยน Error ถ้าไฟล์ไม่มีอยู่
                console.warn(`⚠️ Warning: Could not delete file ID ${newsToDelete.img.id}. Error:`, deleteErr.message);
                // เราจะดำเนินการลบ News Document ต่อไปแม้จะลบไฟล์ GridFS ไม่ได้
            }
        }

        // 3. ลบ News Document ออกจาก MongoDB
        const result = await News.deleteOne({ _id: newsId });

        if (result.deletedCount === 0) {
             return res.status(404).json({ success: false, message: "ไม่พบข่าวสารที่ต้องการลบ" });
        }

        // 4. ส่งการตอบกลับสำเร็จ
        res.status(200).json({ success: true, message: "ลบข่าวสำเร็จ" });

    } catch (err) {
        console.error("❌ Error deleting news:", err);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดที่ Server: การลบล้มเหลว" });
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

app.get("/addUser",requireLogin,(req, res) => {
  if(req.session.user.role !== "admin"){
    return res.redirect("/");
  }
  renderWithLayout(res, "addUser", { title: "KMUTNB Project - Add User" }, req.path,req);
});

app.get("/addUserExcel",requireLogin,(req, res) => {
  if(req.session.user.role !== "admin"){
    return res.redirect("/");
  }
  renderWithLayout(res, "addUserExcel", { title: "KMUTNB Project - Add User Excel" }, req.path,req);
});

app.get("/addUserSingle",requireLogin,(req, res) => {
  if(req.session.user.role !== "admin"){
    return res.redirect("/");
  }
  renderWithLayout(res, "addUserSingle", { title: "KMUTNB Project - Add User Single" }, req.path,req);
});

// API สำหรับเพิ่มผู้ใช้รายคน
app.post("/api/addUserSingle", apiLimiter,requireLogin, async (req, res) => {
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
        const PENDING_PASS_STRING = 'PENDING_REGISTRATION_FOR_SIGNUP'; 
        const pendingHashedPassword = await bcrypt.hash(PENDING_PASS_STRING, 10);
        const trimmedUsername = String(username).trim();
        const emailGenerated = "s" + trimmedUsername + "@kmutnb.ac.th";

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

app.post("/register", apiLimiter, upload.single("profileImage"), async (req, res) => {
  console.log("Body data:", req.body); // ต้องมีข้อมูลชื่อ นามสกุล ฯลฯ
  console.log("File data:", req.file);
  let username = (req.body.username || "").toString().trim();
  try {
    const {password, name, lastname, phone ,passwordConfirm} = req.body;

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
      const uploadStream = bucket.openUploadStream(req.file.originalname, { 
        contentType: req.file.mimetype,
      });

      img = {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
        id: uploadStream.id
      };
      
      await new Promise((resolve, reject) => {
        uploadStream.once('finish', resolve);
        uploadStream.once('error', reject);
        uploadStream.end(req.file.buffer); 
      });

    }

    
    if (existingUser && existingUser.email && existingUser.phone === null && existingUser.name === name && existingUser.lastname === lastname) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await User.findOneAndUpdate(
        { username: username },
        { password: hashedPassword, name, lastname, phone ,picture: req.file ? img : null}
      );
      req.session.successModal = "success";
      req.session.save(() => res.redirect("/login"));
    }else if (!existingUser) {
      req.session.failModal = "exists"; // ตั้งค่าเพื่อแสดง modal
      req.session.save(() => res.reload());
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

app.post("/api/notifications/mark-read/:id", apiLimiter,requireLogin, async (req, res) => {
    try {
        const notiId = req.params.id;
        const username = req.session.user.username;

        const expiredNoti = await Notification.findOne({ _id: notiId, expireAt: { $lt: new Date() } });

        // ไม่ว่าจะเป็นกลุ่ม หรือ 1:1 ให้บันทึกลง NotificationRead ทั้งหมด
        // เพื่อให้ระบบเสถียรและเช็ค hasRead ได้จากที่เดียว
        await NotificationRead.updateOne(
            { notificationId: notiId, userId: username },
            { $setOnInsert: { readAt: new Date(), expireAt: expiredNoti ? expiredNoti.expireAt : undefined } },
            { upsert: true }
        );

        res.json({ success: true });
    } catch (err) {
        console.error("❌ Mark read error:", err);
        res.status(500).json({ error: "Failed to mark as read" });
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
                { recipient: username, type: 'new_alert' }      // เผื่อมีการส่ง Alert ส่วนตัว
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

app.get("/event", requireLogin, (req, res) => {
  renderWithLayout(res, "event", { title: "KMUTNB Project - Event" }, req.path,req);
});

app.get("/addEvent", requireLogin, (req, res) => {
  if(req.session.user.role !== "admin"){
    return res.redirect("/event");
  }
  renderWithLayout(res, "addEvent", { title: "KMUTNB Project - Add Event" }, req.path,req);
});

app.post("/api/addEvent", apiLimiter, requireLogin, upload.single("file"), async (req, res) => {
    try {
        const { title, date, toDate, description } = req.body;
        const file = req.file;

        if (!title || !date) {
            return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
        }

        const eventId = generateEventId();
        const date1 = new Date(date);
        const date2 = toDate ? new Date(toDate) : null;
        const expire = toDate ? new Date(toDate) : new Date(date);
        expire.setHours(23, 59, 59, 999);

        // --- ส่วนที่แก้ไข: จัดการไฟล์ Excel เข้า GridFS ---
        let uploadedFileId = null;
        if (file) {
            const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
            
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

        const newEvent = new Event({
            id: eventId,
            title,
            description,
            testTable: file ? {
                filename: file.originalname,
                contentType: file.mimetype,
                fileId: uploadedFileId // ✅ ตอนนี้มี fileId แล้ว!
            } : null,
            date: date1,
            toDate: date2,
            expireAt: expire
        });

        await newEvent.save();

        let targetGroups = [];

        if (title === "วันส่งเอกสาร") {
              // 1. สร้าง bucket เฉพาะกิจตรงนี้เลยเพื่อให้มั่นใจว่าไม่เป็น undefined
              const localBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "fs" });

              const allGroups = await Group.find({ 
                  status: { $nin: ["ผ่านการสอบปริญญานิพนธ์", "ไม่มีสมาชิก"] } 
              });

              for (const group of allGroups) {
                  let finalAutoIdString = null;

                  try {
                      const autoPdfBuffer = await generateAutoFilledPDF(group);

                      if (autoPdfBuffer) {
                          // 2. ใช้ localBucket ที่สร้างขึ้นใหม่
                          const uploadStream = localBucket.openUploadStream(`แบบฟอร์ม_${group.projectName}.pdf`, { 
                              contentType: 'application/pdf' 
                          });

                          await new Promise((resolve, reject) => {
                              streamifier.createReadStream(Buffer.from(autoPdfBuffer))
                                  .pipe(uploadStream)
                                  .on('error', reject)
                                  .on('finish', resolve);
                          });

                          finalAutoIdString = uploadStream.id.toString();
                          console.log(`✅ เขียนไฟล์สำเร็จ ID: ${finalAutoIdString}`);
                      }
                  } catch (pdfErr) {
                      console.error(`❌ PDF Fail (${group.projectName}):`, pdfErr.message);
                  }

                  const newPaper = new Paper({
                      eventId: eventId,
                      groupId: group._id,
                      mention: description || title,
                      expireAt: expire,
                      passTimes: group.passTimes,
                      date: expire,
                      autoPdfId: finalAutoIdString // ✅ รอบนี้จะไม่เป็น null ถ้าผ่าน try
                  });

                  const savedPaper = await newPaper.save(); 
                  console.log(`💾 บันทึกสำเร็จ! ID: ${savedPaper.autoPdfId}`);
              }
          } else if (title === "วันสอบ" && file) {
            console.log("Processing Excel file for event:", title);
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

            const testresultsdate = new Date(expire);
            testresultsdate.setDate(testresultsdate.getDate() + 7);
          
            const paperPlatforms = [];
            const missingGroups = [];

            // วนลูปทีละแถวใน Excel (1 แถว = 1 กลุ่ม)
            for (const row of data) {
                const groupNameStr = (row.groupName || row.name || row.Groupname || row.ชื่อกลุ่ม).toString().trim();
                if (!groupNameStr){
                  return res.status(400).json({ error: "ข้อมูลใน Excel ไม่ถูกต้อง: ไม่มีชื่อกลุ่ม (groupName)" });
                }

                // 1. หาข้อมูลกลุ่มจาก DB เพื่อเอา id และ advisor (ใช้ findOne เพราะมีกลุ่มเดียว)
                const group = await Group.findOne({ projectName: groupNameStr });

                if (!group) {
                  // ✅ ถ้าไม่เจอกลุ่ม ให้เก็บชื่อไว้แล้วข้ามไปทำกลุ่มถัดไป (ไม่ return error ทันที)
                  missingGroups.push(groupNameStr);
                  continue; 
                }

                // 2. จัดการรายชื่อกรรมการจาก Excel: แยกชื่อ / ตัดคำนำหน้า / ตัดนามสกุล
                let directorslist = row.director || row.Director || row.กรรมการ
                if(!directorslist){
                  return res.status(400).json({ error: "ข้อมูลใน Excel ไม่ถูกต้อง: ไม่มีกรรมการ" });
                }

                let directors = directorslist.toString().split(/[,\/;]|\sและ\s/).map(s => {
                  let cleanName = s.trim().replace(/^(ดร\.|ผศ\.ดร\.|ผศ\.|รศ\.ดร\.|รศ\.|ศ\.|มร\.|นาย|นางสาว|นาง|อาจารย์|อ\.)\s?/, "");
                  return cleanName.split(/\s+/)[0]; 
                }).filter(s => s !== "");

                if(!directors || !Array.isArray(directors) || directorslist.length === 0){
                  return res.status(400).json({ error: "ข้อมูลใน Excel ไม่ถูกต้อง: ไม่มีกรรมการ" });
                }

                // 3. ไปดึงชื่อ Advisor จาก Collection User มาเพิ่ม (Add เข้าไป)
                const advisorUser = await User.findOne({ username: group.advisor });
                if (advisorUser && advisorUser.name) {
                  let advisorCleanName = advisorUser.name.toString().trim()
                    .replace(/^(ดร\.|ผศ\.ดร\.|ผศ\.|รศ\.ดร\.|รศ\.|ศ\.|มร\.|นาย|นางสาว|นาง|อาจารย์|อ\.)\s?/, "")
                    .split(/\s+/)[0];
                        
                    // ตรวจสอบก่อนว่าชื่อ Advisor ซ้ำกับกรรมการที่มีอยู่แล้วไหม ถ้าไม่ซ้ำก็ push เข้าไป
                    if (!directors.includes(advisorCleanName)) {
                      directors.push(advisorCleanName);
                      }
                }

                const paperPassTimes = group.passTimes || 0;

                // 4. เตรียมข้อมูล Paper สำหรับบันทึก (1 กลุ่มต่อ 1 Card)
                paperPlatforms.push({
                eventId: eventId,
                groupId: group._id,
                mention: description || title,
                expireAt: testresultsdate,
                passTimes: paperPassTimes,
                date: date1,
                director: directors // ในอาเรย์นี้จะมีทั้ง [กรรมการจาก Excel + Advisor]
              });
              const mem1 = await User.findOne({ username: group.member1 });
              const mem2 = await User.findOne({ username: group.member2 });

              if(group.passTimes === 0){
                group.status = "รอนำเสนอหัวข้อ"
              }else if (group.passTimes >= 1){
                if(mem1.branch === "ECT" || mem2.branch === "ECT"){
                  group.status = "รอสอบก้าวหน้า";
                }else{
                  group.status = "รอสอบปริญญานิพนธ์";
                }
              }
              await group.save();
                
            }

            if (paperPlatforms.length > 0) {
                await Paper.insertMany(paperPlatforms);
            }
        }
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
        // .sort({ date: 1 }) คือเรียงจากวันที่น้อยไปมาก (เก่าไปใหม่)
        const events = await Event.find().sort({ date: 1 });
        res.json(events);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch events" });
    }
});

app.get("/eventInfo/:id", requireLogin, async (req, res) => {
    try {
        const event = await Event.findOne({ id: req.params.id }); 
        
        if (!event) {
            return res.status(404).send("ไม่พบกิจกรรมนี้ในระบบ");
        }

        let tableData = [];
        const excelFileId = event.testTable?.fileId;

        if (excelFileId) {
            try {
                const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
                const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(excelFileId));
                
                let chunks = [];
                const buffer = await new Promise((resolve, reject) => {
                    downloadStream.on('data', chunk => chunks.push(chunk));
                    downloadStream.on('error', reject);
                    downloadStream.on('end', () => resolve(Buffer.concat(chunks)));
                });

                const workbook = XLSX.read(buffer, { type: 'buffer' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                tableData = XLSX.utils.sheet_to_json(sheet);
                // console.log(tableData); // เปิดดูเพื่อเช็คชื่อคอลัมน์ที่อ่านได้จริงใน Console
            } catch (err) {
                console.error("❌ Error reading Excel:", err);
            }
        }

        // ส่ง tableData เข้าไปด้วย
        renderWithLayout(res, "eventInfo", { 
            title: "KMUTNB Project - Event Info", 
            event,
            tableData // ข้อมูลตารางที่จะเอาไป Loop ใน EJS
        }, req.path, req);

    } catch (err) {
        console.error("❌ Error fetching event info:", err);
        res.status(500).send("เกิดข้อผิดพลาดในการดึงข้อมูลกิจกรรม");
    }
});


app.delete("/deleteEvent/:id", requireLogin, async (req, res) => {
    let event; // ประกาศตัวแปร event ไว้ข้างนอกเพื่อให้เข้าถึงได้ในส่วนของ createLog หลังจากการลบข้อมูลทั้งหมดแล้ว
    try {
        const uuidFromParams = req.params.id; // รับ UUID String จาก URL

        // 1. ค้นหา Paper ทั้งหมดที่ใช้ UUID นี้อ้างอิง
        const papers = await Paper.find({ eventId: uuidFromParams });
        const paperIds = papers.map(p => p._id); // เก็บ _id ของ Paper (อันนี้เป็น ObjectId)

        // 2. ค้นหา PaperFile ทั้งหมดที่เชื่อมกับ Paper เหล่านั้น
        const paperFiles = await PaperFile.find({ paperId: { $in: paperIds } });

        // 3. ลบไฟล์จริงใน GridFS
        for (const pf of paperFiles) {
            if (pf.file && pf.file.fileId) {
                try {
                    await bucket.delete(new mongoose.Types.ObjectId(pf.file.fileId));
                    console.log(`🗑️ Deleted GridFS File: ${pf.file.fileId}`);
                } catch (err) {
                    console.warn(`⚠️ Could not delete file ${pf.file.fileId}:`, err.message);
                }
            }
        }

        

        // 4. ลบข้อมูล Metadata อื่นๆ
        await PaperFile.deleteMany({ paperId: { $in: paperIds } }); 
        await Paper.deleteMany({ eventId: uuidFromParams }); // ลบโดยใช้ UUID
        await Notification.deleteMany({ mention: uuidFromParams }); 

        const group = await Group.find({status: { $ne: "ผ่านการสอบปริญญานิพนธ์" } });

        event = await Event.findOne({ id: uuidFromParams });

        if (event.title === "วันส่งเอกสาร") {
          const groupWaitFile = group.filter(g => g.status === "รอส่งเอกสาร");
          for (const g of groupWaitFile) {
            if (g.passTimes === 0) {
              g.status = "รอนำเสนอหัวข้อ";
            } else if(g.passTimes >= 1) {
              const mem1 = await User.findOne({ username: g.member1 });
              if(mem1.branch === "EnET"){
                g.status = "รอสอบปริญญานิพนธ์";
              }else{
                g.status = "รอสอบก้าวหน้า";
              }
            }
            await Group.findByIdAndUpdate(g._id, { $set: { status: g.status } });
          }
        }else if (event.title === "วันสอบ") {
          const groupExamDone = group.filter(g => g.status === "รอสอบปริญญานิพนธ์" || g.status === "รอสอบก้าวหน้า" || g.status === "รอนำเสนอหัวข้อ");
          for (const g of groupExamDone) {
            if(g.status === "รอสอบปริญญานิพนธ์"){
              g.status = "พร้อมสอบปริญญานิพนธ์";
            }else if(g.status === "รอสอบก้าวหน้า"){
              g.status = "พร้อมสอบก้าวหน้า";
            }else if(g.status === "รอนำเสนอหัวข้อ"){
              g.status = "พร้อมสอบนำเสนอหัวข้อ";
            }
            await Group.findByIdAndUpdate(g._id, { $set: { status: g.status } });
          }
        }
        
        // 5. ลบตัว Event เอง (ค้นหาด้วยฟิลด์ id แทน _id)
        const result = await Event.findOneAndDelete({ id: uuidFromParams });

        await createLog(req, "DELETE_EVENT", { 
            eventId: uuidFromParams,
            eventTitle: event ? event.title : "Unknown" 
        });
        

        if (result) {
            return res.json({ 
                success: true, 
                message: "ลบกิจกรรมและไฟล์ที่เกี่ยวข้องทั้งหมดเรียบร้อยแล้ว",
                details: {
                    filesDeleted: paperFiles.length,
                    platformsDeleted: papers.length
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

app.get("/paper", requireLogin, async (req, res) => {
  try {
      // 2. เพิ่ม await เพื่อรอให้ดึงข้อมูลจาก MongoDB เสร็จก่อน
      const groups = await Group.find({});
      
      const result = await Result.find({});

      renderWithLayout(res, "paper", { 
          title: "KMUTNB Project - Paper Management", 
          groups,
          result
      }, req.path, req);
      
  } catch (err) {
      console.error("Fetch Groups Error:", err);
      res.status(500).send("Internal Server Error");
  }
});

app.post("/api/PaperUploadFile", requireLogin, apiLimiter,async (req, res) => {
    let paperGroup; // ประกาศตัวแปร paperGroup ไว้ข้างนอกเพื่อให้เข้าถึงได้ในส่วนของ createLog หลังจากการบันทึกข้อมูลทั้งหมดแล้ว
    try {
        const { paperId, filesData } = req.body;

        // 1. ตรวจสอบข้อมูลพื้นฐาน
        const paper = await Paper.findById(paperId);
        if (!paper) return res.status(404).send("ไม่พบรายการเอกสาร");

        paperGroup = await Group.findById(paper.groupId);
        if (!paperGroup) return res.status(404).send("ไม่พบข้อมูลกลุ่ม");

        // 2. ลบข้อมูลไฟล์เก่าใน PaperFile (เฉพาะไฟล์ที่นักศึกษาอัปโหลด)
        const oldFiles = await PaperFile.find({ paperId: paperId });
        for (const oldFile of oldFiles) {
            if (oldFile.file?.fileId) {
                try { 
                    // ลบไฟล์จริงออกจาก GridFS
                    await bucket.delete(new mongoose.Types.ObjectId(oldFile.file.fileId)); 
                } catch (err) { 
                    console.warn(`⚠️ Warning: ไม่สามารถลบไฟล์ ${oldFile.file.fileId} ได้:`, err.message); 
                }
            }
        }
        await PaperFile.deleteMany({ paperId: paperId });

        // 3. บันทึกรายการไฟล์ใหม่ที่นักศึกษาส่งมาลง PaperFile
        if (filesData && filesData.length > 0) {
            const savePromises = filesData.map(file => {
                return new PaperFile({
                    paperId: paperId,
                    groupId: paperGroup._id,
                    file: { 
                        fileId: file.id, 
                        filename: file.filename 
                    }
                }).save();
            });
            await Promise.all(savePromises);
        }

        // 4. อัปเดต Paper: ปลด TTL (expireAt) เพื่อไม่ให้ระบบลบทิ้งอัตโนมัติ
        // หมายเหตุ: ไม่ต้องอัปเดต autoPdfId ที่นี่แล้ว เพราะเราสร้างไว้ตั้งแต่ตอน addEvent
        await Paper.findByIdAndUpdate(paperId, { 
            $set: { expireAt: null } 
        });

        // 5. อัปเดตสถานะกลุ่ม (ใช้ findByIdAndUpdate เพื่อเลี่ยง Error engName)
        await Group.findByIdAndUpdate(paperGroup._id, { 
            $set: { status: "ส่งเอกสารเรียบร้อย" } 
        });

        res.status(200).send("สำเร็จ");
    } catch (err) { 
        console.error("❌ PaperUpload Error:", err.message);
        res.status(500).send("เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + err.message); 
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

                if (file.mimetype !== 'application/pdf') {
                    return res.status(400).send("รองรับเฉพาะไฟล์ PDF เท่านั้น");
                }
                // 3. จำกัดขนาด (เช่น 10MB)
                if (file.size > 10 * 1024 * 1024) {
                    return res.status(400).send("ไฟล์ต้องมีขนาดไม่เกิน 10MB");
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
                    filename: file.originalname
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

        if (!userGroupIds || !Array.isArray(userGroupIds) || userGroupIds.length === 0) {
            return res.json([]);
        }

        const platforms = await Paper.find({ groupId: { $in: userGroupIds } }).lean();

        const finalData = await Promise.all(platforms.map(async (p) => {
        const fileRecords = await PaperFile.find({ paperId: p._id });
          return {
              ...p,
              isSubmitted: fileRecords.length > 0,
              files: fileRecords.map(f => f.file),
              autoPdfId: p.autoPdfId // ✅ ส่ง ID ของ PDF แยกออกไป
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
        // 1. รับค่าให้ตรงกับที่ Client ส่งมา (paperId, result, comment)
        const { paperId, result, comment } = req.body;
        const user = req.session.user.name;
        const username = req.session.user.username;

        // ดึงข้อมูล Paper ต้นทางเพื่อเอา groupId และ eventId
        const currentPaper = await Paper.findById(paperId);
        if (!currentPaper) return res.status(404).json({ error: "ไม่พบรายการเอกสาร" });

        if (result === "แก้ไข") {
            // สร้าง Paper ใหม่เพื่อเด้งแจ้งเตือนกลุ่ม (ให้นักเรียนส่งใหม่)
            const fixPaper = new Paper({
                eventId: currentPaper.eventId,
                groupId: currentPaper.groupId,
                mention: `อาจารย์ ${user} ต้องการให้แก้ไข: ${comment}`,
                director: currentPaper.director, // ส่งกรรมการชุดเดิมไปด้วย
                date: currentPaper.date,
                passTimes: currentPaper.passTimes,
                autoPdfId: currentPaper.autoPdfId, // ส่งต่อ PDF เดิมไปด้วย (ถ้ามี)
                date: new Date() // อัปเดตวันที่เป็นปัจจุบันเพื่อให้เด้งใหม่
            });
            await fixPaper.save();

            sendGroupNotification('alert_group', null, username, user, `กลุ่ม ${group.projectName} ต้องมีการแก้ไข`, req.session.user.picture || null , currentPaper.eventId , group.member1 , group.member2 , group.advisor);
          
            return res.status(200).json({ success: true, message: "บันทึกการแก้ไขเรียบร้อยแล้ว" });
        } 

        // --- กรณี ผ่าน หรือ ไม่ผ่าน ---
        group = await Group.findById(currentPaper.groupId);
        if (!group) return res.status(404).json({ error: "ไม่พบข้อมูลกลุ่ม" });

        let examResult = await Result.findOne({ groupId: currentPaper.groupId , passTimes: currentPaper.passTimes });

        if (!examResult) {
            examResult = new Result({
                groupId: currentPaper.groupId,
                pass: result === "ผ่าน" ? [username] : [],
                fail: result === "ไม่ผ่าน" ? [username] : [],
                passTimes: group.passTimes
            });
        } else {
            // เช็คไม่ให้ลงคะแนนซ้ำ
            if (examResult.pass.includes(username) || examResult.fail.includes(username)) {
                return res.status(400).json({ error: "คุณได้ลงคะแนนไปแล้ว" });
            }
            if (result === "ผ่าน") examResult.pass.push(username);
            else examResult.fail.push(username);
        }
        await examResult.save();

        // ตรวจสอบว่ากรรมการลงครบทุกคนหรือยัง
        if (examResult.pass.length + examResult.fail.length === currentPaper.director.length) {
            
            // ดึงข้อมูลสมาชิกเพื่อเช็คสาขา (EnET หรือสาขาอื่น)
            const student = await User.findOne({ username: group.member1 });
            const isEnET = student && student.branch === "EnET";


            if (examResult.fail.length > 0) {
                // มีคนให้ตกแม้แต่คนเดียว = ตก
                group.status = group.passTimes === 0 ? "ไม่ผ่านการสอบหัวข้อ" : (isEnET ? "ไม่ผ่านการสอบปริญญานิพนธ์" : "ไม่ผ่านการสอบก้าวหน้า");
            } else {
                // ผ่านทุกคน
                if (group.passTimes === 0) {
                    group.status = "ผ่านการสอบหัวข้อปริญญานิพนธ์";
                    group.passTimes = 1;
                } else if (group.passTimes === 1) {
                    group.status = isEnET ? "ผ่านการสอบปริญญานิพนธ์" : "ผ่านการสอบก้าวหน้า";
                    group.passTimes = 2;
                    await User.findOneAndUpdate(
                        { username: group.member1 }, 
                        { status: "จบแล้ว" }, 
                        { new: true }
                    );

                    // ✅ 2. เช็คสมาชิกคนที่ 2
                    if (group.member2 != null) {
                        await User.findOneAndUpdate(
                            { username: group.member2 }, 
                            { status: "จบแล้ว" }, 
                            { new: true }
                        );
                    }
                }
            }
            await group.save();
            sendGroupNotification('alert_group', null, username, user, `ผลการสอบของกลุ่ม ${group.projectName} เสร็จสิ้นแล้ว ${group.status}`, req.session.user.picture || null , currentPaper.eventId , group.member1 , group.member2 , group.advisor);
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

app.get("/admin", requireLogin, async (req, res) => {
  if(req.session.user.role !== "admin"){
    return res.redirect("/");
  }
  try {
      renderWithLayout(res, "admin", { title: "KMUTNB Project - Admin Panel" }, req.path,req);
  } catch (err) {
      console.error("Admin Panel Error:", err);
      res.status(500).send("Internal Server Error");
  }
});

app.post("/api/admin", requireLogin, apiLimiter,async (req, res) => {
    // 🛡️ 1. เช็คสิทธิ์ Admin ปัจจุบัน
    if (req.session.user.role !== "admin") {
        return res.status(403).json({ error: "Unauthorized" });
    }

    try {
        const { chosenAdvisor } = req.body;

        if (!chosenAdvisor) {
            return res.status(400).json({ error: "Missing chosenAdvisor" });
        }

        // ป้องกันการโอนสิทธิ์ให้ตัวเอง (ซึ่งจะทำให้ Role มั่ว)
        if (chosenAdvisor === req.session.user.username) {
            return res.status(400).json({ error: "คุณเป็น Admin อยู่แล้ว" });
        }

        // 2. เริ่มกระบวนการโอนสิทธิ์
        // เปลี่ยนคนใหม่ให้เป็น Admin
        const advisorUser = await User.findOneAndUpdate(
            { username: chosenAdvisor }, 
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

app.post("/forgot-password" , apiLimiter,async (req, res) => {
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

app.post("/reset-password/:token", apiLimiter,async (req, res) => {
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
        const hashedPassword = await bcrypt.hash(password, 10);
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

app.post("/api/groups/mark-ready-for-exam", apiLimiter,async (req, res) => {
    // ตรวจสอบสิทธิ์ (ต้องเป็นอาจารย์เท่านั้น)
    if (!req.session.user || req.session.user.role !== 'teacher') {
        return res.status(403).json({ error: "คุณไม่มีสิทธิ์ดำเนินการนี้" });
    }

    try {
        const { groupId } = req.body;

        const group = await Group.findById(groupId);

        const mem1 = await User.findOne({username: group.member1})
        const mem2 = await User.findOne({username: group.member2})
        let statusCheck;

        if (group.passTimes === 0) {
          statusCheck = "พร้อมสอบนำเสนอหัวข้อ";
        } else if(group.passTimes >= 1) {
          if(mem1.branch === "EnET" || mem2.branch === "EnET"){
            statusCheck = "พร้อมสอบปริญญานิพนธ์";
          }else{
            statusCheck = "พร้อมสอบก้าวหน้า";
          }
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

        res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/groupInfo/:id", async (req, res) => {
    try {
        const id = req.params.id;
        
        // 1. หาข้อมูลกลุ่ม
        const group = await Group.findById(id).lean();
        if (!group) return res.status(404).send("ไม่พบข้อมูลกลุ่ม");

        // 2. ดึงข้อมูลชื่อ-นามสกุลสมาชิกและที่ปรึกษา
        const memberUsernames = [group.member1, group.member2, group.advisor].filter(Boolean);
        const users = await User.find({ username: { $in: memberUsernames } }).lean();
        
        const getUserFullName = (username) => {
            const u = users.find(user => user.username === username);
            return u ? `${u.name} ${u.lastname}` : username || "ไม่มีข้อมูล";
        };

        // 3. ดึงหัวข้อเอกสาร (Paper) ทั้งหมด และไฟล์ที่เคยส่ง (PaperFile)
        const allPapers = await Paper.find({ groupId: id }).sort({ submittedAt: -1 }).lean();
        const allFiles = await PaperFile.find({ groupId: id }).lean();

        // นำไฟล์ไปใส่ไว้ในแต่ละ Paper
        const papersWithFiles = allPapers.map(paper => {
            return {
                ...paper,
                submittedFiles: allFiles.filter(f => f.paperId.toString() === paper._id.toString())
            };
        });

        renderWithLayout(res, "groupInfo", { 
            title: "รายละเอียดกลุ่ม",
            group,
            member1Name: getUserFullName(group.member1),
            member2Name: getUserFullName(group.member2),
            advisorName: getUserFullName(group.advisor),
            papers: papersWithFiles
        }, req.path, req);

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.get("/userInfo", requireLogin, async (req, res) => {
    // 1. ตรวจสอบสิทธิ์ Admin
    if (req.session.user.role !== "admin" && req.session.user.role !== "secretary") {
        return res.redirect("/group");
    }

    try {
        // 2. ดึงเฉพาะคนที่เป็น user และเรียงลำดับรหัส
        const students = await User.find({ role: 'user' }).sort({ username: 1 });

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

app.post("/update-exam-schedule", apiLimiter,requireLogin, async (req, res) => {
    if (req.session.user.role !== "admin") return res.status(403).send("สิทธิ์ไม่เพียงพอ");

    try {
        const { eventId, data: updatedData } = req.body;
        const event = await Event.findOne({ id: eventId });

        if (!event || !event.testTable?.fileId) return res.status(404).send("ไม่พบข้อมูลกิจกรรมหรือไฟล์");

        // --- ส่วนที่ 1: จัดการไฟล์ Excel (GridFS) เหมือนเดิม ---
        const newWS = XLSX.utils.json_to_sheet(updatedData);
        const newWB = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWB, newWS, "Schedule");
        const newBuffer = XLSX.write(newWB, { type: 'buffer', bookType: 'xlsx' });
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
        
        await bucket.delete(new mongoose.Types.ObjectId(event.testTable.fileId));
        const uploadStream = bucket.openUploadStream(event.testTable.filename, { contentType: event.testTable.contentType });
        const newFileId = uploadStream.id;

        await new Promise((resolve, reject) => {
            streamifier.createReadStream(newBuffer).pipe(uploadStream).on('error', reject).on('finish', resolve);
        });

        event.testTable.fileId = newFileId;
        await event.save();

        // --- ส่วนที่ 2: แก้ไข Paper ของเก่า (Update existing instead of insert new) ---
        const testResultsExpire = new Date(event.expireAt);
        testResultsExpire.setDate(testResultsExpire.getDate() + 7);

        for (const row of updatedData) {
            const groupNameStr = (row['ชื่อกลุ่ม'] || row['groupName'] || row['Groupname'] || "").toString().trim();
            if (!groupNameStr) continue;

            // 1. หา Group เพื่อเอา _id
            const group = await Group.findOne({ projectName: groupNameStr });
            if (!group) continue;

            // 2. จัดการรายชื่อกรรมการ (Logic เดิม)
            let directorsStr = row['กรรมการ'] || row['director'] || "";
            let directors = directorsStr.toString().split(/[,\/;]|\sและ\s/).map(s => {
                let clean = s.trim().replace(/^(ดร\.|ผศ\.ดร\.|ผศ\.|รศ\.ดร\.|รศ\.|ศ\.|มร\.|นาย|นางสาว|นาง|อาจารย์|อ\.)\s?/, "");
                return clean.split(/\s+/)[0]; 
            }).filter(s => s !== "");

            // เพิ่ม Advisor
            const advisorUser = await User.findOne({ username: group.advisor });
            if (advisorUser && advisorUser.name) {
                let advClean = advisorUser.name.trim().replace(/^(ดร\.|ผศ\.ดร\.|ผศ\.|รศ\.ดร\.|รศ\.|ศ\.|มร\.|นาย|นางสาว|นาง|อาจารย์|อ\.)\s?/, "").split(/\s+/)[0];
                if (!directors.includes(advClean)) directors.push(advClean);
            }

            // 3. 🛠️ แก้ไข Paper (findOneAndUpdate)
            // ค้นหา Paper ที่มี eventId และ groupId ตรงกัน เพื่ออัปเดตข้อมูลใหม่
            await Paper.findOneAndUpdate(
                { eventId: event.id, groupId: group._id }, 
                { 
                    $set: { 
                        director: directors,      // อัปเดตรายชื่อกรรมการใหม่
                        mention: event.description || event.title,
                        expireAt: testResultsExpire,
                        date: event.date
                    } 
                },
                { upsert: true } // ถ้าไม่เจอ Paper เดิม (เช่น แอดกลุ่มเพิ่มใน Excel) ให้สร้างใหม่
            );
        }

        res.json({ success: true, message: "อัปเดตไฟล์ Excel และข้อมูล Paper เดิมเรียบร้อยแล้ว" });

    } catch (err) {
        console.error("❌ Update Error:", err);
        res.status(500).send("เกิดข้อผิดพลาด: " + err.message);
    }
    await createLog(req, "UPDATE_SCHEDULE", { 
        eventId: req.body.eventId, 
        rowCount: req.body.data.length 
    });

    res.json({ success: true });
});

app.get("/addSecretary", requireLogin, async (req, res) => {
  if(req.session.user.role !== "admin"){
    return res.redirect("/");
  }
  try {
      renderWithLayout(res, "addSecretary", { title: "KMUTNB Project - Add Secretary" }, req.path,req);
  } catch (err) {
      console.error("Add Secretary Error:", err);
      res.status(500).send("Internal Server Error");
  }
});

app.post("/api/addSecretary", apiLimiter, requireLogin, async (req, res) => {
    // 1. ตรวจสอบสิทธิ์ Admin
    if (req.session.user.role !== "admin") {
        return res.status(403).json({ error: "คุณไม่มีสิทธิ์ดำเนินการในส่วนนี้" });
    }

    try {
        // 2. รับค่า username จาก req.body (ให้ตรงกับที่ AJAX ส่งมา)
        const { username } = req.body; 

        if (!username) {
            return res.status(400).json({ error: "กรุณาระบุรหัสอาจารย์ที่ต้องการมอบสิทธิ์" });
        }

        // 3. ค้นหาและอัปเดต โดยระบุเงื่อนไขเพิ่มว่าต้องเป็นอาจารย์เท่านั้น (Optional แต่แนะนำ)
        const advisorUser = await User.findOneAndUpdate(
            { username: username, role: "teacher" }, // ค้นหาอาจารย์
            { role: "secretary" },                  // เปลี่ยนเป็นเลขาฯ
            { new: true }                           // คืนค่าที่อัปเดตแล้วกลับมา
        );

        // 4. กรณีหาไม่เจอ (อาจจะเพราะรหัสผิด หรือไม่ใช่ role teacher)
        if (!advisorUser) {
            return res.status(404).json({ 
                error: "ไม่พบข้อมูลอาจารย์ หรือผู้ใช้รายนี้มีสิทธิ์อื่นอยู่แล้ว" 
            });
        }

        // 5. ส่งผลลัพธ์กลับไปให้ SweetAlert แสดงผล
        res.json({ 
            success: true, 
            message: `มอบสิทธิ์เลขานุการให้แก่ ${advisorUser.name} ${advisorUser.lastname} เรียบร้อยแล้ว` 
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

// ✅ API สำหรับดึง PDF จาก autoPdfId มาแสดงผล
// เพิ่มหรือแก้ไขใน server.js
app.get("/view-pdf/:id", async (req, res) => {
    try {
        const idParam = req.params.id;
        
        // 1. ตรวจสอบความถูกต้องของ ID String
        if (!mongoose.Types.ObjectId.isValid(idParam)) {
            return res.status(400).send("❌ รูปแบบ ID ไม่ถูกต้อง");
        }

        const fileId = new mongoose.Types.ObjectId(idParam);
        
        // 2. ใช้ bucket (GridFSBucket) ที่ประกาศไว้ในบรรทัดที่ 46
        const files = await bucket.find({ _id: fileId }).toArray();
        
        if (!files || files.length === 0) {
            return res.status(404).send("❌ ไม่พบไฟล์เอกสารใน GridFS (ID นี้ไม่มีไฟล์จริง)");
        }

        // 3. ตั้งค่า Header สำหรับ PDF
        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${encodeURIComponent(files[0].filename)}"`
        });

        // 4. Stream ไฟล์ออกไป
        const downloadStream = bucket.openDownloadStream(fileId);
        downloadStream.pipe(res);

    } catch (err) {
        console.error("❌ View PDF Error:", err.message);
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
      
// Socket.IO
io.on("connection", (socket) => {
  const username = socket.handshake.query.username;

  if (username) {
      socket.username = username;
      socket.join(username); // เข้าห้องส่วนตัวเพื่อรับ Notification
      console.log(`🔗 User ${username} connected and joined private room.`);
  }
  
  // รับข้อความใหม่
  socket.on("join group", (groupId) => {
      socket.join(groupId);
      console.log(`👥 User ${socket.username} joined group: ${groupId}`);
  });


  socket.on("disconnect", () => {
    if (socket.username) {
      userSockets.delete(socket.username);
      console.log(`🔌 Disconnected: ${socket.username} (socketId: ${socket.id})`);
    }
  });
});

// Start server
server.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
