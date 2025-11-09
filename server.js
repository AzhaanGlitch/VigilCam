const express = require('express');
const session = require('express-session');
const passport = require('passport');
const flash = require('connect-flash');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');
require('dotenv').config();

// Import database configuration
const connectDB = require('./config/db');
const Report = require('./models/Report');

// Import Passport configuration
require('./config/passport')(passport);

// Connect to MongoDB
connectDB();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Make io accessible to routes
app.set('io', io);

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parser middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10mb' })); // Increased for base64 images

// Static folder
app.use(express.static(path.join(__dirname, 'public')));

// Express session middleware
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'vigilcam_secret_key_change_in_production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax'
  }
});

app.use(sessionMiddleware);

// Share session with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Connect flash middleware
app.use(flash());

// Global variables for flash messages
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.user = req.user || null;
  next();
});

// Routes
app.use('/', require('./routes/index'));
app.use('/users', require('./routes/users'));
app.use('/monitoring', require('./routes/monitoring'));
app.use('/history', require('./routes/history'));

// Socket.IO connection handling (CLIENT-SIDE ML VERSION)
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Client starts monitoring (no Python needed)
  socket.on('start-monitoring', (data) => {
    console.log('Monitoring started for user:', data.userId);
    socket.emit('monitoring-started', { 
      status: 'success',
      message: 'Monitoring session initiated'
    });
  });

  // Receive violation from client
  socket.on('violation', async (data) => {
    console.log('Violation received:', data.violation.type);
    
    // Broadcast to monitoring interfaces (if needed for admin dashboard)
    io.emit('violation-alert', {
      userId: data.userId,
      violation: data.violation,
      socketId: socket.id
    });
  });

  // Save report to database
  socket.on('save-report', async (reportData) => {
    console.log('Saving report for user:', reportData.userId);
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `exam_report_${reportData.userId}_${timestamp}.json`;
      
      const newReport = new Report({
        userId: reportData.userId,
        filename: filename,
        timestamp: reportData.timestamp,
        date: reportData.date,
        duration_seconds: reportData.duration_seconds,
        total_violations: reportData.total_violations,
        risk_score: reportData.risk_score,
        total_blinks: reportData.total_blinks,
        excessive_blink_count: reportData.excessive_blink_count || 0,
        gaze_away_count: reportData.gaze_away_count || 0,
        no_face_count: reportData.no_face_count || 0,
        multiple_faces_count: reportData.multiple_faces_count || 0,
        talking_count: reportData.talking_count || 0,
        eyes_closed_count: reportData.eyes_closed_count || 0,
        violations: reportData.violations || []
      });
      
      await newReport.save();
      console.log('Report saved successfully:', newReport._id);
      
      socket.emit('report-saved', { 
        success: true,
        reportId: newReport._id,
        filename: filename,
        message: 'Report saved to database'
      });
      
    } catch (err) {
      console.error('Error saving report:', err);
      socket.emit('report-saved', { 
        success: false,
        error: err.message,
        message: 'Failed to save report'
      });
    }
  });

  // Stop monitoring
  socket.on('stop-monitoring', () => {
    console.log('Monitoring stopped for:', socket.id);
    socket.emit('monitoring-stopped', {
      status: 'success',
      message: 'Monitoring session ended'
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', {
    title: '404 - Page Not Found'
  });
});

// Set port and host
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`═══════════════════════════════════════════════`);
  console.log(`    VigilCam Server (Client-Side ML Version)`);
  console.log(`    Running on Port ${PORT}`);
  console.log(`    Host: ${HOST}`);
  console.log(`    Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`    WebSocket Server: Active`);
  console.log(`    ML Processing: Browser-Based ✅`);
  console.log(`    Python Required: NO ✅`);
  console.log(`═══════════════════════════════════════════════`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});