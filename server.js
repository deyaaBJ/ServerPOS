console.log('[T0] file starting - about to require modules');
require('dotenv').config();
const express = require('express');
console.log('[T0b] express required');
const session = require('express-session');
console.log('[T0c] express-session required');
const MongoStore = require('connect-mongo');
console.log('[T0d] connect-mongo required');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const serverless = require('serverless-http');

const connectDB = require('./config/database');
const { errorHandler } = require('./middleware/errorHandler');
console.log('[T0e] about to require Admin model');
const Admin = require('./models/Admin');
console.log('[T0f] Admin model required');
const { getConfiguredPublicKey } = require('./utils/activationSignature');

// Import routes
console.log('[T0g] about to require route files');
const adminRoutes = require('./routes/admin');
console.log('[T0h] admin routes required');
const codeRoutes = require('./routes/codes');
console.log('[T0i] code routes required');
const activationRoutes = require('./routes/activation');
console.log('[T0j] activation routes required - all requires done');


const app = express();
console.log('[T1] express app created');


// ─────────────────────────────────────────────
// [FIX 1] التحقق من المتغيرات الإلزامية عند البدء
// بدل ما السيرفر يشتغل بـ undefined هلق بيرمي error واضح
// ─────────────────────────────────────────────
const REQUIRED_ENV = ['SESSION_SECRET', 'MONGODB_URI'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

if (!process.env.RSA_PRIVATE_KEY && !process.env.RSA_PRIVATE_KEY_PATH) {
  throw new Error('Missing RSA private key. Set RSA_PRIVATE_KEY or RSA_PRIVATE_KEY_PATH');
}

console.log('[T2] env vars validated');


// Trust proxy for Render
app.set('trust proxy', 1);

// ─────────────────────────────────────────────
// [DEBUG] تتبع كل طلب داخل - أول شي بيصير
// ─────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.path} | secure=${req.secure} | x-forwarded-proto=${req.headers['x-forwarded-proto']}`);
  next();
});

// ─────────────────────────────────────────────
// [FIX 2] HTTPS redirect في production
// كل طلب HTTP بيتحوّل تلقائياً لـ HTTPS
// ─────────────────────────────────────────────

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

console.log('[T3] helmet configured');

// ─────────────────────────────────────────────
// [FIX 4] CORS - يرمي error لو ALLOWED_ORIGINS مش معرّف في production
// بدل ما يفتح localhost في production
// ─────────────────────────────────────────────
let allowedOrigins;
if (process.env.NODE_ENV === 'production') {
  if (!process.env.ALLOWED_ORIGINS) {
    throw new Error('ALLOWED_ORIGINS must be set in production');
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log('[T4] cors configured, allowedOrigins=', allowedOrigins);


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

console.log('[T4b] body parsers attached, about to define /api/health route');

// ─────────────────────────────────────────────
// Health check - لازم يكون هون، قبل الـ session
// حتى ما يعلق بانتظار الاتصال بقاعدة البيانات
// ─────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  console.log('[T5] /api/health handler invoked');
  const mongoose = require('mongoose');
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development'
  });
  console.log('[T6] /api/health response sent');
});

console.log('[T5b] /api/health route defined, about to call MongoStore.create');

// Session configuration
const sessionConfig = {
  name: 'motamayez.sid',
  secret: process.env.SESSION_SECRET, // [FIX 1] مضمون إنه موجود من التحقق فوق
  resave: false,
  saveUninitialized: false,
// store: MongoStore.create({
//   mongoUrl: process.env.MONGODB_URI,
//   collectionName: 'sessions',
//   ttl: 24 * 60 * 60,
//   autoRemove: 'native',
//   touchAfter: 24 * 3600,
//   mongoOptions: {
//     family: 4, // 🔥 هذا هو الحل السحري لـ Vercel مع MongoDB Atlas
//     serverSelectionTimeoutMS: 1000, // ثانية واحدة فقط
//     connectTimeoutMS: 1000,
//     socketTimeoutMS: 1000,
//   }
// }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/'
  }
};

console.log('[T5c] MongoStore.create returned, sessionConfig built');

app.use(session(sessionConfig));

console.log('[T7] session middleware attached');

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
// ✅ هذا الكود الجديد بدل القديم (اتصال آمن بدون تعليق)
let isDBReady = false;

app.use(async (req, res, next) => {
  // مسار الصحة ما يحتاج قاعدة بيانات، خلّه يمر بسرعة
  if (req.path === '/api/health') {
    return next();
  }

  // إذا قاعدة البيانات مو جاهزة، نبدأ الاتصال (مرة وحدة فقط)
  if (!isDBReady) {
    try {
      console.log('🔄 جاري الاتصال بقاعدة البيانات...');
      await connectDB();
      await Admin.initializeDefault();
      isDBReady = true;
      console.log('✅ قاعدة البيانات جاهزة');
    } catch (error) {
      console.error('❌ فشل الاتصال بقاعدة البيانات:', error);
      // هنا الفرق الأهم: نرجع خطأ للمتصفح بدل ما نعلق (نخليه ينتظر للأبد)
      return res.status(503).json({
        success: false,
        message: 'قاعدة البيانات غير متاحة حالياً، حاول مرة أخرى'
      });
    }
  }

  next();
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

// Initialize application resources (DB, default admin)
const initializeApp = async () => {
  if (isDBReady) return;
  try {
    console.log('🔄 initializeApp: connecting to database...');
    await connectDB();
    await Admin.initializeDefault();
    isDBReady = true;
    console.log('✅ initializeApp: database ready');
  } catch (err) {
    console.error('❌ initializeApp error:', err);
    throw err;
  }
};

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


console.log('[T8] module fully loaded, exporting handler now');
module.exports = serverless(app);

// Handle unhandled rejections
// [FIX] على serverless ما منقتل الـ process لأي unhandled rejection
// لأنو هاد ممكن يوقف باقي الطلبات الشغالة بنفس الـ container بدون داعي
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err.name, err.message);
});