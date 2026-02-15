const Admin = require('../models/Admin');

const adminOnly = async (req, res, next) => {
  try {
    if (!req.session?.admin) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized access. Please login.' 
      });
    }
    
    // Verify admin still exists in database
    const admin = await Admin.findOne({ username: 'admin' });
    if (!admin) {
      req.session.destroy();
      return res.status(401).json({ 
        success: false, 
        message: 'Admin account not found' 
      });
    }
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Authentication error' 
    });
  }
};

const checkSession = (req, res, next) => {
  if (req.session?.admin) {
    return res.json({ 
      success: true, 
      message: 'Already logged in',
      admin: true 
    });
  }
  next();
};

module.exports = { adminOnly, checkSession };