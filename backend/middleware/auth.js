const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');

// Import email service (create this file)
const sendResetEmail = require('../services/emailService');

// ========== ORIGINAL FUNCTIONS (KEPT INTACT) ==========

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');

      // Get user from token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ success: false, error: 'User not found' });
      }

      next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ success: false, error: 'Not authorized' });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorized, no token' });
  }
};

// Grant access to specific roles (ORIGINAL - KEPT)
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.userType)) {
      return res.status(403).json({
        success: false,
        error: `User role ${req.user.userType} is not authorized to access this route`
      });
    }
    next();
  };
};

// ========== NEW FUNCTIONS (ADDED) ==========

// Forgot password - send reset email
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    
    const user = await User.findOne({ email });
    if (!user) {
      // For security, don't reveal that email doesn't exist
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent' });
    }
    
    // ✅ CHANGED THIS PART - using model method instead of manual crypto
    const resetToken = user.generateResetToken();  // ← THIS REPLACES 3 LINES
    await user.save();
    
    // Create reset link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
    
    // Send email
    await sendResetEmail(email, resetLink, user.name);
    
    res.json({ success: true, message: 'Password reset link sent to your email' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, error: 'Server error. Please try again later.' });
  }
};

// Reset password
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, error: 'Token and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }
    
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }
    
    // Hash new password and save
    user.password = await bcrypt.hash(newPassword, 10);
    // ✅ CHANGED THIS PART - using model method
    user.clearResetToken();  // ← THIS REPLACES 2 LINES
    await user.save();
    
    res.json({ success: true, message: 'Password reset successful. Please login with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, error: 'Server error. Please try again later.' });
  }
};

// Update password (for authenticated users)
const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
    }
    
    const user = await User.findById(userId);
    
    // Check current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }
    
    // Hash new password
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ========== EXPORT ALL FUNCTIONS (ORIGINAL + NEW) ==========
module.exports = { 
  protect,     // ORIGINAL
  authorize,   // ORIGINAL
  forgotPassword,  // NEW (UPDATED to use model method)
  resetPassword,    // NEW (UPDATED to use model method)
  updatePassword    // NEW
};