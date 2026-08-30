const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const roomRoutes = require('./routes/rooms');
const reminderRoutes = require('./routes/reminders');
const wishlistRoutes = require('./routes/wishlist');   // ✅ ADDED

// ✅ NEW: Room-scoped routes
const roomTransactionsRoutes = require('./routes/roomTransactions');
const roomBudgetsRoutes = require('./routes/roomBudgets');
const roomWishlistRoutes = require('./routes/roomWishlist');

// Import database connection
const connectDB = require('./config/database');

// Import User model (needed for password reset)
const User = require('./models/User');

const app = express();
const server = http.createServer(app);

// Enhanced CORS configuration
const corsOptions = {
  origin: ["http://localhost:3000", "http://localhost:3001", "http://localhost:3000/"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/reminders', reminderRoutes);

// Enhanced Socket.IO configuration
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001", "http://localhost:3000/"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  path: '/socket.io/',
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true
});

// Make io accessible to routes
app.set('io', io);

// Add connection logging middleware
io.use((socket, next) => {
  const origin = socket.handshake.headers.origin || socket.handshake.headers.referer;
  console.log(`🔗 Connection attempt from: ${origin}`);
  next();
});

// Simple route to test
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Centsible Backend API is running!',
    version: '2.0.0',
    database: 'MongoDB Connected',
    endpoints: [
      'POST /api/auth/register - Register user',
      'POST /api/auth/login - Login user',
      'POST /api/auth/forgot-password - Request password reset',
      'POST /api/auth/reset-password - Reset password with token',
      'GET /api/auth/me - Get current user',
      'PUT /api/auth/update - Update user profile',
      'GET /api/transactions - Get all transactions',
      'POST /api/transactions - Create transaction',
      'PUT /api/transactions/:id - Update transaction',
      'DELETE /api/transactions/:id - Delete transaction',
      'GET /api/transactions/summary/stats - Get statistics',
      'POST /api/rooms/create - Create a shared room',
      'POST /api/rooms/join - Join a room',
      'GET /api/rooms/:roomCode - Get room details',
      'POST /api/rooms/:roomCode/expenses - Add expense',
      'POST /api/rooms/:roomCode/settle - Settle balance',
      'GET /api/rooms/user/my-rooms - Get user rooms'
    ],
    socketIo: {
      enabled: true,
      path: '/socket.io/',
      transports: ['websocket', 'polling']
    }
  });
});

// Enhanced Socket.IO connection with better error handling
io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id} from ${socket.handshake.address}`);
  
  socket.on('join-room', (roomCode) => {
    if (roomCode) {
      socket.join(roomCode);
      console.log(`🏠 Socket ${socket.id} joined room ${roomCode}`);
      socket.emit('room-joined', { roomCode, success: true });
    }
  });
  
  socket.on('update-room', (roomCode, data) => {
    socket.to(roomCode).emit('room-updated', data);
    console.log(`🔄 Room ${roomCode} updated by ${socket.id}`);
  });

  // 🆕 Optional: Real‑time events for specific room actions
  socket.on('room-transaction-added', (roomCode, transaction) => {
    socket.to(roomCode).emit('room-transaction-added', transaction);
  });

  socket.on('room-transaction-updated', (roomCode, transaction) => {
    socket.to(roomCode).emit('room-transaction-updated', transaction);
  });

  socket.on('room-transaction-deleted', (roomCode, transactionId) => {
    socket.to(roomCode).emit('room-transaction-deleted', transactionId);
  });

  socket.on('room-budget-updated', (roomCode, budgets) => {
    socket.to(roomCode).emit('room-budget-updated', budgets);
  });

  socket.on('room-wishlist-updated', (roomCode, wishlistItem) => {
    socket.to(roomCode).emit('room-wishlist-updated', wishlistItem);
  });
  
  socket.on('disconnect', (reason) => {
    console.log(`❌ Client disconnected: ${socket.id}, Reason: ${reason}`);
  });
  
  socket.on('error', (error) => {
    console.error(`🔥 Socket error for ${socket.id}:`, error);
  });
  
  socket.emit('welcome', { 
    message: 'Connected to backend server!',
    socketId: socket.id,
    timestamp: new Date().toISOString()
  });
  
  const pingInterval = setInterval(() => {
    if (socket.connected) {
      socket.emit('ping', { timestamp: Date.now() });
    } else {
      clearInterval(pingInterval);
    }
  }, 25000);
  
  socket.on('pong', (data) => {
    console.log(`📡 Ping-pong with ${socket.id}: ${Date.now() - data.timestamp}ms`);
  });
});

// ============================================
// ✅ FORGOT PASSWORD ENDPOINT (FIXED)
// ============================================
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    
    // ✅ FIXED: Added .select() to get reset fields
    const user = await User.findOne({ email }).select('+resetPasswordToken +resetPasswordExpires');
    
    if (!user) {
      return res.json({ success: true, message: 'If email exists, reset link sent' });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = Date.now() + 3600000; // 1 hour from now
    
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetExpiry;
    await user.save();
    
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    // Log the link for development
    console.log(`\n🔐 PASSWORD RESET LINK FOR ${email}:`);
    console.log(`${resetLink}\n`);
    
    // Try to send email if configured
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: process.env.SMTP_PORT || 587,
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
        
        await transporter.sendMail({
          from: '"Centsible App" <noreply@centsible.com>',
          to: email,
          subject: 'Reset Your Centsible Password',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
              <h2>Password Reset Request</h2>
              <p>You requested to reset your password for your Centsible account.</p>
              <p>Click the link below to set a new password. This link expires in 1 hour.</p>
              <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
              <p>If you didn't request this, please ignore this email.</p>
              <hr />
              <p style="color: #666; font-size: 12px;">Centsible - Smart Personal Finance</p>
            </div>
          `,
        });
        console.log(`📧 Reset email sent to ${email}`);
      } catch (emailError) {
        console.error('Email sending failed:', emailError.message);
      }
    } else {
      console.log('📧 Email not configured. Check server console for reset link.');
    }
    
    res.json({ success: true, message: 'Reset link sent to email' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================
// ✅ RESET PASSWORD ENDPOINT (FIXED)
// ============================================
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, error: 'Token and new password required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }
    
    // ✅ FIXED: Added .select() to get reset fields
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    }).select('+resetPasswordToken +resetPasswordExpires');
    
    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }
    
    // Hash new password
    const bcrypt = require('bcryptjs');
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    
    console.log(`✅ Password reset successful for user: ${user.email}`);
    
    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================
// API ROUTES (including wishlist)
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/wishlist', wishlistRoutes);        // ✅ ADDED

// ✅ NEW: Room-scoped routes (nested under a specific roomCode)
app.use('/api/rooms/:roomCode/transactions', roomTransactionsRoutes);
app.use('/api/rooms/:roomCode/budgets', roomBudgetsRoutes);
app.use('/api/rooms/:roomCode/wishlist', roomWishlistRoutes);

// Test endpoint for frontend
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'Backend is working with MongoDB!',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy';
  
  res.json({
    status: 'healthy',
    database: dbStatus,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount
  });
});

// Socket.IO specific health check
app.get('/api/socket-health', (req, res) => {
  res.json({
    socketIo: {
      enabled: true,
      version: require('socket.io/package.json').version,
      clientsCount: io.engine.clientsCount,
      transports: io.opts.transports,
      pingTimeout: io.opts.pingTimeout,
      pingInterval: io.opts.pingInterval
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(500).json({
    success: false,
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Start server ONLY after database is connected
const startServer = async () => {
  try {
    await connectDB();
    
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`\n🚀 Backend server running on port ${PORT}`);
      console.log(`📡 API available at http://localhost:${PORT}`);
      console.log(`🔌 Socket.io ready with WebSocket support`);
      console.log(`💾 MongoDB status: Connected ✅`);
      console.log(`\n📋 API Endpoints ready at /api/*`);
      console.log(`\n🔐 Auth Endpoints:`);
      console.log(`   - POST /api/auth/register`);
      console.log(`   - POST /api/auth/login`);
      console.log(`   - POST /api/auth/forgot-password (✅ FIXED)`);
      console.log(`   - POST /api/auth/reset-password (✅ FIXED)`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();