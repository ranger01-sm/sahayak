// src/controllers/workerController.js
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../../config/database');
const { haversineKm } = require('../utils/geo');

// ── POST /api/workers/register ────────────────────────────────────────────────
async function registerWorker(req, res) {
  try {
    const {
      full_name, phone, email, age, gender,
      skills,           // array or comma-separated string
      experience, expected_pay,
      society, city, full_address,
      lat, lng,
      avail_days,       // array
      avail_from, avail_until,
      about,
    } = req.body;

    // Normalise skills / avail_days to JSON strings
    const skillsJson  = Array.isArray(skills)     ? JSON.stringify(skills)     : skills;
    const availJson   = Array.isArray(avail_days)  ? JSON.stringify(avail_days) : avail_days || '[]';

    // File paths from multer (optional)
    const aadhaarPath = req.files?.aadhaar?.[0]?.path || null;
    const photoPath   = req.files?.photo?.[0]?.path   || null;

    // Prevent duplicate phone
    const existing = await get('SELECT id FROM workers WHERE phone = ?', [phone]);
    if (existing) {
      return res.status(409).json({ success: false, message: 'A worker with this phone number is already registered.' });
    }

    const id = uuidv4();
    await run(
      `INSERT INTO workers
        (id, full_name, phone, email, age, gender, skills, experience, expected_pay,
         society, city, full_address, lat, lng, avail_days, avail_from, avail_until,
         aadhaar_path, photo_path, about)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, full_name, phone, email || null, age || null, gender || null,
       skillsJson, experience || null, expected_pay || null,
       society || null, city || 'Surat', full_address || null,
       lat || null, lng || null,
       availJson, avail_from || null, avail_until || null,
       aadhaarPath, photoPath, about || null]
    );

    return res.status(201).json({
      success: true,
      message: 'Registration successful! We will verify your profile within 24 hours.',
      worker_id: id,
    });
  } catch (err) {
    console.error('registerWorker error:', err);
    return res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
}

// ── GET /api/workers ─────────────────────────────────────────────────────────
// Query params: lat, lng, radius_km (default 5), skill, limit (default 20)
async function getNearbyWorkers(req, res) {
  try {
    const {
      lat, lng,
      radius_km = process.env.MATCH_RADIUS_KM || 5,
      skill, limit = 20,
    } = req.query;

    let workers = await all(
      `SELECT id, full_name, skills, experience, avg_rating, total_jobs,
              lat, lng, society, city, is_online, avail_days, avail_from, avail_until, gender
       FROM workers
       WHERE is_verified = 1`,
      []
    );

    // Filter by skill
    if (skill) {
      const s = skill.toLowerCase();
      workers = workers.filter(w => {
        try { return JSON.parse(w.skills).some(sk => sk.toLowerCase().includes(s)); }
        catch { return w.skills.toLowerCase().includes(s); }
      });
    }

    // Calculate distance & filter by radius when coordinates provided
    if (lat && lng) {
      const cLat = parseFloat(lat);
      const cLng = parseFloat(lng);
      workers = workers
        .map(w => ({ ...w, dist_km: w.lat && w.lng ? haversineKm(cLat, cLng, w.lat, w.lng) : 9999 }))
        .filter(w => w.dist_km <= parseFloat(radius_km))
        .sort((a, b) => a.dist_km - b.dist_km || b.avg_rating - a.avg_rating);
    } else {
      workers = workers.sort((a, b) => b.avg_rating - a.avg_rating);
    }

    // Parse skills JSON before sending
    workers = workers.slice(0, parseInt(limit)).map(w => ({
      ...w,
      skills: safeParseJson(w.skills, []),
      avail_days: safeParseJson(w.avail_days, []),
    }));

    return res.json({ success: true, count: workers.length, workers });
  } catch (err) {
    console.error('getNearbyWorkers error:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching workers.' });
  }
}

// ── GET /api/workers/:id ─────────────────────────────────────────────────────
async function getWorkerById(req, res) {
  try {
    const worker = await get(
      `SELECT id, full_name, phone, email, age, gender, skills, experience,
              expected_pay, society, city, full_address, lat, lng,
              avail_days, avail_from, avail_until, about,
              is_verified, is_online, avg_rating, total_jobs, created_at
       FROM workers WHERE id = ?`,
      [req.params.id]
    );
    if (!worker) return res.status(404).json({ success: false, message: 'Worker not found.' });

    worker.skills    = safeParseJson(worker.skills, []);
    worker.avail_days = safeParseJson(worker.avail_days, []);

    return res.json({ success: true, worker });
  } catch (err) {
    console.error('getWorkerById error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── PATCH /api/workers/:id/location ──────────────────────────────────────────
async function updateWorkerLocation(req, res) {
  try {
    const { lat, lng, is_online } = req.body;
    await run(
      `UPDATE workers SET lat=?, lng=?, is_online=?, updated_at=datetime('now') WHERE id=?`,
      [lat, lng, is_online !== undefined ? is_online : 1, req.params.id]
    );
    return res.json({ success: true, message: 'Location updated.' });
  } catch (err) {
    console.error('updateWorkerLocation error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── GET /api/workers/:id/bookings ─────────────────────────────────────────────
async function getWorkerBookings(req, res) {
  try {
    const bookings = await all(
      `SELECT b.id, b.service_type, b.start_date, b.preferred_time, b.status,
              b.society, b.city, b.full_address, b.payment_status, b.created_at,
              c.full_name AS customer_name, c.phone AS customer_phone
       FROM bookings b
       JOIN customers c ON c.id = b.customer_id
       WHERE b.worker_id = ?
       ORDER BY b.created_at DESC`,
      [req.params.id]
    );
    return res.json({ success: true, count: bookings.length, bookings });
  } catch (err) {
    console.error('getWorkerBookings error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function safeParseJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = {
  registerWorker,
  getNearbyWorkers,
  getWorkerById,
  updateWorkerLocation,
  getWorkerBookings,
};
