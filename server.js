const express = require("express");
const path = require("path");
const ejs = require("ejs");
const http = require("http"); // ใช้ http server
const { Server } = require("socket.io"); // เพิ่ม Socket.IO

const app = express();
const server = http.createServer(app); // ใช้ http server แทน express server
const io = new Server(server); // สร้าง instance ของ Socket.IO
const port = process.env.PORT || 3000;

// ตั้งค่า View Engine (views = app1/public)
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "app1", "public"));

// เสิร์ฟ static files จาก app1/src
app.use(express.static(path.join(__dirname, "app1", "src")));

// ฟังก์ชันช่วย render พร้อม layout
function renderWithLayout(res, view, data = {}, reqPath = "") {
  ejs.renderFile(path.join(__dirname, "app1", "public", `${view}.ejs`), { ...data, currentPath: reqPath }, (err, str) => {
    if (err) {
      res.status(500).send(err.message);
    } else if (view === "login") {
      return res.render(view, data);
    } else {
      res.render("layout", { ...data, body: str, currentPath: reqPath });
    }
  });
}

// เส้นทางหน้าหลัก
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

// เส้นทางหน้าโปรไฟล์
app.get("/profile", (req, res) => {
  renderWithLayout(res, "profile", { title: "Profile" }, req.path);
});

// API
app.get("/api/message", (req, res) => {
  res.json({ message: "Hello from Node.js API!" });
});

// เพิ่มการจัดการ Socket.IO
io.on("connection", (socket) => {
  console.log("🔌 A user connected");

  // รับข้อความจาก client
  socket.on("chat message", (msg) => {
    console.log("📩 Message received:", msg);
    io.emit("chat message", msg); // ส่งข้อความไปยัง client ทุกคน
  });

  // เมื่อผู้ใช้ตัดการเชื่อมต่อ
  socket.on("disconnect", () => {
    console.log("❌ A user disconnected");
  });
});

// เริ่มเซิร์ฟเวอร์
server.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});