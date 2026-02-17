const Message = require("./models/Message"); // ✅ import model

const Group = require("./models/Group"); // ✅ import group model

const News = require('./models/News'); // ✅ import news model

const Event = require('./models/Event'); // ✅ import event model

const Paper = require('./models/Paper'); // ✅ import event model

const PaperFile = require('./models/PaperFile'); // ✅ import event model

const Result = require('./models/Result'); // ✅ import event model

const Notification = require("./models/Notification");

const NotificationRead = require("./models/NotificationRead");

const crypto = require('crypto');

const userSockets = new Map();
const mongoose = require("mongoose");

const express = require("express");
const path = require("path");
const ejs = require("ejs");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("./db"); // ✅ เพิ่มตรงนี้

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
const upload = multer({ storage });

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
        const data = XLSX.utils.sheet_to_json(worksheet); 
        
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
    if (dataArray.length === 0) {
        return { insertedCount: 0 };
    }

    const bulkOps = [];
    const saltRounds = 10;
    
    // 1. กำหนดค่า Placeholder ที่ไม่ซ้ำกันสำหรับ Field ที่จำเป็นแต่ยังไม่ได้ตั้งค่า
    // ⚠️ ต้องใช้สตริงที่ไม่น่าจะซ้ำกับรหัสผ่านจริงเพื่อระบุว่าเป็นบัญชีที่รอการลงทะเบียน
    const PENDING_PASS_STRING = 'PENDING_REGISTRATION_FOR_SIGNUP'; 
    const PENDING_NAME = 'Pending';
    const PENDING_LASTNAME = 'Registration';

    // 2. Hash สตริง Placeholder นี้เพื่อใช้เป็นรหัสผ่านชั่วคราว
    const pendingHashedPassword = await bcrypt.hash(PENDING_PASS_STRING, saltRounds); 

    for (const row of dataArray) {
        // 3. ดึงเฉพาะ username จาก Excel
        const usernameFromExcel = row.username || row.Username || row.USERNAME; 
        
        if (!usernameFromExcel) {
            console.warn(`Skipping row due to invalid or missing username:`, row);
            continue;
        }

        const branch = row.branch || row.Branch || row.BRANCH || "EnET";

        const role = row.role || row.Role || row.ROLE || 'user';

        const trimedBranch = String(branch).trim();
        const trimmedUsername = String(usernameFromExcel).trim();
        const emailExel = "s"+trimmedUsername+"@kmutnb.ac.th";

        // 4. จัดเตรียมข้อมูลผู้ใช้: ใช้ Hashed Placeholder Password และค่า Default อื่นๆ
        const userData = {
            username: trimmedUsername,
            email: emailExel,
            password: pendingHashedPassword, // ⬅️ Hashed Placeholder
            name: PENDING_NAME,             // ⬅️ Placeholder
            lastname: PENDING_LASTNAME,     // ⬅️ Placeholder
            // ใช้ค่า Default สำหรับ non-required fields
            role: role, 
            phone: null, 
            email: emailExel,
            group: null,
            branch: trimedBranch // สามารถนำเข้า group ได้ถ้ามีใน Excel
        };
        
        // 5. ใช้ bulkWrite เพื่อเพิ่มผู้ใช้ใหม่ (ถ้า username ไม่ซ้ำ)
        bulkOps.push({
            updateOne: {
                filter: { username: userData.username },
                // $setOnInsert: ทำการ Insert เฉพาะเมื่อไม่พบ username ใน DB เท่านั้น
                update: { $setOnInsert: userData }, 
                upsert: true 
            }
        });
    }

    // ดำเนินการ bulk write
    const result = await User.bulkWrite(bulkOps);

    console.log(`✅ Bulk Write Complete: ${result.upsertedCount} items inserted, ${result.matchedCount} items matched (skipped).`);
    
    // คืนค่าจำนวนรายการที่ถูกเพิ่มใหม่
    return { 
        insertedCount: result.upsertedCount 
    };
}

let bucket;

/*connectDB().then(() => {
  bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "fs" });
  console.log("✅ GridFSBucket initialized");
});*/

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: "your-very-strong-secret", // ควรใช้สตริงที่ยาวและเดายาก
  resave: false,
  saveUninitialized: false, // เปลี่ยนเป็น false เพื่อไม่ให้สร้าง session ว่างๆ ถ้ายังไม่ login
  cookie: {
    httpOnly: true, // ✅ ป้องกัน JavaScript เข้าถึง cookie (กัน XSS)
    secure: false,  // หากรันบน HTTPS (Production) ให้เปลี่ยนเป็น true
    sameSite: 'lax' // ช่วยป้องกันการโจมตีแบบ CSRF
  }
}));

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
      
      if (view === "login" || view === "register") {
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
  res.redirect("/group");
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

app.post("/upload-file/:groupId", requireLogin, upload.array("files"), async (req, res) => {
  try {
    const messages = [];

    const groupId = req.params.groupId;

    let hasMovement = false;

    // ถ้ามีข้อความ
    if(req.body.text && req.body.text.trim() !== ""){
      const textMessage = new Message({
        groupId: req.params.groupId,
        senderUsername: req.session.user.username,
        senderName: req.session.user.name,
        type: "text",
        text: req.body.text.trim(),
        senderPic: req.session.user.picture,
        timestamp: new Date()
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
          timestamp: new Date()
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
    const groups = await Group.find(); // 1. ดึงกลุ่มทั้งหมดออกมา (member1 เป็นแค่ String)

    // 2. ใช้ Promise.all วนลูปหาข้อมูลจากคนละที่มา "ประกอบร่าง"
    const groupsWithData = await Promise.all(groups.map(async (g) => {
      // ไปค้นหาใน User Schema โดยใช้ string จาก g.member1
      // สมมติว่าใน User Schema เก็บชื่อฟิลด์ว่า username
      const user = await User.findOne({ username: g.member1 }); 

      return {
          ...g.toObject(), // คัดลอกข้อมูลเดิมในกลุ่ม
          leaderName: user ? `${user.name} ${user.lastname}` : g.member1 // สร้างฟิลด์ใหม่ขึ้นมาเอง
      };
    }));
    renderWithLayout(res, "status", { title: "KMUTNB Project - Status", groups: groupsWithData }, req.path,req);
  } catch (err) {
    console.error("Error fetching groups:", err);
    res.status(500).send("Error loading status");
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
  try{

    if(req.session.user && req.session.user.group === null && req.session.user.role !== "teacher"){
      return res.redirect("/addGroup");
    }

    const username = req.session.user.username;

    let groups;
    if(req.session.user.role === "admin"){
      groups = await Group.find().sort({ lastUpdatedTime: -1 });
    }else{   
      groups = await Group.find({
        $or: [
          { member1: username },
          { member2: username },
          { advisor: username }
        ]
      }).sort({ lastUpdatedTime: -1 });
    }

    let userInfo = [];

    if (groups.length > 0) {
      const mem1 = await User.findOne({username: groups[0].member1});
      const mem2 = await User.findOne({username: groups[0].member2});
      const adv = await User.findOne({username: groups[0].advisor});
      userInfo = [mem1, mem2, adv];
    }

    renderWithLayout(res, "group", { 
      title: "KMUTNB Project - Group",
      userInfo, 
      groups,
      user: req.session.user
    }, req.path,req);
  }catch(err){
    console.error("❌ Error deleting news:", err);
    res.status(500).send("Error loading groups");
  }
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

app.post("/login" , async (req, res) => {
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

  const group = user.group; // สมมติว่าเก็บแค่กลุ่มเดียวใน Array

  
    req.session.user = {
    username: user.username,
    name: user.name,
    lastname: user.lastname,
    role: user.role,
    email: user.email,
    phone: user.phone,
    group: group,
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

  res.redirect("/");
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
app.post("/groups", requireLogin, async (req, res) => {
  try {
    const {  projectName, member1, member2, advisor} = req.body;

    const status = "รอนำเสนอหัวข้อ";

    let existingGroup;

    if (!projectName||!member1) {
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

    const mem2 = member2 === null || member2 === "" || member2 === "undefined" ? null : `${member2} Pending`;

    // บันทึกกลุ่มใหม่
    const newGroup = new Group({ projectName, member1, mem2 , advisor ,status});
    await newGroup.save();

    sendGroupNotification("addGroup", newGroup._id, "ระบบ", "ระบบ", `คุณถูกเพิ่มเข้ากลุ่มโดย ${mem1.name}`, null, null , undefined , null ,  member2 , advisor)

    await User.findOneAndUpdate(
      { username: member1 }, // หรือฟิลด์สำหรับค้นหาผู้ใช้ เช่น { username: member1 }
      { $set: { group: newGroup._id } }
    );

    // อัปเดต session.user.group = "true"
    req.session.user.group = projectName;

    res.status(201).send("บันทึกกลุ่มสำเร็จ");
  } catch (err) {
    console.error("❌ Error saving group:", err);
    res.status(500).send("เกิดข้อผิดพลาดในการบันทึกกลุ่ม");
  }
});


app.post("/group/accept-invitation/:groupId/:notiId", requireLogin, async (req, res) => {
  try {
    const { groupId, notiId } = req.params;
    const username = req.session.user.username;
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).send("ไม่พบกลุ่ม");
    }

    // ตรวจสอบว่ามีคนอื่นมาเสียบแทนไปก่อนหรือยัง
    if (group.member2 && group.member2 !== username) {
      return res.status(400).send("กลุ่มนี้มีสมาชิกครบแล้ว");
    }
    
    // 1. อัปเดตข้อมูลกลุ่ม
    const user = await User.findOne({ username: username }); // ดึงข้อมูลผู้ใช้จาก DB เพื่อความแน่นอน
    if(user.role === "teacher"){
      group.advisor = username;
    }else{
      group.member2 = username;
    }
    await group.save();

    // 2. ลบแจ้งเตือนทิ้ง
    await Notification.findByIdAndDelete(notiId);

    // 3. อัปเดตข้อมูล User ใน DB
    if (req.session.user.role !== "teacher") {
      await User.findOneAndUpdate(
        { username: username },
        { $set: { group: group._id } }
      );
    }else{
      await User.findOneAndUpdate(
        { username: username },
        { push: { group: group._id } } // สำหรับ teacher อนุญาตให้มีหลายกลุ่มได้ (เก็บเป็น Array)
      );
    }

    // 4. อัปเดต Session และบันทึกให้เสร็จก่อนตอบกลับ
    req.session.user.group = group._id;
    
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
});

app.post("/group/deny-invitation/:groupId/:notiId", requireLogin, async (req, res) => {
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
});

app.post("/groups-update/:groupId", requireLogin, async (req, res) => {
  try {
    const {  member2, advisor } = req.body;
    const { groupId } = req.params;

    // ตรวจสอบว่ามีใครอยู่ในกลุ่มแล้วหรือยัง
    const group = await Group.findById({ _id : groupId })

    const mem1 = await User.findOne({ username: group.member1 });

      if (member2 !== null && member2 !== "" && member2 !== "undefined") {
        const existingGroup = await Group.findOne({
          member2: member2,
          _id: groupId  // ไม่รวมกลุ่มที่กำลังอัปเดต
        });
        if (existingGroup) {
          return res.status(400).send("สมาชิกนี้มีกลุ่มอยู่แล้ว");
        }
      }

    // แก้ไขกลุ่ม
    sendGroupNotification("addGroup", groupId, "ระบบ", "ระบบ", `คุณถูกเพิ่มเข้ากลุ่มโดย ${mem1.name}`, null, null , undefined , null, member2 !== undefined && member2 !== null && member2 !== "" ? member2 : null, advisor)

    res.status(201).send("ส่งคำเชิญกลุ่มสำเร็จ");
  } catch (err) {
    console.error("❌ Error saving group:", err);
    res.status(500).send("เกิดข้อผิดพลาดในการบันทึกกลุ่ม");
  }
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

app.post("/groups/leave/:groupId", async (req, res) => {
  try {
    const groupId = req.params.groupId;

     if (!groupId || groupId === "null" || groupId === "undefined") {
      return res.status(400).send("Group ID ไม่ถูกต้อง");
    }

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).send("Group ID ไม่ถูกต้อง");
    }

    const username = req.session.user.username; // สมมติใน session มี username

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).send("ไม่พบกลุ่ม");

    // ตรวจสอบว่า user อยู่ field ไหน
    if (group.member1 === username) {
      group.member1 = group.member2; // เลื่อน member2 ขึ้นมาแทนที่
      group.member2 = null; // ล้าง member2
    } else if (group.member2 === username) {
      group.member2 = null;
    }  else {
      return res.status(400).send("คุณไม่ได้อยู่ในกลุ่มนี้");
    }

    await group.save();

    // อัปเดต User ด้วย (ถ้า User มี field group)
    await User.findOneAndUpdate(
      { username },
      { $set: { group: null } } // เอา group ออก
    );

    // อัปเดต session
    req.session.user.group = null;

    res.send("ออกจากกลุ่มสำเร็จ");
  } catch (err) {
    console.error(err);
    res.status(500).send("เกิดข้อผิดพลาดที่ server");
  }
});

app.get("/addGroup", requireLogin, async (req, res) => {
  if(req.session.user && req.session.user.group !== null){
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
  const username = req.session.user.username;
  const groups = await Group.find({
      $or: [
        { member1: username },
        { member2: username },
      ]
    });

  let userInfo = [];

  const m2 = await User.findOne({username: groups[0].member2});

  let mem2;

    if (groups.length > 0) {
      const mem1 = await User.findOne({username: groups[0].member1});
      if (m2 && m2.username.endsWith("Pending")) {
        const user2 = await User.findOne({username: groups[0].member2});

        mem2 = `${user2.name} (Pending)`;
      }else{
        mem2 = await User.findOne({username: groups[0].member2});
      }
      
      const adv = await User.findOne({username: groups[0].advisor});
      userInfo = [mem1, mem2, adv];
    }
  renderWithLayout(res, "updateGroup", { title: "KMUTNB Project - Update Group" ,groups,userInfo}, req.path,req);
});

app.post("/api/news", requireLogin, upload.single("file"), async (req, res) => {
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

app.post("/news-update/:newsId", requireLogin, upload.single("newImage"), async (req, res) => {
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

app.post("/profile/update", requireLogin, upload.single("profileImage"), async (req, res) => {
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
});

app.get("/addExcel",requireLogin,(req, res) => {
  if(req.session.user.role !== "admin"){
    return res.redirect("/");
  }
  renderWithLayout(res, "addExcel", { title: "KMUTNB Project - Add Excel" }, req.path,req);
});

app.post('/api/excel-upload', requireLogin, upload.single('file'), async (req, res) => {
    // 💡 เนื่องจากใช้ multer.memoryStorage() เราจะใช้ req.file.buffer
    if (!req.file) {
        return res.status(400).json({ error: 'No Excel file uploaded.' });
    }

    try {
        // 1. ประมวลผลและอ่านข้อมูลจาก Buffer
        const excelData = processExcelFile(req.file.buffer); 
        
        // 2. บันทึกข้อมูลลง MongoDB
        const result = await saveUsersFromExcel(excelData);

        // ❌ ไม่ต้องลบไฟล์ชั่วคราว เพราะถูกเก็บในหน่วยความจำ

        res.status(200).json({ 
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

app.post("/register", upload.single("profileImage"), async (req, res) => {
  console.log("Body data:", req.body); // ต้องมีข้อมูลชื่อ นามสกุล ฯลฯ
  console.log("File data:", req.file);
  try {
    const { username, password, name, lastname, phone ,passwordConfirm} = req.body;

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

    
    if (existingUser && existingUser.email && existingUser.phone === null && existingUser.name === "Pending" && existingUser.lastname === "Registration") {
      const hashedPassword = await bcrypt.hash(password, 10);
      await User.findOneAndUpdate(
        { username: username },
        { password: hashedPassword, name, lastname, phone ,picture: req.file ? img : null}
      );
      req.session.successModal = "success";
      return req.session.save(() => res.redirect("/login"));
    }else if (!existingUser) {
      req.session.failModal = "exists"; // ตั้งค่าเพื่อแสดง modal
      return req.session.save(() => res.redirect("/register"));
    }else{
      req.session.failModal = "complete"; // ตั้งค่าเพื่อแสดง modal
      return req.session.save(() => res.redirect("/register"));
    }
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).send("เกิดข้อผิดพลาดในการลงทะเบียน");
  }
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

app.post("/api/notifications/mark-read/:id", requireLogin, async (req, res) => {
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

app.post("/api/addEvent", requireLogin, upload.single("file"), async (req, res) => {
    try {
        const { title, date, toDate, description } = req.body;
        const file = req.file;
        
        // ตรวจสอบว่าส่งค่ามาจริงไหม
        if (!title || !date) {
            console.log("Missing required fields:", { title, date });
            return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
        }
        
        const eventId = generateEventId();

        const date1 = new Date(date);
        const date2 = toDate ? new Date(toDate) : null;

        const expire = toDate ? new Date(toDate) : new Date(date);

        expire.setHours(23, 59, 59, 999); // ตั้งเวลาเป็นสิ้นวันของวันที่กำหนด

        const newEvent = new Event({
            id: eventId,
            title,
            description,
            testTable: file ? {
                filename: file.originalname,
                contentType: file.mimetype,
                fileId: null // จะอัปเดตหลังจากอัปโหลดไฟล์เสร็จ
            } : null,
            date: date1, // มั่นใจว่าเป็น Date Object
            toDate: date2,
            expireAt: expire
        });

        await newEvent.save();

        let targetGroups = [];

        if(title === "วันส่งเอกสาร"){
          const allGroups = await Group.find({ status: { $ne: "ผ่านการสอบปริญญานิพนธ์" } });
            
            const paperPlatforms = allGroups.map(group => ({
                eventId: eventId,
                groupId: group._id, // หรือ group._id
                mention: description || title,
                expireAt: expire, // ตั้งวันหมดอายุไว้ที่นี่
                passTimes: group.passTimes
            }));

            const updateGroupStatus = allGroups.map(group => ({
                updateOne: {
                    filter: { _id: group._id },
                    update: { status: "รอส่งเอกสาร" }
                }
            }));

            await Group.bulkWrite(updateGroupStatus);
            await Paper.insertMany(paperPlatforms);

            
        } else if (title === "วันสอบ" && file) {
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

            const testresultsdate = new Date(expire);
            testresultsdate.setDate(testresultsdate.getDate() + 7);

            const paperPlatforms = [];

            // วนลูปทีละแถวใน Excel (1 แถว = 1 กลุ่ม)
            for (const row of data) {
                const groupNameStr = (row.groupName || row.name || "").toString().trim();
                if (!groupNameStr) continue;

                // 1. หาข้อมูลกลุ่มจาก DB เพื่อเอา id และ advisor (ใช้ findOne เพราะมีกลุ่มเดียว)
                const group = await Group.findOne({ projectName: groupNameStr });

                if (group) {
                    // 2. จัดการรายชื่อกรรมการจาก Excel: แยกชื่อ / ตัดคำนำหน้า / ตัดนามสกุล
                    let directors = row.director ? row.director.toString().split(/[,\/;]|\sและ\s/).map(s => {
                        let cleanName = s.trim().replace(/^(ดร\.|ผศ\.ดร\.|ผศ\.|รศ\.ดร\.|รศ\.|ศ\.|มร\.|นาย|นางสาว|นาง|อาจารย์|อ\.)\s?/, "");
                        return cleanName.split(/\s+/)[0]; 
                    }).filter(s => s !== "") : [];

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
                        date: expire,
                        director: directors // ในอาเรย์นี้จะมีทั้ง [กรรมการจาก Excel + Advisor]
                    });

                    group.status = "รอสอบ";
                    await group.save();
                }
            }

            if (paperPlatforms.length > 0) {
                await Paper.insertMany(paperPlatforms);
            }
        }
        // 🔔 เรียกแจ้งเตือน (เช็คให้ชัวร์ว่าลบบั๊กในฟังก์ชันนี้แล้ว)
        await sendGroupNotification('alert', null, req.session.user.username, req.session.user.name, `มีกิจกรรมใหม่: ${title}`, req.session.user.picture || null , eventId , expire , null , null , null);

        return res.status(201).json({ message: "บันทึกสำเร็จ" });
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
        // ค้นหาด้วยฟิลด์ id (UUID String) แทนการใช้ _id
        const event = await Event.findOne({ id: req.params.id }); 
        
        if (!event) {
            return res.status(404).send("ไม่พบกิจกรรมนี้ในระบบ");
        }
        renderWithLayout(res, "eventInfo", { title: "KMUTNB Project - Event Info", event }, req.path, req);
    } catch (err) {
        console.error("❌ Error fetching event info:", err);
        res.status(500).send("เกิดข้อผิดพลาดในการดึงข้อมูลกิจกรรม");
    }
});



app.delete("/deleteEvent/:id", requireLogin, async (req, res) => {
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

        const event = await Event.findOne({ id: uuidFromParams });

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
            await g.save();
          }
        }else if (event.title === "วันสอบ") {
          const groupExamDone = group.filter(g => g.status === "รอสอบปริญญานิพนธ์" || g.status === "รอสอบก้าวหน้า");
          for (const g of groupExamDone) {
            g.status = "ส่งเอกสารเรียบร้อย";
            await g.save();
          }
        }
        
        // 5. ลบตัว Event เอง (ค้นหาด้วยฟิลด์ id แทน _id)
        const result = await Event.findOneAndDelete({ id: uuidFromParams });
        

        if (result) {
            res.json({ 
                success: true, 
                message: "ลบกิจกรรมและไฟล์ที่เกี่ยวข้องทั้งหมดเรียบร้อยแล้ว",
                details: {
                    filesDeleted: paperFiles.length,
                    platformsDeleted: papers.length
                }
            });
        } else {
            res.status(404).json({ success: false, message: "ไม่พบกิจกรรมนี้ในระบบ" });
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

app.post("/api/PaperUploadFile", requireLogin, async (req, res) => {
    try {
        const { paperId, filesData } = req.body; 

        if (!filesData || !Array.isArray(filesData)) {
            return res.status(400).send("ข้อมูลไฟล์ไม่ถูกต้อง");
        }

        // --- 1. ค้นหาและลบไฟล์เก่าทั้งหมดของ PaperId นี้ ---
        const oldFiles = await PaperFile.find({ paperId: paperId });

        const paper = await Paper.findById(paperId);
        const paperGroup = paper.groupId;

        for (const oldFile of oldFiles) {
            if (oldFile.file && oldFile.file.fileId) {
                try {
                    await bucket.delete(new mongoose.Types.ObjectId(oldFile.file.fileId)); // ลบไฟล์จริงใน GridFS
                } catch (err) {
                    console.warn(`⚠️ ไม่สามารถลบไฟล์เก่า ${oldFile.file.fileId} ได้:`, err.message);
                }
            }
        }
        // ลบ Metadata เก่าใน PaperFile
        await PaperFile.deleteMany({ paperId: paperId });

        // --- 2. บันทึกไฟล์ชุดใหม่ ---
        const savePromises = filesData.map(file => {
            return new PaperFile({
                paperId: paperId,
                groupId: paperGroup,
                file: { 
                    fileId: file.id, 
                    filename: file.filename 
                }
            }).save();
        });

        await Promise.all(savePromises);

        await Group.findByIdAndUpdate(req.session.user.group, { $set: { status: "ส่งเอกสารเรียบร้อย" } });

        // 3. ปลด TTL ให้เป็นบันทึกถาวร
        await Paper.findByIdAndUpdate(paperId, { $set: { expireAt: null } });

        res.status(200).send("อัปโหลดไฟล์ใหม่แทนที่อันเดิมสำเร็จ");
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get("/api/getMyPapers", requireLogin, async (req, res) => {
    try {
        const userGroupIds = req.session.user.group; // คาดว่าเป็น Array ของ IDs

        // 1. ตรวจสอบว่ามีข้อมูลกลุ่มใน Session หรือไม่
        if (!userGroupIds || !Array.isArray(userGroupIds) || userGroupIds.length === 0) {
            console.log("⚠️ No group IDs found in session for user:", req.session.user.username);
            return res.json([]);
        }

        // 2. ค้นหาข้อมูลกลุ่มทั้งหมดที่อยู่ใน Array นี้ (ใช้ $in เพื่อประสิทธิภาพ)
        //const groups = await Group.find({ _id: { $in: userGroupIds } });
        
        //if (!groups || groups.length === 0) {
            //return res.json([]);
        //}

        // 3. ดึงเฉพาะ ID ของกลุ่มทั้งหมดออกมาเป็น Array ของ String หรือ ObjectId
        //const allGroupIds = groups.map(g => g._id);

        // 4. ค้นหา Platform ใน Paper ทั้งหมดที่อยู่ในกลุ่มเหล่านี้
        const platforms = await Paper.find({ groupId: { $in: userGroupIds } }).lean();

        // 5. ตรวจสอบสถานะการส่งไฟล์ (Check isSubmitted)
        const finalData = await Promise.all(platforms.map(async (p) => {
            // ค้นหาไฟล์ที่ส่งล่าสุดของ Paper นี้
            const fileRecord = await PaperFile.findOne({ paperId: p._id });
            
            return {
                ...p,
                isSubmitted: !!fileRecord,
                fileId: fileRecord ? fileRecord.file.fileId : null
            };
        }));

        res.json(finalData);
    } catch (err) {
        console.error("❌ Error in getMyPapers:", err);
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลเอกสาร" });
    }
});

app.get("/api/getPaperFiles/:paperId", requireLogin, async (req, res) => {
    try {
        const files = await PaperFile.find({ paperId: req.params.paperId }).sort({ submittedAt: -1 });
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/submitPaperResult", requireLogin, async (req, res) => {
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
                date: currentPaper.date
            });
            await fixPaper.save();
          
            return res.status(200).json({ success: true, message: "บันทึกการแก้ไขเรียบร้อยแล้ว" });
        } 

        // --- กรณี ผ่าน หรือ ไม่ผ่าน ---
        let group = await Group.findById(currentPaper.groupId);
        if (!group) return res.status(404).json({ error: "ไม่พบข้อมูลกลุ่ม" });

        let examResult = await Result.findOne({ groupId: currentPaper.groupId });

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
        if (examResult.pass.length + examResult.fail.length >= currentPaper.director.length && currentPaper.director.length >= 3) {
            
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

app.post("/api/admin", requireLogin, async (req, res) => {
  if(req.session.user.role !== "admin"){
    return res.status(403).json({ error: "Unauthorized" });
  }
  try {
      const { chosenAdvisor } = req.body;

      if (!chosenAdvisor) {
          return res.status(400).json({ error: "Missing chosenAdvisor" });
      }

      const adminUser = await User.findOneAndUpdate({ username: req.session.user.username }, { role: "advisor" });

      const advisorUser = await User.findOneAndUpdate({ username: chosenAdvisor }, { role: "admin" });

      if (!adminUser || !advisorUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ success: true, message: `เปลี่ยน ${advisorUser.username} เป็น admin และ ${adminUser.username} เป็น advisor เรียบร้อยแล้ว` });
  }catch (err) {
      console.error("Admin Action Error:", err);
      res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/server-time", (req, res) => {
    res.json({ now: new Date().getTime() }); // ส่ง timestamp ปัจจุบันของ Server ไป
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
