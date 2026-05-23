const express = require("express");
const crypto  = require("crypto");
const { v4: uuid } = require("uuid");
const { run, get } = require("../config/database");
const auth   = require("../middleware/auth");
const router = express.Router();

// Service price map (INR)
const SERVICE_PRICES = {
  "Maid Service":            49900,   // paise (₹499)
  "Full-Time Maid":        1200000,   // ₹12,000
  "Cleaning Service":        29900,
  "Pregnancy Care Helper":   79900,
  "Cook / Chef":             59900,
  "Elderly Care":            99900,
  "Driver":                  49900,
  "Security Guard":          59900,
  "Baby Care":               79900,
};

function getPrice(service) {
  return SERVICE_PRICES[service] || 49900; // default ₹499
}

// ── POST /api/payments/create-order ─────────────────────────────────────────
// In production: call Razorpay to create an order; here we simulate it.
router.post("/create-order", auth(["customer"]), async (req, res) => {
  try {
    const { booking_id, payment_method } = req.body;
    if (!booking_id) return res.status(400).json({ error: "booking_id required" });

    const booking = await get("SELECT * FROM bookings WHERE id=?", [booking_id]);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.user_id !== req.user.id) return res.status(403).json({ error: "Forbidden" });
    if (booking.payment_status === "paid") return res.status(400).json({ error: "Already paid" });

    const amount = getPrice(booking.service);
    const paymentId = uuid();
    // Simulated Razorpay order id (replace with real Razorpay API call)
    const razorpay_order_id = `order_${Date.now()}`;

    await run(
      `INSERT INTO payments (id,booking_id,user_id,razorpay_order_id,amount,method,status)
       VALUES (?,?,?,?,?,?,?)`,
      [paymentId, booking_id, req.user.id, razorpay_order_id, amount/100, payment_method||null, "created"]
    );

    res.json({
      paymentId,
      razorpay_order_id,
      amount,          // paise
      currency: "INR",
      key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_demo",
      booking_id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/verify  — verify Razorpay signature ──────────────────
router.post("/verify", auth(["customer"]), async (req, res) => {
  try {
    const {
      payment_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    // Signature verification
    const body      = razorpay_order_id + "|" + razorpay_payment_id;
    const expected  = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "test_secret")
      .update(body)
      .digest("hex");

    const valid = expected === razorpay_signature;
    // In development/demo mode, accept any signature
    const isDev = process.env.NODE_ENV !== "production";

    if (!valid && !isDev)
      return res.status(400).json({ error: "Invalid payment signature" });

    // Mark payment captured
    const payment = await get("SELECT * FROM payments WHERE id=?", [payment_id]);
    if (!payment) return res.status(404).json({ error: "Payment record not found" });

    await run(
      `UPDATE payments SET razorpay_payment_id=?, razorpay_signature=?, status='captured'
       WHERE id=?`,
      [razorpay_payment_id, razorpay_signature, payment_id]
    );

    // Mark booking as paid
    await run(
      `UPDATE bookings SET payment_status='paid', payment_id=?, payment_method=?,
       amount_paid=?, updated_at=datetime('now') WHERE id=?`,
      [razorpay_payment_id, payment.method, payment.amount, payment.booking_id]
    );

    res.json({ success: true, message: "Payment verified", booking_id: payment.booking_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/simulate  — dev-only instant payment confirm ──────────
router.post("/simulate", auth(["customer"]), async (req, res) => {
  try {
    if (process.env.NODE_ENV === "production")
      return res.status(403).json({ error: "Not available in production" });

    const { booking_id, payment_method } = req.body;
    const booking = await get("SELECT * FROM bookings WHERE id=?", [booking_id]);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const payId = `pay_demo_${Date.now()}`;
    await run(
      `UPDATE bookings SET payment_status='paid', payment_id=?, payment_method=?,
       amount_paid=?, updated_at=datetime('now') WHERE id=?`,
      [payId, payment_method||"demo", getPrice(booking.service)/100, booking_id]
    );

    res.json({ success: true, payment_id: payId, booking_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
