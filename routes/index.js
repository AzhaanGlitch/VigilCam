const express = require('express');
const router = express.Router();

// Home page
router.get('/', (req, res) => {
  res.render('home', {
    title: 'VigilCam - Always On Watch'
  });
});

// Login page
router.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/monitoring');
  }
  res.render('login', {
    title: 'Login - VigilCam'
  });
});

// Register page
router.get('/register', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/monitoring');
  }
  res.render('register', {
    title: 'Register - VigilCam'
  });
});

module.exports = router;