const mongoose = require('mongoose');

module.exports = async (req, res) => {
  const start = Date.now();
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    const elapsed = Date.now() - start;
    res.status(200).json({
      success: true,
      message: 'MongoDB connected successfully',
      host: conn.connection.host,
      elapsed_ms: elapsed
    });
  } catch (error) {
    const elapsed = Date.now() - start;
    res.status(500).json({
      success: false,
      error: error.message,
      errorName: error.name,
      elapsed_ms: elapsed
    });
  }
};