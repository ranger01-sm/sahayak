const express = require("express");
const { v4: uuid } = require("uuid");
const { run, get, all } = require("../config/database");
const auth   = require("../middleware/auth");
const router = express.Router();

// ── Allocation algorithm — closest available worker ──────────────────────────
async function allocateWorker(service, userLat, userLng) {
  const workers = await all(
    `SELECT w.*, GROUP_CONCAT(ws.skill) AS skills
     FROM workers w
     LEFT JOIN worker_skills ws ON ws.worker_id = w.id
     WHERE w.status = 'active'
     GROUP BY w.id`
  );

  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const haversine = (la1,lo1,la2,lo2) => {
    const dLat = toRad(la2-la1), dLon = toRad(lo2-lo1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(la1))*Math.cos(toRad(la2))*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const scored = workers
    .filter(w => !service || w.skills?.toLowerCase().includes(service.split(" ")[0].toLowerCase()))
    .map(w => ({
      ...w,
      distKm: (w.lat && w.lng && userLat && userLng)
        ? +haversine(userLat, userLng, w.lat, w.lng).toFixed(2)
        : 999
    }))
    .sort((a,b) => a.distKm - b.distKm || b.rating - a.rating);

  return scored[0] || null;
}

// ── POST /api/bookings  — create booking ─────────────────────────────────────
router.post("/", auth(["customer","admin"]), async (req, res) => {
  try {
    const {
      service, frequency, start_date, preferred_time, requirements,
      budget, cust_lat, cust_lng, cust_society, cust_city, cust_address,
      payment_method
    } = req.body;

    if (!service) return res.status(400).json({ error: "service is required" });

    const id = uuid();
    await run(
      `INSERT INTO bookings
       (id,user_id,service,frequency,start_date,preferred_time,requirements,
        budget,cust_lat,cust_lng,cust_society,cust_city,cust_address,payment_method)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.user.id, service, frequency||null, start_date||null,
       preferred_time||null, requirements||null,
       budget||null, cust_lat||null, cust_lng||null,
       cust_society||null, cust_city||"Surat", cust_address||null,
       payment_method||null]
    );

    res.status(201).json({ bookingId: id, status: "pending", message: "Booking created. Complete payment to confirm." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/bookings/my  — customer's bookings ──────────────────────────────
router.get("/my", auth(["customer"]), async (req, res) => {
  try {
    const bookings = await all(
      `SELECT b.*, w.name AS worker_name, w.phone AS worker_phone,
              w.rating AS worker_rating, w.photo_url AS worker_photo
       FROM bookings b
       LEFT JOIN workers w ON w.id = b.worker_id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/bookings/worker  — jobs assigned to logged-in worker ────────────
router.get("/worker", auth(["worker"]), async (req, res) => {
  try {
    const bookings = await all(
      `SELECT b.*, u.name AS customer_name, u.phone AS customer_phone
       FROM bookings b
       LEFT JOIN users u ON u.id = b.user_id
       WHERE b.worker_id = ?
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/bookings/:id ─────────────────────────────────────────────────────
router.get("/:id", auth(), async (req, res) => {
  try {
    const booking = await get("SELECT * FROM bookings WHERE id=?", [req.params.id]);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    // Only allow owner, assigned worker, or admin
    if (req.user.role === "customer" && booking.user_id !== req.user.id)
      return res.status(403).json({ error: "Forbidden" });
    if (req.user.role === "worker" && booking.worker_id !== req.user.id)
      return res.status(403).json({ error: "Forbidden" });
    res.json({ booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bookings/:id/assign  — called after payment confirmed ──────────
router.post("/:id/assign", auth(["customer","admin"]), async (req, res) => {
  try {
    const booking = await get("SELECT * FROM bookings WHERE id=?", [req.params.id]);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.payment_status !== "paid")
      return res.status(400).json({ error: "Payment not confirmed yet" });

    const worker = await allocateWorker(booking.service, booking.cust_lat, booking.cust_lng);
    if (!worker) return res.status(404).json({ error: "No available workers right now" });

    await run(
      `UPDATE bookings SET worker_id=?, status='confirmed', updated_at=datetime('now') WHERE id=?`,
      [worker.id, booking.id]
    );

    // Create notification for worker
    await run(
      `INSERT INTO notifications (id,worker_id,type,title,body)
       VALUES (?,?,?,?,?)`,
      [uuid(), worker.id, "new_booking",
       "New Job Assigned!",
       `You have been assigned a ${booking.service} job. Customer location: ${booking.cust_society||booking.cust_address||"Surat"}`]
    );

    const { password, ...safeWorker } = worker;
    const etaMin = Math.round(worker.distKm * 8 + 4);
    res.json({
      message: "Worker assigned",
      worker: { ...safeWorker, etaMin },
      bookingId: booking.id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/bookings/:id/status  — update booking status ───────────────────
router.put("/:id/status", auth(["worker","admin"]), async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["confirmed","in_progress","completed","cancelled"];
    if (!allowed.includes(status))
      return res.status(400).json({ error: "Invalid status" });

    await run(
      "UPDATE bookings SET status=?, updated_at=datetime('now') WHERE id=?",
      [status, req.params.id]
    );
    res.json({ message: "Status updated", status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
