const express = require("express");
const bcrypt  = require("bcryptjs");
const { v4: uuid } = require("uuid");
const { run, get, all } = require("../config/database");
const auth   = require("../middleware/auth");
const upload = require("../middleware/upload");
const router = express.Router();

// ── POST /api/workers/register ───────────────────────────────────────────────
router.post(
  "/register",
  upload.fields([{ name:"aadhaar",max:1 }, { name:"photo",max:1 }]),
  async (req, res) => {
    try {
      const {
        name, phone, email, password, age, gender,
        experience_yrs, expected_pay, about,
        lat, lng, society, city, full_address,
        skills,           // JSON array string  ["Maid Service","Cooking"]
        availability,     // JSON array of { day, from_time, until_time }
        available_days,   // alternative plain comma list
        from_time, until_time
      } = req.body;

      if (!name || !phone || !password)
        return res.status(400).json({ error: "name, phone and password required" });

      const existing = await get("SELECT id FROM workers WHERE phone=?", [phone]);
      if (existing) return res.status(409).json({ error: "Phone already registered" });

      const hash        = await bcrypt.hash(password, 12);
      const id          = uuid();
      const aadhaar_url = req.files?.aadhaar?.[0]?.filename || null;
      const photo_url   = req.files?.photo?.[0]?.filename   || null;

      await run(
        `INSERT INTO workers
         (id,name,phone,email,password,age,gender,experience_yrs,expected_pay,
          about,aadhaar_url,photo_url,lat,lng,society,city,full_address)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, name, phone, email||null, hash,
         age||null, gender||null, experience_yrs||null, expected_pay||null,
         about||null, aadhaar_url, photo_url,
         lat||null, lng||null,
         society||null, city||"Surat", full_address||null]
      );

      // Skills
      const skillList = skills ? JSON.parse(skills) : [];
      for (const skill of skillList) {
        await run("INSERT OR IGNORE INTO worker_skills (worker_id,skill) VALUES (?,?)", [id, skill]);
      }

      // Availability
      const avail = availability ? JSON.parse(availability) : [];
      for (const a of avail) {
        await run(
          "INSERT OR REPLACE INTO worker_availability (worker_id,day,from_time,until_time) VALUES (?,?,?,?)",
          [id, a.day, a.from_time||from_time||null, a.until_time||until_time||null]
        );
      }

      res.status(201).json({ message: "Registration submitted. Pending verification.", workerId: id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ── GET /api/workers/nearby  — find closest workers by GPS ──────────────────
router.get("/nearby", async (req, res) => {
  try {
    const { lat, lng, service, radius_km = 10, limit = 10 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });

    // Haversine-based filter in SQL (SQLite doesn't have native geo)
    // We fetch active/online workers and compute distance in JS
    let workers = await all(
      `SELECT w.*, GROUP_CONCAT(ws.skill) AS skills
       FROM workers w
       LEFT JOIN worker_skills ws ON ws.worker_id = w.id
       WHERE w.status = 'active' AND w.lat IS NOT NULL AND w.lng IS NOT NULL
       GROUP BY w.id`
    );

    const R = 6371; // Earth radius km
    const toRad = d => d * Math.PI / 180;
    const haversine = (la1,lo1,la2,lo2) => {
      const dLat = toRad(la2-la1), dLon = toRad(lo2-lo1);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(la1))*Math.cos(toRad(la2))*Math.sin(dLon/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };

    const userLat = parseFloat(lat), userLng = parseFloat(lng);

    workers = workers
      .map(w => ({ ...w, distKm: +haversine(userLat, userLng, w.lat, w.lng).toFixed(2) }))
      .filter(w => w.distKm <= parseFloat(radius_km))
      .filter(w => !service || w.skills?.toLowerCase().includes(service.toLowerCase()))
      .sort((a,b) => a.distKm - b.distKm || b.rating - a.rating)
      .slice(0, parseInt(limit))
      .map(({ password, ...safe }) => safe);

    res.json({ workers, count: workers.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/workers/:id ─────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const w = await get("SELECT * FROM workers WHERE id=?", [req.params.id]);
    if (!w) return res.status(404).json({ error: "Worker not found" });
    const skills = await all("SELECT skill FROM worker_skills WHERE worker_id=?", [w.id]);
    const avail  = await all("SELECT * FROM worker_availability WHERE worker_id=?", [w.id]);
    const { password, ...safe } = w;
    res.json({ ...safe, skills: skills.map(s=>s.skill), availability: avail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/workers/me/location  — worker updates their GPS ────────────────
router.put("/me/location", auth(["worker"]), async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });
    await run(
      "UPDATE workers SET lat=?, lng=?, is_online=1, updated_at=datetime('now') WHERE id=?",
      [lat, lng, req.user.id]
    );
    res.json({ message: "Location updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/workers/me/online ───────────────────────────────────────────────
router.put("/me/online", auth(["worker"]), async (req, res) => {
  try {
    const { is_online } = req.body;
    await run(
      "UPDATE workers SET is_online=?, updated_at=datetime('now') WHERE id=?",
      [is_online ? 1 : 0, req.user.id]
    );
    res.json({ message: `Worker is now ${is_online ? "online" : "offline"}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
