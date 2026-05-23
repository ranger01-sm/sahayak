const express = require("express");
const { v4: uuid } = require("uuid");
const { run, get, all } = require("../config/database");
const auth   = require("../middleware/auth");
const router = express.Router();

// ── POST /api/reviews ────────────────────────────────────────────────────────
router.post("/", auth(["customer"]), async (req, res) => {
  try {
    const { booking_id, rating, comment } = req.body;
    if (!booking_id || !rating) return res.status(400).json({ error: "booking_id and rating required" });

    const booking = await get("SELECT * FROM bookings WHERE id=? AND user_id=?", [booking_id, req.user.id]);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.status !== "completed") return res.status(400).json({ error: "Can only review completed bookings" });
    if (!booking.worker_id) return res.status(400).json({ error: "No worker assigned" });

    const exists = await get("SELECT id FROM reviews WHERE booking_id=?", [booking_id]);
    if (exists) return res.status(409).json({ error: "Already reviewed" });

    const id = uuid();
    await run(
      "INSERT INTO reviews (id,booking_id,user_id,worker_id,rating,comment) VALUES (?,?,?,?,?,?)",
      [id, booking_id, req.user.id, booking.worker_id, rating, comment||null]
    );

    // Recalculate worker average rating
    const stats = await get(
      "SELECT AVG(rating) AS avg, COUNT(*) AS cnt FROM reviews WHERE worker_id=?",
      [booking.worker_id]
    );
    await run(
      "UPDATE workers SET rating=?, rating_count=?, updated_at=datetime('now') WHERE id=?",
      [+stats.avg.toFixed(2), stats.cnt, booking.worker_id]
    );

    res.status(201).json({ id, message: "Review submitted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/reviews/worker/:workerId ─────────────────────────────────────────
router.get("/worker/:workerId", async (req, res) => {
  try {
    const reviews = await all(
      `SELECT r.*, u.name AS customer_name
       FROM reviews r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.worker_id=? ORDER BY r.created_at DESC`,
      [req.params.workerId]
    );
    res.json({ reviews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
