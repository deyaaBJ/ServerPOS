const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const bcrypt = require("bcrypt");
const path = require("path");
require("dotenv").config(); // هذا السطر مهم جداً!
const app = express();
app.use(express.json());
app.use(express.static("public"));

// ==========================
// 🔗 MongoDB Connection
// ==========================
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log("✅ Connected to MongoDB Atlas");
  
  // تهيئة كلمة السر الافتراضية للأدمن إذا لم تكن موجودة
  await initializeDefaultAdmin();
})
.catch((err) => {
  console.error("❌ MongoDB connection error:", err);
  process.exit(1);
});

// ==========================
// 🗂️ Mongoose Schemas & Models
// ==========================
const SALT_ROUNDS = 10;

// نموذج كود التفعيل
const codeSchema = new mongoose.Schema({
  code: { 
    type: String, 
    required: true, 
    unique: true,
    uppercase: true,
    trim: true
  },
  used: { 
    type: Boolean, 
    default: false 
  },
  deviceId: { 
    type: String, 
    default: null 
  },
  activatedAt: { 
    type: Date, 
    default: null 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// نموذج إعدادات الأدمن
const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    default: "admin"
  },
  password: {
    type: String,
    required: true
  },
  lastChanged: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const ActivationCode = mongoose.model("ActivationCode", codeSchema);
const AdminConfig = mongoose.model("AdminConfig", adminSchema);

// ==========================
// 🛠️ Helper Functions
// ==========================
async function initializeDefaultAdmin() {
  try {
    const adminExists = await AdminConfig.findOne({ username: "admin" });
    
    if (!adminExists) {
      // كلمة السر الافتراضية: "admin123"
      const hashedPassword = await bcrypt.hash("admin123", SALT_ROUNDS);
      
      await AdminConfig.create({
        username: "admin",
        password: hashedPassword,
        lastChanged: new Date()
      });
      
      console.log("✅ Default admin created with password: admin123");
      console.log("⚠️ WARNING: Please change the default password!");
    }
  } catch (error) {
    console.error("Error initializing admin:", error);
  }
}

async function verifyAdminPassword(password) {
  try {
    const admin = await AdminConfig.findOne({ username: "admin" });
    
    if (!admin) {
      await initializeDefaultAdmin();
      return false;
    }
    
    return await bcrypt.compare(password, admin.password);
  } catch (error) {
    console.error("Error verifying admin password:", error);
    return false;
  }
}

async function changeAdminPassword(currentPassword, newPassword) {
  try {
    const admin = await AdminConfig.findOne({ username: "admin" });
    
    if (!admin) {
      return { success: false, message: "Admin not found" };
    }
    
    // التحقق من كلمة السر الحالية
    const isValid = await bcrypt.compare(currentPassword, admin.password);
    
    if (!isValid) {
      return { success: false, message: "Current password is incorrect" };
    }
    
    // تشفير كلمة السر الجديدة
    const hashedNewPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    
    // تحديث كلمة السر
    admin.password = hashedNewPassword;
    admin.lastChanged = new Date();
    await admin.save();
    
    return { success: true, message: "Password changed successfully" };
  } catch (error) {
    console.error("Error changing admin password:", error);
    return { success: false, message: "Error changing password" };
  }
}

// ==========================
// 📦 Session
// ==========================
app.use(
  session({
    secret: "motamayez-secret-2026-" + Date.now(), // مفتاح عشوائي
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 ساعة
    }
  })
);

// ==========================
// 🛡️ Middleware
// ==========================
function adminOnly(req, res, next) {
  if (!req.session.admin) {
    return res.status(401).json({ 
      success: false, 
      message: "Unauthorized access" 
    });
  }
  next();
}

// ==========================
// 🔑 تسجيل دخول الأدمن (مع MongoDB)
// ==========================
app.post("/admin/login", async (req, res) => {
  const { key } = req.body;

  if (!key) {
    return res.status(400).json({ 
      success: false, 
      message: "Password is required" 
    });
  }

  try {
    const isValid = await verifyAdminPassword(key);
    
    if (isValid) {
      req.session.admin = true;
      req.session.save();
      
      return res.json({ 
        success: true, 
        message: "Login successful" 
      });
    } else {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid password" 
      });
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

// ==========================
// 🔐 تغيير كلمة سر الأدمن
// ==========================
app.post("/admin/change-password", adminOnly, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ 
      success: false, 
      message: "Both current and new password are required" 
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ 
      success: false, 
      message: "New password must be at least 6 characters" 
    });
  }

  try {
    const result = await changeAdminPassword(currentPassword, newPassword);
    
    if (result.success) {
      // إلغاء جميع الجلسات الحالية (إجبار إعادة تسجيل الدخول)
      req.session.destroy();
      
      res.json({ 
        success: true, 
        message: result.message 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: result.message 
      });
    }
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

// ==========================
// 🔓 API التفعيل (Flutter)
// ==========================
app.post("/activate", async (req, res) => {
  const { code, deviceId } = req.body;

  if (!code || !deviceId) {
    return res.status(400).json({
      success: false,
      message: "Missing code or deviceId",
    });
  }

  try {
    const normalizedCode = code.trim().toUpperCase();
    const entry = await ActivationCode.findOne({ code: normalizedCode });

    // ❌ الكود غير موجود
    if (!entry) {
      return res.json({
        success: false,
        message: "Invalid code",
      });
    }

    // ❌ الكود مستخدم من جهاز آخر
    if (entry.used && entry.deviceId !== deviceId) {
      return res.status(403).json({
        success: false,
        message: "هذا الكود مستخدم على جهاز آخر. يرجى مراجعة الأدمن.",
      });
    }

    // ✅ الكود مستخدم من نفس الجهاز (إعادة تشغيل)
    if (entry.used && entry.deviceId === deviceId) {
      return res.json({
        success: true,
        message: "Already activated on this device",
      });
    }

    // ✅ أول تفعيل
    entry.used = true;
    entry.deviceId = deviceId;
    entry.activatedAt = new Date();
    await entry.save();

    console.log(`✅ تم تفعيل الكود: ${normalizedCode} للجهاز: ${deviceId}`);

    return res.json({
      success: true,
      message: "Activation successful",
    });

  } catch (error) {
    console.error("❌ خطأ في التفعيل:", error);
    
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// ==========================
// 🔐 Admin APIs
// ==========================
app.get("/admin/codes", adminOnly, async (req, res) => {
  try {
    const codes = await ActivationCode.find().sort({ createdAt: -1 });
    res.json(codes);
  } catch (error) {
    console.error("❌ خطأ في جلب الأكواد:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/admin/add-code", adminOnly, async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ message: "Code is required" });
  }

  try {
    const normalizedCode = code.trim().toUpperCase();

    // التحقق من وجود الكود
    const existingCode = await ActivationCode.findOne({ code: normalizedCode });
    if (existingCode) {
      return res.status(400).json({ message: "Code already exists" });
    }

    const newCode = new ActivationCode({
      code: normalizedCode,
      used: false,
      deviceId: null,
      activatedAt: null,
    });

    await newCode.save();
    console.log(`➕ تم إضافة كود جديد: ${normalizedCode}`);
    
    res.json({ success: true });

  } catch (error) {
    console.error("❌ خطأ في إضافة الكود:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/admin/delete-code/:code", adminOnly, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = code.toUpperCase();
    
    const result = await ActivationCode.deleteOne({ code: normalizedCode });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Code not found" });
    }
    
    console.log(`🗑️ تم حذف الكود: ${normalizedCode}`);
    
    res.json({ success: true, message: "Code deleted" });
    
  } catch (error) {
    console.error("❌ خطأ في حذف الكود:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ==========================
// 📊 الحصول على الإحصائيات
// ==========================
app.get("/admin/stats", adminOnly, async (req, res) => {
  try {
    const totalCodes = await ActivationCode.countDocuments();
    const usedCodes = await ActivationCode.countDocuments({ used: true });
    const availableCodes = totalCodes - usedCodes;
    
    // عدد الأجهزة الفريدة المفعلة
    const activatedDevices = await ActivationCode.distinct("deviceId", { used: true });
    const uniqueDevices = activatedDevices.filter(id => id !== null).length;
    
    // آخر 10 تفعيلات
    const recentActivations = await ActivationCode.find({ used: true })
      .sort({ activatedAt: -1 })
      .limit(10);
    
    // إحصائيات الأدمن
    const adminInfo = await AdminConfig.findOne({ username: "admin" });
    
    res.json({
      success: true,
      stats: {
        totalCodes,
        usedCodes,
        availableCodes,
        uniqueDevices,
        lastPasswordChange: adminInfo?.lastChanged || null
      },
      recentActivations
    });
  } catch (error) {
    console.error("Error getting stats:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==========================
// 🏥 Health Check
// ==========================
app.get("/health", async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    const codesCount = await ActivationCode.countDocuments();
    const adminExists = await AdminConfig.exists({ username: "admin" });
    
    res.json({
      status: "OK",
      database: dbStatus,
      adminConfigured: adminExists ? "Yes" : "No",
      codesCount: codesCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ status: "ERROR", error: error.message });
  }
});

// ==========================
// 🚀 Start Server
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 MongoDB URI: ${MONGODB_URI ? 'Configured' : 'Not configured'}`);
  console.log(`🔐 Admin authentication: MongoDB`);
});