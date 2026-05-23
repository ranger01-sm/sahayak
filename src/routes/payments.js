// src/routes/payments.js
const router = require('express').Router();
const ctrl   = require('../controllers/paymentController');

router.post('/create-order', ctrl.createOrder);
router.post('/verify',       ctrl.verifyPayment);
router.post('/webhook',      ctrl.webhook);       // raw body needed — handled in index.js

module.exports = router;
