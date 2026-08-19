const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// Initiate a PayPhone checkout session (admin only)
router.post('/create-checkout', auth, roleCheck('admin'), paymentController.createCheckoutSession);

// Confirm a PayPhone payment after redirect (admin only)
router.post('/confirm', auth, roleCheck('admin'), paymentController.confirmPayment);

// PayPhone asynchronous webhook callback (no auth, validated internally)
router.post('/webhook', paymentController.webhook);

module.exports = router;
