# KMUTNB Project Management System

ระบบจัดการโปรเจกต์สำหรับนักศึกษาวิทยาลัยเทคโนโลยีอุตสาหกรรม สาขาคอมพิวเตอร์

## เทคโนโลยีที่ใช้
- **Backend:** Node.js, Express.js
- **Frontend:** EJS (Embedded JavaScript Templates)
- **Database:** MongoDB (Mongoose)
- **Real-time:** Socket.IO
- **Authentication:** bcrypt, express-session
- **File Upload:** Multer, GridFS
- **Security:** Helmet, express-rate-limit, express-mongo-sanitize

## การติดตั้งและรันโปรเจกต์

### 1. ติดตั้ง Dependencies
```bash
npm install
```

### 2. ตั้งค่า Environment Variables
สร้างไฟล์ `.env` ในโฟลเดอร์รากของโปรเจกต์:
```env
MONGODB_URI=mongodb://localhost:27017/test
SESSION_SECRET=your-secret-key-change-this-in-production-please
PORT=8080
NODE_ENV=development
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

### 3. เริ่มต้น MongoDB
ตรวจสอบให้แน่ใจว่า MongoDB กำลังทำงานอยู่:
```bash
# สำหรับ Windows
net start MongoDB

# สำหรับ macOS/Linux
sudo systemctl start mongod
```

### 4. รันเซิร์ฟเวอร์
```bash
npm start
```

เปิดเบราว์เซอร์ที่ `http://localhost:8080`

## โครงสร้างโปรเจกต์
```
My Project/
├── server.js              # ไฟล์เซิร์ฟเวอร์หลัก
├── db.js                  # การเชื่อมต่อฐานข้อมูล
├── models/                # Schema ของ MongoDB
│   ├── User.js
│   ├── Group.js
│   ├── Event.js
│   └── ...
├── app1/
│   ├── public/            # ไฟล์ EJS templates
│   └── src/               # Static files (CSS, JS, Images)
└── .env                   # Environment variables
```

## ฟีเจอร์หลัก
- 🔐 ระบบล็อกอิน/ลงทะเบียนผู้ใช้
- 👥 การจัดการกลุ่มโปรเจกต์
- 📅 การจัดการกิจกรรม/ตารางสอบ
- 💬 ระบบแชทและการแจ้งเตือนแบบ Real-time
- 📄 การจัดการเอกสารและไฟล์ PDF
- 📊 ระบบรายงานและการติดตามสถานะ

## บทบาทผู้ใช้
- **Admin:** จัดการผู้ใช้ทั้งหมด
- **Teacher:** ดูแลกลุ่มที่ปรึกษา
- **Secretary:** จัดการเอกสาร
- **User:** นักศึกษาทั่วไป

## การตั้งค่าอีเมล (Optional)
สำหรับฟีเจอร์การส่งอีเมล (ลืมรหัสผ่าน, แจ้งเตือน):
1. เปิดใช้งาน 2-Step Verification ใน Gmail
2. สร้าง App Password
3. อัปเดตค่า `EMAIL_USER` และ `EMAIL_PASS` ในไฟล์ `.env`

## การพัฒนาต่อ
- ทำตามโครงสร้าง MVC (Models, Views, Controllers)
- ทุก Route ใหม่ต้องมี Error Handling
- ใช้ภาษาไทยสำหรับคอมเมนต์และข้อความ

## License
KMUTNB Computer Engineering Project
