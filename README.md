# VigilCam - AI-Powered Exam Proctoring System

![VigilCam Banner](https://img.shields.io/badge/VigilCam-v2.0-00ffff?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js)
![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=for-the-badge&logo=python)
![MongoDB](https://img.shields.io/badge/MongoDB-4.4+-47A248?style=for-the-badge&logo=mongodb)

**VigilCam** is a professional-grade, AI-powered exam proctoring and surveillance system that provides real-time monitoring with intelligent threat detection. Built with cutting-edge computer vision and machine learning technologies.

## Key Features

### AI Detection Capabilities
- **Face Detection & Tracking** - Multi-face detection with real-time alerts
- **Gaze Tracking** - Monitor where the candidate is looking
- **Blink Detection** - Track normal and excessive blinking patterns
- **Audio Monitoring** - Detect talking and unusual noise levels
- **Head Pose Estimation** - Identify head turns and unusual movements
- **Behavioral Analysis** - Comprehensive violation detection and scoring

### Live Streaming
- Real-time camera feed directly in the web browser
- WebSocket-based low-latency video streaming
- 30 FPS processing with optimized performance
- Automatic calibration for accurate detection

### Comprehensive Reporting
- Real-time violation logging with timestamps
- Risk score calculation with visual indicators
- Detailed JSON reports with complete session data
- Downloadable reports for record-keeping

### Secure Authentication
- User registration and login system
- Password hashing with bcrypt
- Session management with Express sessions
- Protected routes for monitoring access

## Architecture

```
┌─────────────────┐      WebSocket       ┌──────────────────┐
│   Web Browser   │ ◄─────────────────►  │   Express.js     │
│   (React/JS)    │                      │   + Socket.IO    │
└─────────────────┘                      └──────────────────┘
                                                  │
                                                  │ Python Shell
                                                  ▼
                                         ┌──────────────────┐
                                         │  Python ML       │
                                         │  OpenCV          │
                                         │  MediaPipe       │
                                         └──────────────────┘
                                                  │
                                                  │
                                                  ▼
                                         ┌──────────────────┐
                                         │   MongoDB        │
                                         │   (User Data)    │
                                         └──────────────────┘
```

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18.0.0 or higher)
- **Python** (v3.8 or higher)
- **MongoDB** (v4.4 or higher)
- **Webcam** (for monitoring features)
- **Git** (for cloning the repository)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/vigilcam.git
cd vigilcam
```

### 2. Install Node.js Dependencies

```bash
npm install
```

### 3. Install Python Dependencies

```bash
pip install opencv-python mediapipe numpy sounddevice
```

**Windows Users:** sounddevice works with winsound (pre-installed)

**macOS/Linux Users:** You may need to install additional audio libraries:
```bash
# macOS
brew install portaudio

# Ubuntu/Debian
sudo apt-get install portaudio19-dev python3-pyaudio
```

### 4. Set Up MongoDB

**Option A: Local MongoDB**
```bash
# Start MongoDB service
# Windows
net start MongoDB

# macOS
brew services start mongodb-community

# Linux
sudo systemctl start mongod
```

**Option B: MongoDB Atlas (Cloud)**
1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a cluster and get your connection string
3. Update `.env` file with your connection string

### 5. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017/vigilcam

# Session Secret (Change this!)
SESSION_SECRET=your_super_secret_key_here_change_this

# Server Port
PORT=3000

# Node Environment
NODE_ENV=development
```

### 6. Create Required Directories

```bash
mkdir reports
```

### 7. Start the Application

```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

### 8. Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

## Project Structure

```
VigilCam/
├── config/
│   ├── db.js                    # MongoDB connection
│   └── passport.js              # Authentication strategy
├── models/
│   └── User.js                  # User schema
├── routes/
│   ├── index.js                 # Public routes
│   ├── users.js                 # Auth routes
│   └── monitoring.js            # Protected monitoring routes
├── public/
│   ├── css/
│   │   └── style.css            # Enhanced dark theme
│   └── js/
│       └── main.js              # Client-side scripts
├── views/
│   ├── partials/
│   │   ├── navbar.ejs          # Navigation bar
│   │   ├── footer.ejs          # Footer
│   │   └── messages.ejs        # Flash messages
│   ├── home.ejs                # Landing page
│   ├── login.ejs               # Login page
│   ├── register.ejs            # Registration page
│   └── monitoring.ejs          # Live monitoring interface
├── reports/                     # Generated JSON reports
├── vigilcam_stream.py          # ML detection script
├── server.js                   # Express + Socket.IO server
├── package.json                # Node dependencies
├── .env                        # Environment variables
├── .gitignore                  # Git ignore rules
└── README.md                   # This file
```

## Usage Guide

### For Candidates (Being Monitored)

1. **Register an Account**
   - Navigate to the registration page
   - Provide your name, email, and password
   - Submit to create your account

2. **Login**
   - Use your credentials to log in
   - You'll be redirected to the monitoring page

3. **Start Monitoring**
   - Click "START MONITORING"
   - Allow camera and microphone access when prompted
   - Look straight at the camera during calibration (3 seconds)
   - Monitoring will begin automatically

4. **During the Session**
   - Stay focused on the camera
   - Avoid looking away for extended periods
   - Keep your face visible
   - Minimize talking and noise
   - One person per frame

5. **End Session**
   - Click "STOP MONITORING"
   - Download your session report

### For Administrators

1. **Monitor Live Stats**
   - View real-time detection data
   - Track gaze direction, blinks, and violations
   - Monitor risk score progression

2. **Review Violations**
   - Check the violations log for all infractions
   - Each violation includes:
     - Timestamp
     - Type of violation
     - Severity level (HIGH/MEDIUM/LOW)

3. **Download Reports**
   - After session ends, download the JSON report
   - Reports include:
     - Session duration
     - Total violations
     - Risk assessment
     - Complete violation history
     - Detection statistics

## Detection Types

| Detection Type | Description | Severity |
|---------------|-------------|----------|
| **Multiple Faces** | More than one person detected | HIGH |
| **No Face** | Candidate left the frame | HIGH |
| **Face Occluded** | Face covered or obscured | HIGH |
| **Talking Detected** | Mouth movement detected | HIGH |
| **Eyes Closed** | Eyes closed for >4 seconds | MEDIUM |
| **Excessive Blinking** | >40 blinks per minute | MEDIUM |
| **Gaze Away** | Looking away for >4 seconds | MEDIUM |
| **Head Turned** | Head turned significantly | MEDIUM |
| **Loud Noise** | Unusual audio detected | LOW |

## Risk Score System

The system calculates a risk score based on violations:

- **LOW RISK** (0-24): Minimal suspicious activity
- **MODERATE RISK** (25-49): Some concerns detected
- **HIGH RISK** (50+): Significant violations detected

**Scoring:**
- HIGH severity: +10 points
- MEDIUM severity: +5 points
- LOW severity: +2 points

## Configuration

### Camera Settings
Edit `vigilcam_stream.py` to adjust:

```python
# Calibration duration
CALIB_SECONDS = 3.0

# Blink detection sensitivity
EAR_BLINK_THRESHOLD = 0.18

# Gaze tracking tolerance
GAZE_X_DELTA = 0.07
GAZE_Y_DELTA = 0.06

# Timing thresholds
EYES_CLOSED_SECONDS = 4.0
NO_FACE_SECONDS = 6.0
SUSPICIOUS_GAZE_TIME = 4.0
```

### Performance Optimization

For lower-end systems, reduce frame rate in `vigilcam_stream.py`:

```python
# Change from 30 FPS to 15 FPS
time.sleep(0.066)  # ~15 FPS instead of 0.033
```

## Troubleshooting

### Camera Not Opening

**Problem:** Error: "Cannot open camera"

**Solutions:**
- Close other applications using the camera (Zoom, Teams, Skype)
- Check camera permissions in browser settings
- Try a different USB port (for external cameras)
- Restart the browser

### MongoDB Connection Error

**Problem:** "MongoDB Connection Error"

**Solutions:**
- Verify MongoDB is running: `mongod --version`
- Check connection string in `.env`
- Ensure MongoDB service is started
- Try connecting with MongoDB Compass to verify

### Python Module Not Found

**Problem:** "ModuleNotFoundError: No module named 'cv2'"

**Solution:**
```bash
pip install --upgrade opencv-python mediapipe numpy sounddevice
```

### Socket Connection Failed

**Problem:** "WebSocket connection failed"

**Solutions:**
- Check if port 3000 is available
- Restart the server
- Clear browser cache
- Check firewall settings

### Audio Detection Not Working

**Problem:** Talking detection not functioning

**Solutions:**
- Grant microphone permissions
- Check system audio settings
- Verify microphone is not muted
- Install portaudio (Linux/macOS)

## Security Considerations

### For Production Deployment

1. **Change Default Secrets**
   ```env
   SESSION_SECRET=use_a_long_random_string_here
   ```

2. **Enable MongoDB Authentication**
   ```javascript
   MONGO_URI=mongodb://username:password@host:port/vigilcam
   ```

3. **Use HTTPS**
   - Obtain SSL certificate
   - Configure Express to use HTTPS
   - Update Socket.IO for secure connections

4. **Set Secure Cookies**
   ```javascript
   cookie: {
     secure: true,
     httpOnly: true,
     sameSite: 'strict'
   }
   ```

5. **Implement Rate Limiting**
   ```bash
   npm install express-rate-limit
   ```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## Author

**Azhaan Ali Siddiqui**

- GitHub: [@yourusername](https://github.com/yourusername)
- Email: your.email@example.com

## Acknowledgments

- [MediaPipe](https://google.github.io/mediapipe/) - Face mesh and detection
- [OpenCV](https://opencv.org/) - Computer vision library
- [Express.js](https://expressjs.com/) - Web framework
- [Socket.IO](https://socket.io/) - Real-time communication
- [MongoDB](https://www.mongodb.com/) - Database

## Future Enhancements

- [ ] Multiple language support
- [ ] Mobile app for monitoring
- [ ] Advanced analytics dashboard
- [ ] Integration with LMS platforms
- [ ] Screen recording capabilities
- [ ] Multi-camera support
- [ ] Cloud deployment guides
- [ ] Docker containerization
- [ ] Automated testing suite

## Support

If you encounter any issues or have questions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Search existing [Issues](https://github.com/yourusername/vigilcam/issues)
3. Create a new issue with detailed information

---

<div align="center">

**⭐ Star this repo if you find it helpful! ⭐**

Made by Azhaan Ali Siddiqui

</div>