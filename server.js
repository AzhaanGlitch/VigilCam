const express = require('express');
const session = require('express-session');
const passport = require('passport');
const flash = require('connect-flash');
const path = require('path');
require('dotenv').config();

// Import database configuration
const connectDB = require('./config/db');

// Import Passport configuration
require('./config/passport')(passport);

// Connect to MongoDB
connectDB();

// Initialize Express app
const app = express();

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parser middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static folder
app.use(express.static(path.join(__dirname, 'public')));

// Express session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'vigilcam_secret_key_change_in_production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
  })
);

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

// Set port
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`═══════════════════════════════════════════════`);
  console.log(`    VigilCam Server Running on Port ${PORT}`);
  console.log(`    Access at: http://localhost:${PORT}`);
  console.log(`═══════════════════════════════════════════════`);
});