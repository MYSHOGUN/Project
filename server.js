const express = require("express");
const path = require("path");
const ejs = require("ejs");

const app = express();
const port = 3000;

// ตั้งค่า View Engine (views = app1/public)
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "app1", "public"));

// เสิร์ฟ static files จาก app1/src
app.use(express.static(path.join(__dirname, "app1", "src")));

// ฟังก์ชันช่วย render พร้อม layout
function renderWithLayout(res, view, data = {}) {
  ejs.renderFile(path.join(__dirname, "app1", "public", `${view}.ejs`), data, (err, str) => {
    if (err) {
      res.status(500).send(err.message);
    } else if(view === 'login'){
      return res.render(view, data);
    }else {
      res.render("layout", { ...data, body: str });
    }
  });
}

// เส้นทางหน้าหลัก
app.get("/", (req, res) => {
  renderWithLayout(res, "index", { title: "KMUTNB Project - Main" });
});

app.get("/upload", (req, res) => {
  renderWithLayout(res, "upload", { title: "KMUTNB Project - Upload" });
});

app.get("/status", (req, res) => {
  renderWithLayout(res, "status", { title: "KMUTNB Project - Status" });
});

app.get("/login", (req, res) => {
  renderWithLayout(res, "login", { title: "KMUTNB Project - Login" });
});

app.get("/flowchart", (req, res) => {
  renderWithLayout(res, "flowchart", { title: "KMUTNB Project - Flowchart" });
});

// เส้นทางหน้าโปรไฟล์
app.get("/profile", (req, res) => {
  renderWithLayout(res, "profile", { title: "Profile" });
});

// API
app.get("/api/message", (req, res) => {
  res.json({ message: "Hello from Node.js API!" });
});

// เริ่มเซิร์ฟเวอร์
app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
