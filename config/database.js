const mongoose = require('mongoose');

let connectionPromise = null;

const connectDB = async () => {
  // إذا بالفعل جاري connection، انتظر النتيجة
  if (connectionPromise) {
    return connectionPromise;
  }

  console.log('[DB] Starting MongoDB connection...');
  
  connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 10000,
    connectTimeoutMS: 5000,
    // لا تحاول إعادة الاتصال بشكل متكرر في serverless
    retryWrites: process.env.NODE_ENV === 'production' ? false : true,
    maxPoolSize: process.env.NODE_ENV === 'production' ? 1 : 10,
  })
  .then((conn) => {
    console.log(`[DB] MongoDB Connected: ${conn.connection.host}`);
    return conn;
  })
  .catch((error) => {
    console.error('[DB] Connection error:', error.message);
    connectionPromise = null; // Reset لمحاولة مجددة في المستقبل
    throw error;
  });

  return connectionPromise;
};

module.exports = connectDB;