// src/routes/workers.js
const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const ctrl    = require('../controllers/workerController');
const { validateWorkerRegistration } = require('../middleware/validators');

// Multer config for Aadhaar + photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || './uploads'),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}_${uuidv4()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB || '5')) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  },
});

router.post('/register',
  upload.fields([{ name: 'aadhaar', maxCount: 1 }, { name: 'photo', maxCount: 1 }]),
  validateWorkerRegistration,
  ctrl.registerWorker
);
router.get('/',              ctrl.getNearbyWorkers);
router.get('/:id',           ctrl.getWorkerById);
router.patch('/:id/location', ctrl.updateWorkerLocation);
router.get('/:id/bookings',   ctrl.getWorkerBookings);

module.exports = router;
