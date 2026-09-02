const express = require('express');
const router = express.Router();
const pdplConsentController = require('../controllers/pdplConsentController');

router.post('/', pdplConsentController.createConsent);

module.exports = router;
