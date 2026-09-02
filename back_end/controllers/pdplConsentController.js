const PdplConsent = require('../models/PdplConsent');

exports.createConsent = async (req, res) => {
  try {
    // 1. Extract ipAddress
    // Use x-forwarded-for first (if behind proxy), then fallback to native IPs
    const rawIp = req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
    const ipAddress = rawIp ? rawIp.split(',')[0].trim() : 'Unknown';

    // 2. Extract userAgent
    const userAgent = req.body.userAgent || req.headers['user-agent'] || 'Unknown';

    // 3. Extract policyVersion and consent
    const { policyVersion, consent } = req.body;

    // 4. Return 400 if policyVersion is missing
    if (!policyVersion) {
      return res.status(400).json({ error: 'policyVersion is required' });
    }

    // Default consent to true if undefined
    const consentGiven = consent !== undefined ? consent : true;

    // 5. Save the data to MongoDB
    const newConsent = new PdplConsent({
      ipAddress,
      userAgent,
      policyVersion,
      consentGiven
    });

    await newConsent.save();

    // 6. Return 201 status
    return res.status(201).json({ message: 'Consent saved successfully' });
  } catch (error) {
    console.error('Error saving PDPL consent:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
