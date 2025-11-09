const express = require('express');
const router = express.Router();

// Health check endpoint for Render
router.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'VigilCam'
  });
});

// Home page
router.get('/', (req, res) => {
  res.render('home', {
    title: 'VigilCam - Always On Watch'
  });
});

// About Us page
router.get('/about', (req, res) => {
  res.render('about', {
    title: 'About Us - VigilCam'
  });
});

// Contact page (placeholder)
router.get('/contact', (req, res) => {
  res.render('contact', {
    title: 'Contact Us - VigilCam'
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