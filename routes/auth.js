const express = require("express");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { v4: uuid } = require("uuid");
const { run, get } = require("../config/database");
const router  = express.Router();

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });
}

// ── POST /api/auth/register  (customer registration) ────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;
    if (!name || !phone || !password)
      return res.status(400).json({ error: "name, phone and password are required" });

    const existing = await get("SELECT id FROM users WHERE phone=?", [phone]);
    if (existing) return res.status(409).json({ error: "Phone already registered" });

    const hash = await bcrypt.hash(password, 12);
    const id   = uuid();
    await run(
      "INSERT INTO users (id,name,phone,email,password) VALUES (?,?,?,?,?)",
      [id, name, phone, email||null, hash]
    );

    const token = makeToken({ id, role: "customer", phone });
    res.status(201).json({ token, user: { id, name, phone, email, role:"customer" } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/login  (customer login) ───────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: "phone and password required" });

    const user = await get("SELECT * FROM users WHERE phone=?", [phone]);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok)  return res.status(401).json({ error: "Invalid credentials" });

    const token = makeToken({ id: user.id, role: user.role, phone: user.phone });
    const { password: _, ...safe } = user;
    res.json({ token, user: safe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/worker/login ──────────────────────────────────────────────
router.post("/worker/login", async (req, res) => {
  try {
    const { phone, password } = req.body;
    const worker = await get("SELECT * FROM workers WHERE phone=?", [phone]);
    if (!worker) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, worker.password);
    if (!ok)  return res.status(401).json({ error: "Invalid credentials" });

    const token = makeToken({ id: worker.id, role: "worker", phone: worker.phone });
    const { password: _, ...safe } = worker;
    res.json({ token, worker: safe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
