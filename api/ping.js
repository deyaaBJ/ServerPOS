module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    success: true,
    message: 'pong',
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV || null,
      MONGODB_URI_present: !!process.env.MONGODB_URI,
      SESSION_SECRET_present: !!process.env.SESSION_SECRET
    }
  });
};
