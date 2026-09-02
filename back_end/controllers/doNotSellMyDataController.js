const DataSubjectRequest = require("../models/DataSubjectRequest");
const sendEmail = require("../utils/sendEmail");

exports.insert = async (req, res) => {
  try {
    const { country, requestType, firstName, lastName, email, jobTitle, companyName, mobile, linkedin } = req.body;

    const requiredFields = ['country', 'requestType', 'firstName', 'lastName', 'email', 'jobTitle', 'companyName', 'mobile', 'linkedin'];
    for (const field of requiredFields) {
      if (!req.body[field]) { 
        return res.status(400).json({ message: `Missing required field: ${field}` });
      }
    }

    const dataSubjectRequest = new DataSubjectRequest({ country, requestType, firstName, lastName, email, jobTitle, companyName, mobile, linkedin });
    await dataSubjectRequest.save();

    const emailData = {
      toUser: {
        to: email,
        subject: "Your Data Subject Request Has Been Received",
        html: `
          <p>Hi ${firstName},</p>
          <p>Thank you for submitting your data subject request. We will process it soon.</p>
              <p><strong>Details</strong></p>
              <p><strong>Country:</strong> ${country}</p>
              <p><strong>Request Type:</strong> ${requestType}</p>
              <p><strong>Job Title:</strong> ${jobTitle}</p>
              <p><strong>Company:</strong> ${companyName}</p>
              <p><strong>Mobile:</strong> ${mobile}</p>
              <p><strong>LinkedIn:</strong> ${linkedin}</p>
          
          <p>Best regards,<br>Mawsool Team</p>
        `,
      },
      toAdmin: {
        to: process.env.ADMIN_MAIL,
        subject: "New Data Subject Request Submitted",
        html: `
          <p>Hi Admin,</p>
          <p>A new data subject request has been submitted.</p>
          <p><strong>Details</strong></p>
              <p><strong>Name:</strong> ${firstName} ${lastName}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Country:</strong> ${country}</p>
              <p><strong>Request Type:</strong> ${requestType}</p>
              <p><strong>Job Title:</strong> ${jobTitle}</p>
              <p><strong>Company:</strong> ${companyName}</p>
              <p><strong>Mobile:</strong> ${mobile}</p>
              <p><strong>LinkedIn:</strong> ${linkedin}</p>

          <p>Please review and process accordingly.</p>
        `,
      },
    };

    try {
      await Promise.all([
        sendEmail(emailData.toUser),
        sendEmail(emailData.toAdmin),
      ]);
    } catch (emailError) {
      console.error("Failed to send data subject request emails:", emailError);
    }

    res.status(201).json({ msg: "Request submitted successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

exports.getAllRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const total = await DataSubjectRequest.countDocuments();
    const requests = await DataSubjectRequest.find()
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      requests,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalRequests: total
    });
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};