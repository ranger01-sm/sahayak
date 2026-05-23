// src/utils/seed.js
// Run: npm run seed
// Inserts sample workers so the app works out of the box.

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { initSchema, run, all } = require('../../config/database');

const WORKERS = [
  {
    full_name: 'Ramesh Patel',
    phone: '+919876543210',
    email: 'ramesh@example.com',
    age: 38, gender: 'Male',
    skills: JSON.stringify(['Driver', 'Security Guard']),
    experience: '10 yrs', expected_pay: '₹12,000/month',
    society: 'Silver Oak Society', city: 'Surat',
    full_address: 'Silver Oak Society, Vesu, Surat 395007',
    lat: 21.172, lng: 72.845,
    avail_days: JSON.stringify(['Mon','Tue','Wed','Thu','Fri']),
    avail_from: '08:00', avail_until: '20:00',
    about: 'Experienced driver with clean record. Also provide security services.',
    is_verified: 1, is_online: 1, avg_rating: 4.8, total_jobs: 120,
  },
  {
    full_name: 'Sunita Devi',
    phone: '+919876543211',
    email: 'sunita@example.com',
    age: 32, gender: 'Female',
    skills: JSON.stringify(['Maid Service', 'Full-Time Maid', 'Baby Care']),
    experience: '5 yrs', expected_pay: '₹8,000/month',
    society: 'Krishna Society', city: 'Surat',
    full_address: 'Krishna Society, Adajan, Surat 395009',
    lat: 21.175, lng: 72.831,
    avail_days: JSON.stringify(['Mon','Tue','Wed','Thu','Fri','Sat']),
    avail_from: '07:00', avail_until: '18:00',
    about: 'Reliable maid with 5 years experience in housekeeping and baby care.',
    is_verified: 1, is_online: 1, avg_rating: 4.9, total_jobs: 210,
  },
  {
    full_name: 'Geeta Singh',
    phone: '+919876543212',
    email: 'geeta@example.com',
    age: 29, gender: 'Female',
    skills: JSON.stringify(['Pregnancy Care Helper', 'Elderly Care', 'Baby Care']),
    experience: '6 yrs', expected_pay: '₹10,000/month',
    society: 'Patel Colony', city: 'Surat',
    full_address: 'Patel Colony, Rander, Surat 395005',
    lat: 21.185, lng: 72.820,
    avail_days: JSON.stringify(['Mon','Tue','Wed','Thu','Fri','Sat','Sun']),
    avail_from: '06:00', avail_until: '20:00',
    about: 'Trained nurse aide specialising in pregnancy and elderly care.',
    is_verified: 1, is_online: 1, avg_rating: 4.9, total_jobs: 95,
  },
  {
    full_name: 'Kamla Ben',
    phone: '+919876543213',
    age: 45, gender: 'Female',
    skills: JSON.stringify(['Full-Time Maid', 'Maid Service', 'Cooking']),
    experience: '8 yrs', expected_pay: '₹9,000/month',
    society: 'Raj Nagar', city: 'Surat',
    full_address: 'Raj Nagar, Katargam, Surat 395004',
    lat: 21.180, lng: 72.838,
    avail_days: JSON.stringify(['Mon','Tue','Wed','Thu','Fri']),
    avail_from: '08:00', avail_until: '18:00',
    about: 'Experienced full-time maid and cook. Specialise in Gujarati cuisine.',
    is_verified: 1, is_online: 0, avg_rating: 4.8, total_jobs: 180,
  },
  {
    full_name: 'Radha Kumari',
    phone: '+919876543214',
    age: 27, gender: 'Female',
    skills: JSON.stringify(['Cleaning Service', 'Maid Service']),
    experience: '3 yrs', expected_pay: '₹6,000/month',
    society: 'Green Park', city: 'Surat',
    full_address: 'Green Park, Pal, Surat 395009',
    lat: 21.168, lng: 72.825,
    avail_days: JSON.stringify(['Tue','Wed','Thu','Fri','Sat']),
    avail_from: '09:00', avail_until: '17:00',
    about: 'Quick and thorough cleaner available for deep cleaning sessions.',
    is_verified: 1, is_online: 1, avg_rating: 4.7, total_jobs: 60,
  },
  {
    full_name: 'Mahesh Gohil',
    phone: '+919876543215',
    age: 34, gender: 'Male',
    skills: JSON.stringify(['Cook / Chef', 'Cooking']),
    experience: '7 yrs', expected_pay: '₹12,000/month',
    society: 'Shyam Nagar', city: 'Surat',
    full_address: 'Shyam Nagar, Bhatar, Surat 395017',
    lat: 21.165, lng: 72.850,
    avail_days: JSON.stringify(['Mon','Tue','Wed','Thu','Fri','Sat']),
    avail_from: '07:00', avail_until: '21:00',
    about: 'Professional chef specialised in Gujarati, Punjabi and South Indian cuisine.',
    is_verified: 1, is_online: 1, avg_rating: 4.8, total_jobs: 145,
  },
];

async function seed() {
  await initSchema();

  // Clear existing seed workers (by phone)
  for (const w of WORKERS) {
    await run('DELETE FROM workers WHERE phone = ?', [w.phone]).catch(() => {});
  }

  for (const w of WORKERS) {
    await run(
      `INSERT INTO workers
        (id, full_name, phone, email, age, gender, skills, experience, expected_pay,
         society, city, full_address, lat, lng, avail_days, avail_from, avail_until,
         about, is_verified, is_online, avg_rating, total_jobs)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), w.full_name, w.phone, w.email || null, w.age, w.gender,
       w.skills, w.experience, w.expected_pay,
       w.society, w.city, w.full_address, w.lat, w.lng,
       w.avail_days, w.avail_from, w.avail_until,
       w.about, w.is_verified, w.is_online, w.avg_rating, w.total_jobs]
    );
    console.log(`✅ Seeded worker: ${w.full_name}`);
  }

  console.log('\n🌱 Seed complete. Run: npm run dev');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
