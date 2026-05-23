// src/controllers/bookingController.js
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../../config/database');
const { haversineKm } = require('../utils/geo');
const { sendSms } = require('../utils/sms');

// ── Service → price map (in paise: 1 INR = 100 paise) ────────────────────────
const SERVICE_PRICES = {
  'Maid Service':           49900,   // ₹499
  'Full-Time Maid':       120000,    // ₹1200 (advance/booking fee)
  'Cleaning Service':       29900,   // ₹299
  'Pregnancy Care Helper':  79900,   // ₹799
  'Cook / Chef':            59900,   // ₹599
  'Elderly Care':           99900,   // ₹999
  'Driver':                 49900,
  'Security Guard':         59900,
  'Baby Care':              79900,
};
const COD_PLATFORM_FEE = parseInt(process.env.COD_PLATFORM_FEE || '4900');

// ── POST /api/bookings ────────────────────────────────────────────────────────
async function createBooking(req, res) {
  try {
    const {
      // Customer info
      full_name, phone, email,
      // Service
      service_type, frequency, start_date, preferred_time, requirements,
      // Location
      society, city, full_address, cust_lat, cust_lng,
      // Payment
      budget_range, payment_method, worker_gender_pref,
    } = req.body;

    // Upsert customer (create if first time)
    let customer = await get('SELECT id FROM customers WHERE phone = ?', [phone]);
    if (!customer) {
      const cid = uuidv4();
      await run(
        'INSERT INTO customers (id, full_name, phone, email) VALUES (?,?,?,?)',
        [cid, full_name, phone, email || null]
      );
      customer = { id: cid };
    }

    const amount = payment_method === 'cod'
      ? COD_PLATFORM_FEE
      : (SERVICE_PRICES[service_type] || 49900);

    const bookingId = uuidv4();
    await run(
      `INSERT INTO bookings
        (id, customer_id, service_type, frequency, start_date, preferred_time,
         requirements, society, city, full_address, cust_lat, cust_lng,
         budget_range, payment_method, amount_paise, worker_gender_pref)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [bookingId, customer.id, service_type, frequency || null,
       start_date || null, preferred_time || null, requirements || null,
       society || null, city || 'Surat', full_address || null,
       cust_lat || null, cust_lng || null,
       budget_range || null, payment_method, amount,
       worker_gender_pref || null]
    );

    return res.status(201).json({
      success: true,
      booking_id: bookingId,
      customer_id: customer.id,
      amount_paise: amount,
      amount_inr: (amount / 100).toFixed(2),
      message: 'Booking created. Proceed to payment to confirm.',
    });
  } catch (err) {
    console.error('createBooking error:', err);
    return res.status(500).json({ success: false, message: 'Server error creating booking.' });
  }
}

// ── POST /api/bookings/:id/confirm-payment ────────────────────────────────────
// Called after Razorpay/UPI payment is verified. Runs the allocation algorithm.
async function confirmPayment(req, res) {
  try {
    const { id } = req.params;
    const { payment_id, order_id } = req.body;  // from Razorpay callback

    const booking = await get('SELECT * FROM bookings WHERE id = ?', [id]);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    if (booking.payment_status === 'paid') {
      return res.status(409).json({ success: false, message: 'Payment already confirmed for this booking.' });
    }

    // Mark payment as paid
    await run(
      `UPDATE bookings SET payment_status='paid', payment_id=?, order_id=?, updated_at=datetime('now') WHERE id=?`,
      [payment_id || 'manual', order_id || null, id]
    );

    // ── ALLOCATION ALGORITHM ─────────────────────────────────────────────────
    const worker = await allocateWorker(booking);

    if (!worker) {
      // No worker found — keep booking open, notify ops team
      await run(
        `UPDATE bookings SET status='pending', updated_at=datetime('now') WHERE id=?`,
        [id]
      );
      return res.json({
        success: true,
        assigned: false,
        message: 'Payment received. We are finding a worker and will confirm shortly via SMS.',
        booking_id: id,
      });
    }

    // Assign worker
    await run(
      `UPDATE bookings SET worker_id=?, status='assigned', updated_at=datetime('now') WHERE id=?`,
      [worker.id, id]
    );

    const eta = Math.round(worker.dist_km * 8 + 4);

    // Get customer phone for SMS
    const customer = await get('SELECT phone, full_name FROM customers WHERE id = ?', [booking.customer_id]);
    await sendSms(
      customer.phone,
      `Sahayak: Your ${booking.service_type} booking is confirmed! Worker: ${worker.full_name}, ETA ~${eta} min. Thank you!`
    );
    await sendSms(
      worker.phone,
      `Sahayak: New job assigned! Service: ${booking.service_type} for ${customer.full_name}. Address: ${booking.full_address || booking.society}. Start: ${booking.start_date || 'ASAP'}`
    );

    // Parse worker skills safely
    let workerSkills = worker.skills;
    try { workerSkills = JSON.parse(worker.skills); } catch {}

    return res.json({
      success: true,
      assigned: true,
      booking_id: id,
      worker: {
        id: worker.id,
        full_name: worker.full_name,
        skills: workerSkills,
        experience: worker.experience,
        avg_rating: worker.avg_rating,
        dist_km: parseFloat(worker.dist_km.toFixed(2)),
        eta_minutes: eta,
        gender: worker.gender,
      },
    });
  } catch (err) {
    console.error('confirmPayment error:', err);
    return res.status(500).json({ success: false, message: 'Server error confirming payment.' });
  }
}

// ── GET /api/bookings/:id ─────────────────────────────────────────────────────
async function getBookingById(req, res) {
  try {
    const booking = await get(
      `SELECT b.*, c.full_name AS customer_name, c.phone AS customer_phone,
              w.full_name AS worker_name, w.phone AS worker_phone,
              w.avg_rating AS worker_rating, w.experience AS worker_experience,
              w.skills AS worker_skills, w.gender AS worker_gender
       FROM bookings b
       JOIN customers c ON c.id = b.customer_id
       LEFT JOIN workers w ON w.id = b.worker_id
       WHERE b.id = ?`,
      [req.params.id]
    );
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    return res.json({ success: true, booking });
  } catch (err) {
    console.error('getBookingById error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── GET /api/bookings — list with optional filters ────────────────────────────
async function listBookings(req, res) {
  try {
    const { status, customer_phone, worker_id, limit = 50, offset = 0 } = req.query;
    const conditions = [];
    const params = [];

    if (status)         { conditions.push('b.status = ?');          params.push(status); }
    if (worker_id)      { conditions.push('b.worker_id = ?');        params.push(worker_id); }
    if (customer_phone) {
      conditions.push('c.phone = ?');
      params.push(customer_phone);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(parseInt(limit), parseInt(offset));

    const bookings = await all(
      `SELECT b.id, b.service_type, b.status, b.payment_status, b.start_date,
              b.society, b.city, b.created_at, b.amount_paise,
              c.full_name AS customer_name, c.phone AS customer_phone,
              w.full_name AS worker_name
       FROM bookings b
       JOIN customers c ON c.id = b.customer_id
       LEFT JOIN workers w ON w.id = b.worker_id
       ${where}
       ORDER BY b.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );
    return res.json({ success: true, count: bookings.length, bookings });
  } catch (err) {
    console.error('listBookings error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── PATCH /api/bookings/:id/status ────────────────────────────────────────────
async function updateBookingStatus(req, res) {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(', ')}` });
    }
    await run(
      `UPDATE bookings SET status=?, updated_at=datetime('now') WHERE id=?`,
      [status, req.params.id]
    );
    return res.json({ success: true, message: `Booking status updated to '${status}'.` });
  } catch (err) {
    console.error('updateBookingStatus error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── ALLOCATION ALGORITHM ──────────────────────────────────────────────────────
// Finds the closest available verified worker matching the service type.
// Ranking: within MATCH_RADIUS_KM → sorted by distance asc, then avg_rating desc
async function allocateWorker(booking) {
  const radiusKm = parseFloat(process.env.MATCH_RADIUS_KM || 5);
  const serviceKeyword = (booking.service_type || '').toLowerCase().split(' ')[0];

  let workers = await all(
    `SELECT id, full_name, phone, skills, experience, avg_rating, lat, lng, gender
     FROM workers
     WHERE is_verified = 1 AND is_online = 1`,
    []
  );

  // 1. Filter by skill match
  workers = workers.filter(w => {
    try {
      const skills = JSON.parse(w.skills);
      return skills.some(s => s.toLowerCase().includes(serviceKeyword));
    } catch {
      return w.skills.toLowerCase().includes(serviceKeyword);
    }
  });

  // 2. Filter by gender preference
  if (booking.worker_gender_pref && booking.worker_gender_pref !== 'No preference') {
    const preferred = booking.worker_gender_pref.toLowerCase().includes('female') ? 'Female' : 'Male';
    const genFiltered = workers.filter(w => w.gender === preferred);
    if (genFiltered.length > 0) workers = genFiltered; // only apply if any match
  }

  // 3. Filter by distance (if customer coordinates available)
  if (booking.cust_lat && booking.cust_lng) {
    workers = workers
      .map(w => ({
        ...w,
        dist_km: w.lat && w.lng ? haversineKm(booking.cust_lat, booking.cust_lng, w.lat, w.lng) : 9999,
      }))
      .filter(w => w.dist_km <= radiusKm);
  } else {
    workers = workers.map(w => ({ ...w, dist_km: 1.0 })); // default if no coords
  }

  // 4. Exclude workers already assigned to an active booking right now
  const busyWorkers = await all(
    `SELECT DISTINCT worker_id FROM bookings
     WHERE status IN ('assigned','in_progress') AND worker_id IS NOT NULL`,
    []
  );
  const busyIds = new Set(busyWorkers.map(b => b.worker_id));
  workers = workers.filter(w => !busyIds.has(w.id));

  if (workers.length === 0) return null;

  // 5. Sort: closest first, then highest rated
  workers.sort((a, b) => a.dist_km - b.dist_km || b.avg_rating - a.avg_rating);

  return workers[0];
}

module.exports = {
  createBooking,
  confirmPayment,
  getBookingById,
  listBookings,
  updateBookingStatus,
};
