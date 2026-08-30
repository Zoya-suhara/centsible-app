// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { validateRegister, validateLogin } = require('../middleware/validation');

// Import password reset functions from middleware/auth.js
const { forgotPassword, resetPassword, updatePassword } = require('../middleware/auth');

// Generate JWT Token (Access Token)
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'secret', {
    expiresIn: '30d'
  });
};

// Generate Refresh Token
const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET || 'refresh_secret', {
    expiresIn: '7d'
  });
};

// @route   POST /api/auth/register
// @desc    Register user
// @access  Public
router.post('/register', validateRegister, async (req, res) => {
  try {
    const { name, email, password, currency, userType } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email'
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      currency: currency || 'AED',
      userType: userType || 'professional'
      // other fields will use schema defaults
    });

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.status(201).json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        currency: user.currency,
        userType: user.userType,
        monthlyIncome: user.monthlyIncome,
        savingsGoal: user.savingsGoal,
        weeklyBudget: user.weeklyBudget,
        theme: user.theme,
        notifications: user.notifications,
        emailDigest: user.emailDigest,
        language: user.language,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for user
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.status(200).json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        currency: user.currency,
        userType: user.userType,
        monthlyIncome: user.monthlyIncome,
        savingsGoal: user.savingsGoal,
        weeklyBudget: user.weeklyBudget,
        theme: user.theme,
        notifications: user.notifications,
        emailDigest: user.emailDigest,
        language: user.language,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// @route   POST /api/auth/refresh-token
// @desc    Refresh access token using refresh token
// @access  Public
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      error: 'Refresh token required'
    });
  }
  
  try {
    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || 'refresh_secret'
    );
    
    // Find user by id
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token - User not found'
      });
    }
    
    // Generate new tokens
    const newToken = generateToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);
    
    res.status(200).json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    
    // Handle specific JWT errors
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token format'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Refresh token expired - Please login again'
      });
    }
    
    res.status(401).json({
      success: false,
      error: 'Invalid refresh token'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client should clear tokens)
// @access  Private
router.post('/logout', protect, async (req, res) => {
  try {
    // Optional: Add token to blacklist if you have a Redis store
    // For now, client will clear tokens from localStorage
    
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current logged in user
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        currency: user.currency,
        userType: user.userType,
        monthlyIncome: user.monthlyIncome,
        savingsGoal: user.savingsGoal,
        weeklyBudget: user.weeklyBudget,
        theme: user.theme,
        notifications: user.notifications,
        emailDigest: user.emailDigest,
        language: user.language,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// @route   PUT /api/auth/update
// @desc    Update user profile
// @access  Private
router.put('/update', protect, async (req, res) => {
  try {
    const { 
      name, 
      currency, 
      userType, 
      monthlyIncome, 
      savingsGoal,
      weeklyBudget,
      theme,
      notifications,
      emailDigest,
      language
    } = req.body;
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Update only provided fields
    if (name !== undefined) user.name = name;
    if (currency !== undefined) user.currency = currency;
    if (userType !== undefined) user.userType = userType;
    if (monthlyIncome !== undefined) user.monthlyIncome = monthlyIncome;
    if (savingsGoal !== undefined) user.savingsGoal = savingsGoal;
    if (weeklyBudget !== undefined) user.weeklyBudget = weeklyBudget;
    if (theme !== undefined) user.theme = theme;
    if (notifications !== undefined) user.notifications = notifications;
    if (emailDigest !== undefined) user.emailDigest = emailDigest;
    if (language !== undefined) user.language = language;
    
    await user.save();
    
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        currency: user.currency,
        userType: user.userType,
        monthlyIncome: user.monthlyIncome,
        savingsGoal: user.savingsGoal,
        weeklyBudget: user.weeklyBudget,
        theme: user.theme,
        notifications: user.notifications,
        emailDigest: user.emailDigest,
        language: user.language,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// ========== PASSWORD RESET ROUTES ==========

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', forgotPassword);

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', resetPassword);

// @route   PUT /api/auth/update-password
// @desc    Update password (authenticated users)
// @access  Private
router.put('/update-password', protect, updatePassword);

module.exports = router;