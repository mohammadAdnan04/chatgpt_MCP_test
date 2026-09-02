const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const { validateBusinessEmail } = require('../utils/emailValidator');

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])[A-Za-z\d\W_]{10,}$/;

exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) return res.status(401).json({ msg: "Unauthorized" });

    const user = await User.findById(userId).select("name email avatar isVerified pendingEmail googleId microsoftId password");

    if (!user) return res.status(404).json({ msg: "User not found" });

    // Determine if user is social login
    const isSocialLogin = !!(user.googleId || user.microsoftId);
    // Check if user has a password set
    const hasPassword = !!user.password;

    res.status(200).json({ 
      profile: {
        ...user.toObject(),
        isSocialLogin,
        hasPassword, // Add hasPassword to the response
      }
    });
  } catch (err) {
    console.error("Error in getProfile:", err);
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  const userId = req.user.id;
  const { name, email, currentPassword, newPassword, confirmPassword } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Update name
    if (name && name.trim() !== user.name) {
      user.name = name.trim();
    }

    // Handle password update
    if (newPassword) {
      // Validate newPassword with regex
      if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({
          msg: "Password must be at least 10 characters with a special character, uppercase, lowercase, and a number.",
        });
      }

      // Validate newPassword and confirmPassword match
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ msg: "New passwords do not match" });
      }

      // Check if user is social login
      const isSocialLogin = !!(user.googleId || user.microsoftId);

      if (!isSocialLogin) {
        // For email/password users, validate currentPassword
        if (!currentPassword) {
          return res.status(400).json({ msg: "Current password is required" });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
          return res.status(400).json({ msg: "Current password is incorrect" });
        }
      }

      // Update password
      const hash = await bcrypt.hash(newPassword, 10);
      user.password = hash;
      
      // If user is a social login user, remove googleId and microsoftId
      if (isSocialLogin) {
        user.isVerified = true;
        user.googleId = undefined;
        user.microsoftId = undefined;
      }
    }

    // Handle email change
      if (email && email.trim() !== user.email) {
        // 1. Unified Validation (blocks personal/disposable domains)
        const validation = await validateBusinessEmail(email.trim());
        if (!validation.isValid) {
          return res.status(400).json({ msg: validation.msg });
        }

        // Check if email is already in use
      const exists = await User.findOne({ email: email.trim() });
      if (exists && exists._id.toString() !== userId) {
        return res.status(400).json({ msg: "Email already in use" });
      }

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString("hex");
      const verificationTokenExpires = Date.now() + 3600000; // 1 hour

      // Save pending email and token to user
      user.pendingEmail = email.trim();
      user.verificationToken = verificationToken;
      user.verificationTokenExpires = verificationTokenExpires;

      // Send verification email to NEW email
      const verificationUrl = `${process.env.FRONTEND_URL}/email-changed?token=${verificationToken}`;
      
      try {
        await sendEmail({
          to: email.trim(),
          subject: "Email Changed",
          html: `
            <p>Hi ${name || user.name},</p>
            <p>You are changing your email address. Please click the link below to verify your new email:</p>
            <a href="${verificationUrl}" class="button">Verify Email</a>
            <p>This link will expire in 1 hour.</p>
            <p>If you did not request this change, please ignore this email.</p>
          `,
        });
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError);
        return res.status(500).json({ msg: "Failed to send verification email", error: emailError.message });
      }

      // Save the other updates (name, password) but not email yet
      await user.save();

      return res.status(200).json({ msg: "Verification email sent. Please check your new email inbox." });
    }

    // No email change, update directly
    await user.save();
    res.status(200).json({ msg: "Profile updated successfully" });
  } catch (err) {
    console.error("Error in updateProfile:", err);
    res.status(500).json({ msg: "Error updating profile", error: err.message });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ msg: "No token provided" });
    }

    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ msg: "Invalid or expired token" });
    }

    // Update email to pending email and clear tokens
    user.email = user.pendingEmail;
    user.isVerified = true;
    user.pendingEmail = undefined;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;

    await user.save();

    res.status(200).json({ msg: "Email verified successfully" });
  } catch (err) {
    console.error("Error in verifyEmail:", err);
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};