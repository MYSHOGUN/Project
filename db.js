// แก้ไขใน db.js
const connectDB = async () => {
  try {
    // ใช้ค่าจาก Cloud Run Configuration (MONGODB_URI)
    const dbURI = process.env.MONGODB_URI || "mongodb://localhost:27017/test";
    await mongoose.connect(dbURI, {
      // ตัวเลือกเหล่านี้ใน Mongoose 6+ ไม่จำเป็นต้องใส่แล้ว แต่ใส่ไว้ไม่เสียหายครับ
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected to Atlas");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
};