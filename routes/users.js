const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
const User = require('../models/User');

// Register POST handler
router.post('/register', async (req, res) => {
  const { name, email, password, password2 } = req.body;
  let errors = [];

  // Validation
  if (!name || !email || !password || !password2) {
    errors.push({ msg: 'Please fill in all fields' });
  }

  if (password !== password2) {
    errors.push({ msg: 'Passwords do not match' });
  }

  if (password && password.length < 6) {
    errors.push({ msg: 'Password must be at least 6 characters' });
  }

  if (errors.length > 0) {
    return res.render('register', {
      title: 'Register - VigilCam',
      errors,
      name,
      email
    });
  }

  try {
    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    
    if (existingUser) {
      errors.push({ msg: 'Email already registered' });
      return res.render('register', {
        title: 'Register - VigilCam',
        errors,
        name,
        email
      });
    }

    // Create new user
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password
    });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    newUser.password = await bcrypt.hash(password, salt);

    // Save user
    await newUser.save();
    
    req.flash('success_msg', 'Registration successful. You can now log in.');
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    errors.push({ msg: 'Server error occurred' });
    res.render('register', {
      title: 'Register - VigilCam',
      errors,
      name,
      email
    });
  }
});

// Login POST handler
router.post('/login', (req, res, next) => {
  passport.authenticate('local', {
    successRedirect: '/monitoring',
    failureRedirect: '/login',
    failureFlash: true
  })(req, res, next);
});

// Google OAuth Routes
// Initiate Google OAuth
router.get('/auth/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email'] 
  })
);

// Google OAuth callback
router.get('/auth/google/callback',
  passport.authenticate('google', { 
    failureRedirect: '/login',
    failureFlash: true 
  }),
  (req, res) => {
    // Successful authentication
    req.flash('success_msg', 'Successfully signed in with Google');
    res.redirect('/monitoring');
  }
);

// Logout handler
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.flash('success_msg', 'You have been logged out');
    res.redirect('/login');
  });
});

module.exports = router;