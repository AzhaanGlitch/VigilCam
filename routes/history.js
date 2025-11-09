const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const path = require('path');
const fs = require('fs');

// Authentication middleware
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash('error_msg', 'Please log in to access history');
  res.redirect('/login');
}

// Get all reports for logged-in user
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const reports = await Report.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    
    res.render('history', {
      title: 'Report History - VigilCam',
      user: req.user,
      reports: reports
    });
  } catch (err) {
    console.error('Error fetching reports:', err);
    req.flash('error_msg', 'Error loading report history');
    res.redirect('/monitoring');
  }
});

// Download specific report
router.get('/download/:filename', ensureAuthenticated, async (req, res) => {
  try {
    const report = await Report.findOne({ 
      userId: req.user._id, 
      filename: req.params.filename 
    });
    
    if (!report) {
      req.flash('error_msg', 'Report not found');
      return res.redirect('/history');
    }
    
    const filepath = path.join(__dirname, '..', 'reports', req.params.filename);
    
    if (fs.existsSync(filepath)) {
      res.download(filepath);
    } else {
      // If file doesn't exist, create it from database record
      const reportData = {
        user_id: report.userId.toString(),
        timestamp: report.timestamp,
        date: report.date,
        duration_seconds: report.duration_seconds,
        total_violations: report.total_violations,
        risk_score: report.risk_score,
        total_blinks: report.total_blinks,
        excessive_blink_count: report.excessive_blink_count,
        gaze_away_count: report.gaze_away_count,
        no_face_count: report.no_face_count,
        multiple_faces_count: report.multiple_faces_count,
        talking_count: report.talking_count,
        eyes_closed_count: report.eyes_closed_count,
        violations: report.violations,
        filename: report.filename
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
      res.send(JSON.stringify(reportData, null, 2));
    }
  } catch (err) {
    console.error('Error downloading report:', err);
    req.flash('error_msg', 'Error downloading report');
    res.redirect('/history');
  }
});

// Get report details (for preview)
router.get('/view/:id', ensureAuthenticated, async (req, res) => {
  try {
    const report = await Report.findOne({ 
      _id: req.params.id,
      userId: req.user._id 
    });
    
    if (!report) {
      req.flash('error_msg', 'Report not found');
      return res.redirect('/history');
    }
    
    res.json(report);
  } catch (err) {
    console.error('Error fetching report:', err);
    res.status(500).json({ error: 'Error loading report' });
  }
});

// Delete report
router.delete('/delete/:id', ensureAuthenticated, async (req, res) => {
  try {
    const report = await Report.findOne({ 
      _id: req.params.id,
      userId: req.user._id 
    });
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    // Delete file if exists
    const filepath = path.join(__dirname, '..', 'reports', report.filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
    
    // Delete from database
    await Report.deleteOne({ _id: req.params.id });
    
    res.json({ success: true, message: 'Report deleted successfully' });
  } catch (err) {
    console.error('Error deleting report:', err);
    res.status(500).json({ error: 'Error deleting report' });
  }
});

module.exports = router;