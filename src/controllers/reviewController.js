// src/controllers/reviewController.js
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../../config/database');

// ── POST /api/reviews ─────────────────────────────────────────────────────────
async function createReview(req, res) {
  try {
    const { booking_id, rating, comment } = req.body;

    const booking = await get(
      'SELECT * FROM bookings WHERE id = ?', [booking_id]
    );
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    if (booking.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Can only review completed bookings.' });
    }
    if (!booking.worker_id) {
      return res.status(400).json({ success: false, message: 'No worker assigned to this booking.' });
    }

    // One review per booking
    const existing = await get('SELECT id FROM reviews WHERE booking_id = ?', [booking_id]);
    if (existing) return res.status(409).json({ success: false, message: 'Booking already reviewed.' });

    const id = uuidv4();
    await run(
      `INSERT INTO reviews (id, booking_id, worker_id, customer_id, rating, comment)
       VALUES (?,?,?,?,?,?)`,
      [id, booking_id, booking.worker_id, booking.customer_id, rating, comment || null]
    );

    // Update worker's avg_rating and total_jobs
    const stats = await get(
      'SELECT COUNT(*) as cnt, AVG(rating) as avg FROM reviews WHERE worker_id = ?',
      [booking.worker_id]
    );
    await run(
      `UPDATE workers SET avg_rating=?, total_jobs=?, updated_at=datetime('now') WHERE id=?`,
      [parseFloat(stats.avg.toFixed(2)), stats.cnt, booking.worker_id]
    );

    return res.status(201).json({ success: true, review_id: id, message: 'Review submitted. Thank you!' });
  } catch (err) {
    console.error('createReview error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── GET /api/reviews?worker_id=... ───────────────────────────────────────────
async function getReviews(req, res) {
  try {
    const { worker_id, limit = 20, offset = 0 } = req.query;
    const conditions = worker_id ? ['r.worker_id = ?'] : [];
    const params     = worker_id ? [worker_id] : [];
    params.push(parseInt(limit), parseInt(offset));

    const reviews = await all(
      `SELECT r.id, r.rating, r.comment, r.created_at,
              c.full_name AS customer_name,
              w.full_name AS worker_name
       FROM reviews r
       JOIN customers c ON c.id = r.customer_id
       JOIN workers   w ON w.id = r.worker_id
       ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );
    return res.json({ success: true, count: reviews.length, reviews });
  } catch (err) {
    console.error('getReviews error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { createReview, getReviews };
