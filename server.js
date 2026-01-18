const Message = require("./models/Message"); // ✅ import model

const Group = require("./models/Group"); // ✅ import group model

const News = require('./models/News'); // ✅ import news model

const Event = require('./models/Event'); // ✅ import event model

const Notification = require("./models/Notification");

const NotificationRead = require("./models/NotificationRead");

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
const { userInfo } = require("os");
const { group } = require("console");

// ใช้ memory storage ของ multer
const storage = multer.memoryStorage();
const upload = multer({ storage });

const fs = require('fs'); // ต้องใช้ในการลบไฟล์ แต่ในกรณีนี้เราจะใช้ Buffer แทน
const xlsx = require('xlsx'); // ✅ นำเข้าไลบรารีสำหรับอ่าน Excel


const processExcelFile = (buffer) => {
    try {
        // ใช้ XLSX.read() อ่าน Buffer โดยตรง
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0]; // อ่านชีทแรก
        const worksheet = workbook.Sheets[sheetName];

        // แปลงข้อมูลชีทเป็น JSON Array
        const data = xlsx.utils.sheet_to_json(worksheet); 
        
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
            role: row.role || 'user', 
            phone: null, 
            email: null,
            group: null // สามารถนำเข้า group ได้ถ้ามีใน Excel
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
function renderWithLayout(res, view, data = {}, reqPath = "",req) {
  const extendedData = { ...data, currentPath: reqPath };

  // เพิ่ม user ถ้ามี req และ session.user
  if (req && req.session && req.session.user) {
    extendedData.user = req.session.user;
  }
  ejs.renderFile(
    path.join(__dirname, "app1", "public", `${view}.ejs`),
    extendedData,
    (err, str) => {
      if (err) {
        res.status(500).send(err.message);
      } else if (view === "login" || view === "register") {
        return res.render(view, extendedData);
      } else {
        res.render("layout", { ...extendedData, body: str});
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
        senderPic: req.session.user.picture || null,
        timestamp: new Date()
      });
      await textMessage.save();
      messages.push(textMessage);

      io.to(req.params.groupId).emit("group message", textMessage);
      await sendGroupNotification('message',groupId, req.session.user.username, req.session.user.name, req.body.text.trim(), req.session.user.picture || null);

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
        await sendGroupNotification('message',groupId, req.session.user.username, req.session.user.name, `ส่งไฟล์: ${file.originalname}`, req.session.user.picture || null);

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

  async function sendGroupNotification(type, groupId, senderUsername, sender, messageText, senderPic) {
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
                isRead: false
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

app.get("/status", requireLogin, (req, res) => {
  renderWithLayout(res, "status", { title: "KMUTNB Project - Status" }, req.path,req);
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
app.get("/flowchart", (req, res) => {
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
    const groups = await Group.find({
      $or: [
        { member1: username },
        { member2: username },
        { advisor: username }
      ]
    }).sort({ lastUpdatedTime: -1 });

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

  
    req.session.user = {
    username: user.username,
    name: user.name,
    lastname: user.lastname,
    role: user.role,
    email: user.email,
    phone: user.phone,
    group: user.group,
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
    const {  projectName, member1, member2, advisor ,status} = req.body;

    if (!projectName||!member1) {
      return res.status(400).send("ข้อมูลไม่ครบ");
    }

    // ตรวจสอบว่ามีใครอยู่ในกลุ่มแล้วหรือยัง
    const existingGroup = await Group.findOne({
      $or: [
        { member1: member1 },
        { member2: member2 }
      ]
    });

    if (existingGroup) {
      return res.status(400).send("สมาชิกนี้มีกลุ่มอยู่แล้ว");
    }

    // บันทึกกลุ่มใหม่
    const newGroup = new Group({ projectName, member1, member2, advisor ,status});
    await newGroup.save();

    await User.findOneAndUpdate(
      { username: member1 }, // หรือฟิลด์สำหรับค้นหาผู้ใช้ เช่น { username: member1 }
      { $set: { group: projectName } }
    );

    // อัปเดต member2 (ถ้ามีค่า)
    if (member2) {
        await User.findOneAndUpdate(
          { username: member2  }, // หรือฟิลด์สำหรับค้นหาผู้ใช้ เช่น { username: member2 }
          { $set: { group: projectName } }
        );
    }

    // อัปเดต session.user.group = "true"
    req.session.user.group = projectName;

    res.status(201).send("บันทึกกลุ่มสำเร็จ");
  } catch (err) {
    console.error("❌ Error saving group:", err);
    res.status(500).send("เกิดข้อผิดพลาดในการบันทึกกลุ่ม");
  }
});

app.post("/groups-update/:groupId", requireLogin, async (req, res) => {
  try {
    const {  member2, advisor } = req.body;

    // ตรวจสอบว่ามีใครอยู่ในกลุ่มแล้วหรือยัง
    const existingGroup = await Group.findOne({
      member2: member2,
      _id: { $ne: req.params.groupId } // ไม่รวมกลุ่มที่กำลังอัปเดต
    });
    if (existingGroup) {
      return res.status(400).send("สมาชิกนี้มีกลุ่มอยู่แล้ว");
    }

    // แก้ไขกลุ่ม
    const updatedGroup = await Group.findByIdAndUpdate(
      req.params.groupId,
      { member2, advisor },
      { new: true } // คืนค่ากลุ่มที่อัปเดตกลับมา
    );


    res.status(201).send("บันทึกกลุ่มสำเร็จ");
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
    } else if (group.advisor === username) {
      group.advisor = null;
    } else {
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

        // ไม่ว่าจะเป็นกลุ่ม หรือ 1:1 ให้บันทึกลง NotificationRead ทั้งหมด
        // เพื่อให้ระบบเสถียรและเช็ค hasRead ได้จากที่เดียว
        await NotificationRead.updateOne(
            { notificationId: notiId, userId: username },
            { $setOnInsert: { readAt: new Date() } },
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
        // Alert (ประกาศทั่วไป/กิจกรรม)
        const alertUnread = await Notification.countDocuments({
            recipient: 'ALL',
            _id: { $nin: readIds }
        });

        // Message (ข้อความในกลุ่ม)
        const messageUnread = await Notification.countDocuments({
            recipient: username,
            type: 'new_message',
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

app.post("/api/addEvent", requireLogin, async (req, res) => {
    try {
        const { title, date, toDate, description } = req.body;
        
        // ตรวจสอบว่าส่งค่ามาจริงไหม
        if (!title || !date) {
            return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
        }

        const newEvent = new Event({
            title,
            description,
            date: new Date(date), // มั่นใจว่าเป็น Date Object
            toDate: toDate ? new Date(toDate) : null
        });

        await newEvent.save();
        
        // 🔔 เรียกแจ้งเตือน (เช็คให้ชัวร์ว่าลบบั๊กในฟังก์ชันนี้แล้ว)
        await sendGroupNotification('alert', null, req.session.user.username, req.session.user.name, `มีกิจกรรมใหม่: ${title}`, req.session.user.picture || null);

        res.status(201).json({ message: "บันทึกสำเร็จ" });
    } catch (err) {
        console.error("❌ Server Error:", err); // ดู Error จริงๆ ใน Terminal ของคุณ
        res.status(500).json({ error: err.message });
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
