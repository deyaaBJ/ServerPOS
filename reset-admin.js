const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const MONGODB_URI = process.env.MONGODB_URI ;


async function resetAdminPassword() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✅ Connected to MongoDB");

    // حذف الأدمن الحالي إن وجد
    await mongoose.connection.collection('adminconfigs').deleteMany({});

    // إنشاء أدمن جديد بكلمة سر "admin123"
    const hashedPassword = await bcrypt.hash("admin123", 10);
    
    await mongoose.connection.collection('adminconfigs').insertOne({
      username: "admin",
      password: hashedPassword,
      lastChanged: new Date(),
      createdAt: new Date()
    });

    console.log("✅ Admin password has been reset to: admin123");
    console.log("⚠️ Please change this password immediately!");

    mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error resetting admin password:", error);
    process.exit(1);
  }
}

resetAdminPassword();