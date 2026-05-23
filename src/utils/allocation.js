const { all, get } = require('../config/database');

/**
 * Haversine distance in km between two lat/lng points
 */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find & return the best available worker for a booking.
 * Algorithm:
 *   1. Filter workers who offer the requested service
 *   2. Filter workers who are online, verified, and have no active booking
 *   3. Score each worker: score = (1/distance_km) * 0.5 + (rating/5) * 0.3 + (experience_bonus) * 0.2
 *   4. Return highest-scoring worker
 */
async function allocateWorker(serviceName, customerLat, customerLng, radiusKm = 10) {
  // Get all online verified workers with their locations
  const workers = await all(`
    SELECT wp.*, u.name, u.phone,
           wl.lat AS cur_lat, wl.lng AS cur_lng
    FROM worker_profiles wp
    JOIN users u ON u.id = wp.user_id
    LEFT JOIN worker_locations wl ON wl.worker_id = wp.id
    WHERE wp.is_online = 1
      AND wp.is_verified = 1
      AND u.is_active = 1
  `);

  const busyWorkerIds = await all(`
    SELECT DISTINCT worker_id FROM bookings
    WHERE status IN ('assigned','in_progress') AND worker_id IS NOT NULL
  `);
  const busySet = new Set(busyWorkerIds.map(r => r.worker_id));

  const candidates = workers
    .filter(w => !busySet.has(w.id))
    .filter(w => {
      // Check skill match
      try {
        const skills = JSON.parse(w.skills || '[]');
        return skills.some(s => s.toLowerCase().includes(serviceName.toLowerCase().split(' ')[0]) ||
          serviceName.toLowerCase().includes(s.toLowerCase().split(' ')[0]));
      } catch { return true; }
    })
    .map(w => {
      const wLat = w.cur_lat || w.lat || 0;
      const wLng = w.cur_lng || w.lng || 0;
      const dist = (customerLat && customerLng) ? haversine(customerLat, customerLng, wLat, wLng) : 999;
      const expBonus = parseFloat(w.experience_yrs) > 5 ? 1 : (parseFloat(w.experience_yrs) > 2 ? 0.6 : 0.3);
      const score = (dist > 0 ? (1 / dist) * 0.5 : 0) + ((w.rating / 5) * 0.3) + (expBonus * 0.2);
      return { ...w, distKm: Math.round(dist * 10) / 10, score };
    })
    .filter(w => w.distKm <= radiusKm)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return null;
  return candidates[0];
}

module.exports = { allocateWorker, haversine };
