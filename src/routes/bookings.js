// src/routes/bookings.js
const router = require('express').Router();
const ctrl   = require('../controllers/bookingController');
const { validateBooking } = require('../middleware/validators');

router.post('/',                       validateBooking, ctrl.createBooking);
router.get('/',                        ctrl.listBookings);
router.get('/:id',                     ctrl.getBookingById);
router.post('/:id/confirm-payment',    ctrl.confirmPayment);
router.patch('/:id/status',            ctrl.updateBookingStatus);

module.exports = router;
