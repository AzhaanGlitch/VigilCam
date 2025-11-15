# VigilCam - AI-Powered Exam Proctoring System

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-4.4+-47A248?style=flat-square&logo=mongodb)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-ISC-blue?style=flat-square)](LICENSE)

VigilCam is a professional-grade, AI-powered exam proctoring system that provides real-time monitoring with intelligent behavioral detection. The system utilizes browser-based machine learning for enhanced privacy and performance.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Detection Capabilities](#detection-capabilities)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)
- [Author](#author)

## Overview

VigilCam addresses the growing need for secure remote examination environments by combining advanced computer vision technology with real-time web communication. The system processes video feeds directly in the browser using MediaPipe Face Mesh, eliminating the need for server-side video processing and enhancing user privacy.

## Features

### AI Detection Capabilities

- **Face Detection & Tracking**: Multi-face detection using MediaPipe with 468 facial landmarks
- **Gaze Tracking**: Real-time iris position monitoring with calibration system
- **Blink Detection**: Eye Aspect Ratio (EAR) calculation for accurate blink analysis
- **Head Pose Estimation**: Orientation tracking through nose landmark analysis
- **Behavioral Analysis**: Comprehensive violation detection with severity classification
- **Risk Scoring**: Real-time risk assessment based on behavioral patterns

### System Features

- **Browser-Based ML Processing**: Client-side processing for enhanced privacy
- **Real-Time Monitoring**: WebSocket-based low-latency communication
- **Automatic Calibration**: 3-second baseline calibration for accurate detection
- **Session Recording**: Complete violation history with timestamp logging
- **Comprehensive Reporting**: Downloadable JSON reports with detailed analytics
- **Secure Authentication**: Passport.js with local and Google OAuth strategies
- **User Dashboard**: Historical report viewing and management

## Architecture

```
┌─────────────────┐      WebSocket       ┌──────────────────┐
│   Web Browser   │ ◄─────────────────►  │   Express.js     │
│   (MediaPipe)   │                      │   + Socket.IO    │
└─────────────────┘                      └──────────────────┘
                                                  │
                                                  │
                                                  ▼
                                         ┌──────────────────┐
                                         │   MongoDB        │
                                         │   (User Data &   │
                                         │    Reports)      │
                                         └──────────────────┘
```

## Prerequisites

Before installation, ensure you have the following:

- **Node.js** v18.0.0 or higher
- **npm** v9.0.0 or higher
- **MongoDB** v4.4 or higher
- **Modern Web Browser** (Chrome, Firefox, Edge, or Safari)
- **Webcam** for monitoring functionality

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/AzhaanGlitch/VigilCam.git
cd VigilCam
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up MongoDB

**Local MongoDB:**
```bash
# Windows
net start MongoDB

# macOS
brew services start mongodb-community

# Linux
sudo systemctl start mongod
```

**MongoDB Atlas (Cloud):**
1. Create account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a cluster and obtain connection string
3. Update `.env` file with your connection string

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017/vigilcam

# Session Secret (Generate a strong random string)
SESSION_SECRET=your_secure_random_string_here

# Server Configuration
PORT=3000
NODE_ENV=development

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### 5. Start the Application

**Development Mode:**
```bash
npm run dev
```

**Production Mode:**
```bash
npm start
```

### 6. Access the Application

Navigate to: `http://localhost:3000`

## Configuration

### Detection Thresholds

The system uses configurable thresholds in `public/js/ml-detector.js`:

```javascript
THRESHOLDS = {
  EAR_BLINK: 0.21,              // Eye aspect ratio for blink detection
  EYES_CLOSED_TIME: 4000,       // Maximum eyes closed duration (ms)
  GAZE_AWAY_TIME: 4000,         // Maximum gaze away duration (ms)
  NO_FACE_TIME: 6000,           // Maximum time without face (ms)
  GAZE_X_DELTA: 0.07,           // Horizontal gaze tolerance
  GAZE_Y_DELTA: 0.06,           // Vertical gaze tolerance
  EXCESSIVE_BLINKS: 40,         // Blinks per minute threshold
  HEAD_TURN_THRESHOLD: 0.22     // Head turn detection threshold
}
```

## Usage

### For Candidates

1. **Registration**: Create an account using email/password or Google OAuth
2. **Login**: Sign in with your credentials
3. **Start Monitoring**: 
   - Click "START MONITORING"
   - Grant camera permissions
   - Complete 3-second calibration by looking straight at camera
4. **During Session**:
   - Maintain clear face visibility
   - Keep head and gaze centered
   - Avoid excessive movement
5. **Complete Session**: Click "STOP MONITORING" to generate report

### For Administrators

1. **Monitor Dashboard**: View real-time detection statistics
2. **Violation Log**: Track all infractions with timestamps and severity
3. **Risk Assessment**: Monitor progressive risk score
4. **Report Generation**: Download comprehensive JSON reports
5. **History Management**: Access and review past session reports

## Detection Capabilities

| Detection Type | Description | Severity | Action |
|---------------|-------------|----------|---------|
| Multiple Faces | More than one person detected | HIGH | Immediate alert |
| No Face | Candidate left frame | HIGH | Timeout warning |
| Gaze Away | Looking away >4 seconds | MEDIUM | Direction logged |
| Eyes Closed | Eyes closed >4 seconds | MEDIUM | Duration recorded |
| Excessive Blinking | >40 blinks per minute | MEDIUM | Pattern flagged |
| Head Turned | Significant head rotation | MEDIUM | Orientation logged |
| Talking Detected | Mouth movement patterns | HIGH | Incident recorded |

### Risk Score System

- **LOW RISK (0-24)**: Minimal suspicious activity
- **MODERATE RISK (25-49)**: Some concerns detected
- **HIGH RISK (50+)**: Significant violations detected

**Scoring Algorithm:**
- HIGH severity: +10 points
- MEDIUM severity: +5 points
- LOW severity: +2 points

## Technology Stack

### Frontend
- Vanilla JavaScript
- MediaPipe Face Mesh (v0.4)
- Socket.IO Client
- EJS Templating
- Custom CSS

### Backend
- Node.js + Express.js
- Socket.IO Server
- Passport.js (Authentication)
- bcrypt (Password Hashing)
- Express Sessions

### Database
- MongoDB (Primary Database)
- Mongoose ORM

### Computer Vision
- MediaPipe Face Mesh (468 landmarks)
- Browser-based Processing
- Real-time Frame Analysis

## Project Structure

```
VigilCam/
├── config/
│   ├── db.js                    # MongoDB connection
│   └── passport.js              # Authentication strategies
├── models/
│   ├── User.js                  # User schema
│   └── Report.js                # Report schema
├── routes/
│   ├── index.js                 # Public routes
│   ├── users.js                 # Authentication routes
│   ├── monitoring.js            # Monitoring routes
│   └── history.js               # Report history routes
├── public/
│   ├── css/
│   │   └── style.css            # Application styling
│   └── js/
│       ├── main.js              # Client utilities
│       └── ml-detector.js       # ML detection engine
├── views/
│   ├── partials/
│   │   ├── navbar.ejs
│   │   ├── footer.ejs
│   │   └── messages.ejs
│   ├── home.ejs                 # Landing page
│   ├── login.ejs                # Login page
│   ├── register.ejs             # Registration page
│   ├── monitoring.ejs           # Live monitoring interface
│   ├── history.ejs              # Report history
│   └── about.ejs                # About page
├── reports/                     # Generated reports directory
├── server.js                    # Express server
├── package.json                 # Dependencies
├── .env                         # Environment variables
└── README.md                    # Documentation
```

## Security Considerations

### Production Deployment

1. **Environment Variables**: Never commit `.env` file to version control
2. **Session Secret**: Generate cryptographically secure random string
3. **MongoDB Authentication**: Enable authentication in production
4. **HTTPS**: Use SSL/TLS certificates for encrypted communication
5. **Secure Cookies**: Configure cookie security settings
6. **Rate Limiting**: Implement request rate limiting
7. **Input Validation**: Sanitize all user inputs
8. **Content Security Policy**: Configure CSP headers

### Example Production Configuration

```javascript
// session configuration
session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000
  }
})
```

## Troubleshooting

### Camera Access Issues

**Problem**: "Cannot open camera" error

**Solutions**:
- Grant camera permissions in browser settings
- Close other applications using the camera
- Try different USB port (external cameras)
- Restart browser and try again

### MongoDB Connection Failed

**Problem**: Cannot connect to database

**Solutions**:
- Verify MongoDB service is running
- Check connection string in `.env`
- Ensure network connectivity
- Verify MongoDB port availability (default: 27017)

### MediaPipe Loading Error

**Problem**: Face detection not working

**Solutions**:
- Check browser console for errors
- Verify MediaPipe CDN scripts are loaded
- Clear browser cache
- Use supported browser (Chrome, Firefox, Edge)

### Socket Connection Failed

**Problem**: Real-time updates not working

**Solutions**:
- Verify server is running on correct port
- Check firewall settings
- Ensure Socket.IO client version matches server
- Clear browser cache and cookies

## Contributing

Contributions are welcome. Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/enhancement`)
3. Commit your changes (`git commit -m 'Add enhancement'`)
4. Push to the branch (`git push origin feature/enhancement`)
5. Open a Pull Request

### Development Guidelines

- Follow existing code style and conventions
- Add comments for complex logic
- Update documentation for new features
- Test thoroughly before submitting PR
- Include descriptive commit messages

## License

This project is licensed under the ISC License. See [LICENSE](LICENSE) file for details.

## Author

**Azhaan Ali Siddiqui**

- GitHub: [@AzhaanGlitch](https://github.com/AzhaanGlitch)
- LinkedIn: [Azhaan Ali Siddiqui](https://www.linkedin.com/in/azhaanalisiddiqui/)
- Email: azhaanalisiddiqui15@gmail.com

## Acknowledgments

- [MediaPipe](https://google.github.io/mediapipe/) - Face mesh detection
- [Express.js](https://expressjs.com/) - Web framework
- [Socket.IO](https://socket.io/) - Real-time communication
- [MongoDB](https://www.mongodb.com/) - Database platform
- [Passport.js](http://www.passportjs.org/) - Authentication

## Future Enhancements

- Screen recording capability
- Multi-camera support
- Advanced analytics dashboard
- Mobile application development
- LMS integration (Moodle, Canvas)
- Automated testing suite
- Docker containerization
- Cloud deployment guides
- Multi-language support

---

<div align="center">

**If you find this project useful, please consider giving it a star ⭐**

</div>