const express = require('express');
const router = express.Router();

// Authentication middleware
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash('error_msg', 'Please log in to access monitoring');
  res.redirect('/login');
}

// Protected monitoring route
router.get('/', ensureAuthenticated, (req, res) => {
  res.render('monitoring', {
    title: 'Live Monitoring - VigilCam',
    user: req.user
  });
});

module.exports = router;