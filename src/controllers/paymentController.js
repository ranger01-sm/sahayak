// src/controllers/paymentController.js
// Razorpay integration for order creation and webhook verification.
// Install razorpay: npm install razorpay
// For demo/testing the package is optional — the controller degrades gracefully.

const crypto = require('crypto');
const { get, run } = require('../../config/database');

let Razorpay;
let razorpay;
try {
  Razorpay = require('razorpay');
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET &&
      !process.env.RAZORPAY_KEY_ID.includes('XXXXX')) {
    razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
} catch {
  console.warn('⚠️  razorpay package not installed — payment gateway disabled (mock mode).');
}

// ── POST /api/payments/create-order ──────────────────────────────────────────
// Creates a Razorpay order for the booking. Frontend uses this order_id to
// open the Razorpay checkout. COD bookings pay only the ₹49 platform fee.
async function createOrder(req, res) {
  try {
    const { booking_id } = req.body;
    const booking = await get('SELECT * FROM bookings WHERE id = ?', [booking_id]);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    if (booking.payment_status === 'paid') {
      return res.status(409).json({ success: false, message: 'Already paid.' });
    }

    const amount = booking.amount_paise;

    // Mock mode — no real Razorpay instance
    if (!razorpay) {
      const mockOrderId = 'order_mock_' + Date.now();
      await run(
        `UPDATE bookings SET order_id=?, updated_at=datetime('now') WHERE id=?`,
        [mockOrderId, booking_id]
      );
      return res.json({
        success: true,
        mock: true,
        order_id: mockOrderId,
        amount,
        currency: 'INR',
        key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_demo',
        booking_id,
        note: 'Mock order — add real Razorpay keys in .env to enable live payments.',
      });
    }

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: booking_id,
      notes: { booking_id, service: booking.service_type },
    });

    await run(
      `UPDATE bookings SET order_id=?, updated_at=datetime('now') WHERE id=?`,
      [order.id, booking_id]
    );

    return res.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
      booking_id,
    });
  } catch (err) {
    console.error('createOrder error:', err);
    return res.status(500).json({ success: false, message: 'Could not create payment order.' });
  }
}

// ── POST /api/payments/verify ─────────────────────────────────────────────────
// Called by the frontend after Razorpay checkout completes. Verifies the
// signature and marks the booking as paid.
async function verifyPayment(req, res) {
  try {
    const { booking_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Mock mode — accept anything
    if (!razorpay) {
      const { confirmPayment } = require('./bookingController');
      req.params = { id: booking_id };
      req.body   = { payment_id: razorpay_payment_id || 'mock_pay', order_id: razorpay_order_id };
      return confirmPayment(req, res);
    }

    // Verify HMAC signature
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment signature verification failed.' });
    }

    // Delegate to booking controller to run allocation
    const { confirmPayment } = require('./bookingController');
    req.params = { id: booking_id };
    req.body   = { payment_id: razorpay_payment_id, order_id: razorpay_order_id };
    return confirmPayment(req, res);
  } catch (err) {
    console.error('verifyPayment error:', err);
    return res.status(500).json({ success: false, message: 'Payment verification error.' });
  }
}

// ── POST /api/payments/webhook ────────────────────────────────────────────────
// Razorpay webhook endpoint (configure in Razorpay dashboard).
// Handles async payment events: payment.captured, payment.failed
async function webhook(req, res) {
  try {
    const secret    = process.env.RAZORPAY_KEY_SECRET || '';
    const signature = req.headers['x-razorpay-signature'];
    const body      = JSON.stringify(req.body);

    if (secret && signature) {
      const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
      if (expected !== signature) {
        return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
      }
    }

    const event = req.body;
    if (event.event === 'payment.captured') {
      const payment  = event.payload.payment.entity;
      const bookingId = payment.notes?.booking_id;
      if (bookingId) {
        await run(
          `UPDATE bookings SET payment_status='paid', payment_id=?, updated_at=datetime('now')
           WHERE id=? AND payment_status != 'paid'`,
          [payment.id, bookingId]
        );
        console.log(`✅ Webhook: payment captured for booking ${bookingId}`);
      }
    } else if (event.event === 'payment.failed') {
      const payment   = event.payload.payment.entity;
      const bookingId = payment.notes?.booking_id;
      if (bookingId) {
        await run(
          `UPDATE bookings SET payment_status='failed', updated_at=datetime('now') WHERE id=?`,
          [bookingId]
        );
        console.log(`❌ Webhook: payment failed for booking ${bookingId}`);
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('webhook error:', err);
    return res.status(500).json({ success: false });
  }
}

module.exports = { createOrder, verifyPayment, webhook };
