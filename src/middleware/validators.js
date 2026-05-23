// src/middleware/validators.js
const { body, validationResult } = require('express-validator');

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success: false, errors: errors.array() });
  }
  next();
}

const validateWorkerRegistration = [
  body('full_name').trim().notEmpty().withMessage('Full name is required.'),
  body('phone').trim().notEmpty().withMessage('Phone number is required.')
    .matches(/^[+]?[\d\s\-()]{7,15}$/).withMessage('Invalid phone number.'),
  body('skills').notEmpty().withMessage('At least one skill is required.'),
  handleValidation,
];

const validateBooking = [
  body('full_name').trim().notEmpty().withMessage('Customer name is required.'),
  body('phone').trim().notEmpty().withMessage('Customer phone is required.'),
  body('service_type').trim().notEmpty().withMessage('Service type is required.'),
  body('payment_method').notEmpty().withMessage('Payment method is required.'),
  handleValidation,
];

module.exports = { validateWorkerRegistration, validateBooking };
