require("dotenv").config();
const express     = require("express");
const cors        = require("cors");
const helmet      = require("helmet");
const morgan      = require("morgan");
const rateLimit   = require("express-rate-limit");
const path        = require("path");
const { initSchema } = require("./config/database");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security & logging ───────────────────────────────────────────────────────
app.use(helmet());
app.use(morgan("dev"));
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate limiting
app.use("/api/auth", rateLimit({ windowMs: 15*60*1000, max: 20, message: { error: "Too many attempts" } }));
app.use("/api",      rateLimit({ windowMs: 60*1000,     max: 200 }));

// Static uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth",          require("./routes/auth"));
app.use("/api/workers",       require("./routes/workers"));
app.use("/api/bookings",      require("./routes/bookings"));
app.use("/api/payments",      require("./routes/payments"));
app.use("/api/reviews",       require("./routes/reviews"));
app.use("/api/admin",         require("./routes/admin"));
app.use("/api/notifications", require("./routes/notifications"));

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", service: "Sahayak API" }));

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// ── Boot ─────────────────────────────────────────────────────────────────────
async function start() {
  await initSchema();
  app.listen(PORT, () => {
    console.log(`\n🚀 Sahayak API running on http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   Env:    ${process.env.NODE_ENV || "development"}\n`);
  });
}

start().catch(err => { console.error(err); process.exit(1); });
