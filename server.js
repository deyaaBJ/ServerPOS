require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const serverless = require('serverless-http');

const connectDB = require('./config/database');
const { errorHandler } = require('./middleware/errorHandler');
const Admin = require('./models/Admin');
const { getConfiguredPublicKey } = require('./utils/activationSignature');

// Import routes
const adminRoutes = require('./routes/admin');
const codeRoutes = require('./routes/codes');
const activationRoutes = require('./routes/activation');

const app = express();

// ─────────────────────────────────────────────
// [FIX 1] التحقق من المتغيرات الإلزامية عند البدء
// بدل ما السيرفر يشتغل بـ undefined هلق بيرمي error واضح
// ─────────────────────────────────────────────
const REQUIRED_ENV = ['SESSION_SECRET', 'MONGODB_URI'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

if (!process.env.RSA_PRIVATE_KEY && !process.env.RSA_PRIVATE_KEY_PATH) {
  console.error('âŒ Missing RSA private key. Set RSA_PRIVATE_KEY or RSA_PRIVATE_KEY_PATH');
  process.exit(1);
}

// Trust proxy for Render
app.set('trust proxy', 1);

// ─────────────────────────────────────────────
// [FIX 2] HTTPS redirect في production
// كل طلب HTTP بيتحوّل تلقائياً لـ HTTPS
// ─────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (!req.secure && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// ─────────────────────────────────────────────
// [FIX 3] Helmet مع CSP بدون unsafe-inline
// استخدام nonce بدل unsafe-inline لحماية أقوى
// ─────────────────────────────────────────────
app.use((req, res, next) => {
  res.locals.nonce = require('crypto').randomBytes(16).toString('base64');
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // لو عندك inline styles ضرورية
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`], // [FIX 3] nonce بدل unsafe-inline
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// ─────────────────────────────────────────────
// [FIX 4] CORS - يرمي error لو ALLOWED_ORIGINS مش معرّف في production
// بدل ما يفتح localhost في production
// ─────────────────────────────────────────────
let allowedOrigins;
if (process.env.NODE_ENV === 'production') {
  if (!process.env.ALLOWED_ORIGINS) {
    console.error('❌ ALLOWED_ORIGINS must be set in production');
    process.exit(1);
  }
  allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
} else {
  allowedOrigins = (process.env.ALLOWED_ORIGINS?.split(',')) || [
    'http://localhost:3000',
    'http://localhost:5000'
  ];
}

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// عام - 30 request/دقيقة لكل IP
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,  // يرجع RateLimit-* headers
  legacyHeaders: false,   // يلغي X-RateLimit-* القديمة
  message: {
    success: false,
    message: 'تجاوزت الحد المسموح، انتظر دقيقة.'
  }
});
app.use('/api/', limiter);

// Auth - 5 محاولات/دقيقة (فشل فقط)
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'محاولات تسجيل دخول كثيرة، انتظر دقيقة.'
  }
});
app.use('/api/admin/login', authLimiter);

// [NEW] Activation - 10 محاولات/دقيقة
const activationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'تجاوزت حد التفعيل، انتظر دقيقة.'
  }
});
app.use('/api/activate', activationLimiter);

const licenseLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many license validation attempts. Please wait a minute.'
  }
});
app.use('/api/activate/license', licenseLimiter);

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Session configuration
const sessionConfig = {
  name: 'motamayez.sid',
  secret: process.env.SESSION_SECRET, // [FIX 1] مضمون إنه موجود من التحقق فوق
  resave: false,
  saveUninitialized: false,
store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60,
    autoRemove: 'native',
    touchAfter: 24 * 3600,
    mongoOptions: {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    }
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/'
  }
};

app.use(session(sessionConfig));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/admin', adminRoutes);
app.use('/api/codes', codeRoutes);
app.use('/api/activate', activationRoutes);

app.get('/api/activate/public-key', (req, res) => {
  const publicKey = getConfiguredPublicKey();

  if (!publicKey) {
    return res.status(404).json({
      success: false,
      message: 'RSA public key is not configured on the server'
    });
  }

  res.json({
    success: true,
    algorithm: 'RSA-SHA256',
    publicKey
  });
});

// Health check
app.get('/api/health', async (req, res) => {
  const mongoose = require('mongoose');
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development'
  });
});

let initializationPromise = null;

const initializeApp = async () => {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    await connectDB();
    await Admin.initializeDefault();
  })();

  return initializationPromise;
};

app.use(async (req, res, next) => {
  if (req.path === '/api/health') {
    return next();
  }

  try {
    await initializeApp();
    next();
  } catch (error) {
    next(error);
  }
});

// Serve admin panel
app.get(['/', '/admin'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await initializeApp();

    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = serverless(app);

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});
