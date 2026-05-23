const express = require("express");
const { run, get, all } = require("../config/database");
const auth   = require("../middleware/auth");
const router = express.Router();

// All admin routes require admin role
router.use(auth(["admin"]));

// ── GET /api/admin/dashboard ──────────────────────────────────────────────────
router.get("/dashboard", async (req, res) => {
  try {
    const [totalWorkers, pendingWorkers, totalUsers, totalBookings, paidBookings] = await Promise.all([
      get("SELECT COUNT(*) AS c FROM workers"),
      get("SELECT COUNT(*) AS c FROM workers WHERE status='pending'"),
      get("SELECT COUNT(*) AS c FROM users"),
      get("SELECT COUNT(*) AS c FROM bookings"),
      get("SELECT COALESCE(SUM(amount_paid),0) AS total FROM bookings WHERE payment_status='paid'"),
    ]);
    res.json({
      totalWorkers:  totalWorkers.c,
      pendingWorkers: pendingWorkers.c,
      totalUsers:    totalUsers.c,
      totalBookings: totalBookings.c,
      revenueINR:    paidBookings.total
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/workers?status=pending ─────────────────────────────────────
router.get("/workers", async (req, res) => {
  try {
    const { status } = req.query;
    const workers = status
      ? await all("SELECT * FROM workers WHERE status=? ORDER BY created_at DESC", [status])
      : await all("SELECT * FROM workers ORDER BY created_at DESC");
    res.json({ workers: workers.map(({password,...w})=>w) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/admin/workers/:id/status ─────────────────────────────────────────
router.put("/workers/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["active","suspended","pending"];
    if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
    await run(
      "UPDATE workers SET status=?, updated_at=datetime('now') WHERE id=?",
      [status, req.params.id]
    );
    res.json({ message: `Worker ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/bookings ───────────────────────────────────────────────────
router.get("/bookings", async (req, res) => {
  try {
    const bookings = await all(
      `SELECT b.*, u.name AS customer_name, u.phone AS customer_phone,
              w.name AS worker_name
       FROM bookings b
       LEFT JOIN users u ON u.id = b.user_id
       LEFT JOIN workers w ON w.id = b.worker_id
       ORDER BY b.created_at DESC`
    );
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get("/users", async (req, res) => {
  try {
    const users = await all("SELECT id,name,phone,email,role,created_at FROM users ORDER BY created_at DESC");
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
