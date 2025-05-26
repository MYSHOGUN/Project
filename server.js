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

// ✅ เชื่อม MongoDB ก่อนเริ่มเซิร์ฟเวอร์
connectDB();

// ตั้งค่า View Engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "app1", "public"));
app.use(express.static(path.join(__dirname, "app1", "src")));

// ฟังก์ชัน render
function renderWithLayout(res, view, data = {}, reqPath = "") {
  ejs.renderFile(
    path.join(__dirname, "app1", "public", `${view}.ejs`),
    { ...data, currentPath: reqPath },
    (err, str) => {
      if (err) {
        res.status(500).send(err.message);
      } else if (view === "login") {
        return res.render(view, data);
      } else {
        res.render("layout", { ...data, body: str, currentPath: reqPath });
      }
    }
  );
}

// Routes
app.get("/", (req, res) => {
  renderWithLayout(res, "index", { title: "KMUTNB Project - Main" }, req.path);
});
app.get("/upload", (req, res) => {
  renderWithLayout(res, "upload", { title: "KMUTNB Project - Upload" }, req.path);
});
app.get("/status", (req, res) => {
  renderWithLayout(res, "status", { title: "KMUTNB Project - Status" }, req.path);
});
app.get("/login", (req, res) => {
  renderWithLayout(res, "login", { title: "KMUTNB Project - Login" }, req.path);
});
app.get("/flowchart", (req, res) => {
  renderWithLayout(res, "flowchart", { title: "KMUTNB Project - Flowchart" }, req.path);
});
app.get("/file", (req, res) => {
  renderWithLayout(res, "file", { title: "KMUTNB Project - File" }, req.path);
});
app.get("/chat", (req, res) => {
  renderWithLayout(res, "chat", { title: "KMUTNB Project - Chat" }, req.path);
});
app.get("/profile", (req, res) => {
  renderWithLayout(res, "profile", { title: "Profile" }, req.path);
});
app.get("/api/message", (req, res) => {
  res.json({ message: "Hello from Node.js API!" });
});

// Socket.IO
io.on("connection", async (socket) => {
  console.log("🔌 A user connected");

  // 👉 ส่งประวัติแชททันทีเมื่อผู้ใช้ใหม่เชื่อม
  try {
    const messages = await Message.find().sort({ timestamp: 1 }).limit(100);
    socket.emit("chat history", messages); // ส่ง array กลับไป
  } catch (err) {
    console.error("❌ Error loading chat history:", err.message);
  }

  socket.on("chat message", async (msg) => {
    console.log("📩 Message received:", msg);
    try {
      const message = new Message({ text: msg });
      await message.save();
    } catch (err) {
      console.error("❌ Error saving message to DB:", err.message);
    }

    io.emit("chat message", msg); // ส่งข้อความใหม่ให้ทุกคน
  });

  socket.on("disconnect", () => {
    console.log("❌ A user disconnected");
  });
});


// Start server
server.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
