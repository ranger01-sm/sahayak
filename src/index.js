// src/index.js
require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const path        = require('path');
const rateLimit   = require('express-rate-limit');
const { initSchema } = require('../config/database');
const errorHandler   = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Webhook route needs raw body BEFORE json middleware ──────────────────────
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
  if (Buffer.isBuffer(req.body)) req.body = JSON.parse(req.body.toString());
  next();
});

// ── Global middleware ────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',    // Lock down in production
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Serve uploaded files (Aadhaar / photos) — protect in production with auth
app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_DIR || './uploads')));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again in 15 minutes.' },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,
  message: { success: false, message: 'Too many registration attempts. Please try again later.' },
});

app.use('/api', apiLimiter);
app.use('/api/workers/register', registerLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/workers',  require('./routes/workers'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/reviews',  require('./routes/reviews'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Sahayak API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found.` });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Boot ──────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await initSchema();
    app.listen(PORT, () => {
      console.log(`\n🚀 Sahayak API running on http://localhost:${PORT}`);
      console.log(`📋 Health: http://localhost:${PORT}/health`);
      console.log(`\nAvailable endpoints:`);
      console.log(`  POST   /api/workers/register`);
      console.log(`  GET    /api/workers?lat=&lng=&skill=`);
      console.log(`  GET    /api/workers/:id`);
      console.log(`  PATCH  /api/workers/:id/location`);
      console.log(`  GET    /api/workers/:id/bookings`);
      console.log(`  POST   /api/bookings`);
      console.log(`  GET    /api/bookings`);
      console.log(`  GET    /api/bookings/:id`);
      console.log(`  POST   /api/bookings/:id/confirm-payment`);
      console.log(`  PATCH  /api/bookings/:id/status`);
      console.log(`  POST   /api/payments/create-order`);
      console.log(`  POST   /api/payments/verify`);
      console.log(`  POST   /api/payments/webhook`);
      console.log(`  POST   /api/reviews`);
      console.log(`  GET    /api/reviews?worker_id=`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
