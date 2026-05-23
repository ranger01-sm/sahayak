// src/routes/reviews.js
const router = require('express').Router();
const ctrl   = require('../controllers/reviewController');

router.post('/',  ctrl.createReview);
router.get('/',   ctrl.getReviews);

module.exports = router;
