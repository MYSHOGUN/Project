const Message = require("./models/Message"); // ✅ import model

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

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: "secret-key", // เปลี่ยนเป็น secret จริงใน production
  resave: false,
  saveUninitialized: true
}));

// ✅ เชื่อม MongoDB ก่อนเริ่มเซิร์ฟเวอร์
connectDB();

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
app.get("/chat/messages/:username", requireLogin, async (req, res) => {
  const fromUser = req.session.user.username;
  const toUser = req.params.username;

  try {
    const messages = await Message.find({
      $or: [
        { sender: fromUser, receiver: toUser },
        { sender: toUser, receiver: fromUser }
      ]
    }).sort({ timestamp: 1 });

    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: "Failed to load messages" });
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
    role: user.role
  };

  res.redirect("/");
});

// Socket.IO
io.on("connection", (socket) => {
  socket.username = socket.handshake.query.username;
  console.log("User connected:", socket.username);

  // รับข้อความใหม่
  socket.on("chat message", async (msg) => {
     console.log("Received chat message:", msg);
    try {
      // msg = { from, to, text }
      const message = new Message({
        sender: msg.from,
        receiver: msg.to,
        text: msg.text,
        timestamp: new Date()
      });
      await message.save();

      // ส่งข้อความเฉพาะผู้ที่เกี่ยวข้อง (sender และ receiver)
      io.sockets.sockets.forEach(s => {
  if (
    s.handshake.query.username === msg.from ||
    s.handshake.query.username === msg.to
  ) {
    s.emit("chat message", msg);
  }
});
    } catch (err) {
      console.error("Error saving message:", err);
    }
    console.log("Emitted message to users:", msg.from, msg.to);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

// Start server
server.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
