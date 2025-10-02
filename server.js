const Message = require("./models/Message"); // ✅ import model

const Group = require("./models/Group"); // ✅ import group model

const userSockets = new Map();
const mongoose = require("mongoose");

const express = require("express");
const path = require("path");
const ejs = require("ejs");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("./db"); // ✅ เพิ่มตรงนี้

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

// ใช้ memory storage ของ multer
const storage = multer.memoryStorage();
const upload = multer({ storage });

let bucket;

connectDB().then(() => {
  bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "fs" });
  console.log("✅ GridFSBucket initialized");
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: "secret-key", // เปลี่ยนเป็น secret จริงใน production
  resave: false,
  saveUninitialized: true
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
      } else if (view === "login") {
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
// Routes
app.get("/", (req, res) => {
  renderWithLayout(res, "index", { title: "KMUTNB Project - Main" }, req.path,req);
});
app.get("/upload", requireLogin, (req, res) => {
  renderWithLayout(res, "upload", { title: "KMUTNB Project - Upload" }, req.path,req);
});

app.post("/upload-file/:groupId", requireLogin, upload.array("files"), async (req, res) => {
  try {
    const messages = [];

    // ถ้ามีข้อความ
    if(req.body.text && req.body.text.trim() !== ""){
      const textMessage = new Message({
        groupId: req.params.groupId,
        senderUsername: req.session.user.username,
        senderName: req.session.user.name,
        type: "text",
        text: req.body.text.trim(),
        timestamp: new Date()
      });
      await textMessage.save();
      messages.push(textMessage);

      io.to(req.params.groupId).emit("group message", textMessage);
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
          timestamp: new Date()
        });

        await fileMessage.save();
        messages.push(fileMessage);
        io.to(req.params.groupId).emit("group message", fileMessage);
      }
    }

    res.json(messages);
    } catch(err){
      console.error(err);
      res.status(500).json({ error: "Upload error" });
    }
  });


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
app.get("/login", (req, res) => {
  renderWithLayout(res, "login", { title: "KMUTNB Project - Login" }, req.path,req);
});
app.get("/flowchart", (req, res) => {
  renderWithLayout(res, "flowchart", { title: "KMUTNB Project - Flowchart" }, req.path,req);
});
app.get("/file", requireLogin, (req, res) => {
  renderWithLayout(res, "file", { title: "KMUTNB Project - File" }, req.path,req);
});
app.get("/group", requireLogin, async (req, res) => {
  try{
    const group = await Group.findOne({
      $or: [
        { member1: req.session.user.username },
        { member2: req.session.user.username }
      ]
    });

    if(req.session.user && req.session.user.canAddMember !== 'true'){
      req.session.user.group = group ? "true" : "false";
      req.session.save();
    }else if(req.session.user.canAddMember === "true"){
      req.session.user.canAddMember = "false"; // อนุญาตเพิ่มสมาชิก
      req.session.save();
    }

    const username = req.session.user.username;
    const groups = await Group.find({
      $or: [
        { member1: username },
        { member2: username },
        { advisor: username }
      ]
    });

    const mem1 = await User.findOne({username: groups[0].member1});
    const mem2 = await User.findOne({username: groups[0].member2});
    const adv = await User.findOne({username: groups[0].advisor});
    const userInfo = [mem1, mem2, adv];

    renderWithLayout(res, "group", { 
      title: "KMUTNB Project - Group",
      userInfo, 
      groups,
      user: req.session.user
    }, req.path,req);
  }catch(err){
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
    res.clearCookie('connect.sid'); // ล้าง cookie session (ชื่ออาจต่างกันตาม config)
    res.redirect('/'); // ไปหน้า main หลัง logout
  });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });

  //console.log("✅ User from DB:", user); // <-- ใส่ตรงนี้
  if (!user) return res.send("❌ ไม่พบผู้ใช้");

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.send("❌ รหัสผ่านไม่ถูกต้อง");

  
    req.session.user = {
    username: user.username,
    name: user.name,
    lastname: user.lastname,
    role: user.role,
    
  };
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

    // อัปเดต session.user.group = "true"
    req.session.user.group = "true";

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

app.post("/groups/activate-add-member", requireLogin, async (req, res) => {
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
});

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
      { $unset: { group: "" } } // เอา group ออก
    );

    // อัปเดต session
    req.session.user.group = false;

    res.send("ออกจากกลุ่มสำเร็จ");
  } catch (err) {
    console.error(err);
    res.status(500).send("เกิดข้อผิดพลาดที่ server");
  }
});

// Socket.IO
io.on("connection", (socket) => {
  

  // รับข้อความใหม่
  socket.on("register", (username) => {
    socket.username = username;
    userSockets.set(username, socket.id);
    console.log("🔗 Registered user:", username);
  });

  socket.on("join group", (groupId) => {
    socket.join(groupId);
    console.log(`👥 User ${socket.id} joined group ${groupId}`);
  });

  socket.on("group message", async (msg) => {
    console.log("📨 Group message:", msg);
    try {
      const message = new Message({
        senderUsername: msg.senderUsername,
        senderName: msg.senderName,
        groupId: msg.groupId,
        text: msg.text,
        timestamp: new Date()
      });
      await message.save();

      // broadcast ให้ทุกคนในห้อง groupId
      io.to(msg.groupId).emit("group message", msg);

    } catch (err) {
      console.error("❌ Error saving message:", err);
    }
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
