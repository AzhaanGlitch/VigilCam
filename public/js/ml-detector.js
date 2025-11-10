/**
 * FIXED: Camera Detection System
 * Resolves mirroring, face mesh display, and detection accuracy issues
 */

class MLDetector {
  constructor() {
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.faceMesh = null;
    this.camera = null;
    this.isRunning = false;
    this.calibrationData = {
      gazeX: [],
      gazeY: [],
      baselineX: 0.5,
      baselineY: 0.5,
      isCalibrated: false
    };
    this.stats = {
      totalBlinks: 0,
      violations: [],
      riskScore: 0,
      gazeDirection: 'CENTER',
      facesDetected: 0
    };
    this.detectionTimers = {
      eyesClosed: null,
      gazeAway: null,
      noFace: null,
      talking: null
    };
    this.blinkState = {
      frames: 0,
      lastBlinkTime: 0,
      history: []
    };
    this.mouthHistory = [];
    
    // Thresholds
    this.THRESHOLDS = {
      EAR_BLINK: 0.21,
      BLINK_FRAMES: 2,
      BLINK_MIN_SEP: 0.35,
      EYES_CLOSED_TIME: 4000,
      GAZE_AWAY_TIME: 4000,
      NO_FACE_TIME: 6000,
      GAZE_X_DELTA: 0.07,
      GAZE_Y_DELTA: 0.06,
      MOUTH_MOVEMENT: 0.5,
      EXCESSIVE_BLINKS: 40,
      HEAD_TURN_THRESHOLD: 0.22
    };
  }

  async initialize() {
    try {
      console.log('Starting initialization...');
      
      // Setup camera FIRST
      await this.setupCamera();
      
      // Load MediaPipe AFTER camera is ready
      await this.loadMediaPipe();
      
      console.log('ML Detector initialized successfully');
      return true;
    } catch (error) {
      console.error('ML Detector initialization failed:', error);
      throw error;
    }
  }

  async loadMediaPipe() {
    if (typeof FaceMesh === 'undefined') {
      throw new Error('MediaPipe FaceMesh not loaded. Check CDN scripts in HTML.');
    }

    console.log('Initializing MediaPipe FaceMesh...');

    this.faceMesh = new FaceMesh({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`;
      }
    });

    this.faceMesh.setOptions({
      maxNumFaces: 3,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.faceMesh.onResults((results) => this.processFaceMesh(results));
    
    console.log('MediaPipe FaceMesh initialized');
  }

  async setupCamera() {
    try {
      console.log('Setting up camera...');
      
      // Get video element
      this.video = document.getElementById('videoElement');
      if (!this.video) {
        throw new Error('Video element not found');
      }

      // Get canvas element
      this.canvas = document.getElementById('outputCanvas');
      if (!this.canvas) {
        throw new Error('Canvas element not found');
      }
      this.ctx = this.canvas.getContext('2d');

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: true
      });

      console.log('Camera access granted');

      // Set video source
      this.video.srcObject = stream;
      
      // Wait for video to load
      await new Promise((resolve, reject) => {
        this.video.onloadedmetadata = () => {
          console.log('Video metadata loaded');
          resolve();
        };
        this.video.onerror = () => {
          reject(new Error('Video loading failed'));
        };
      });

      // Play video
      await this.video.play();
      console.log('Video playing');

      // Set canvas size to match video
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
      
      console.log('Canvas size:', this.canvas.width, 'x', this.canvas.height);

      // Setup MediaPipe Camera
      this.camera = new Camera(this.video, {
        onFrame: async () => {
          if (this.isRunning && this.faceMesh) {
            await this.faceMesh.send({image: this.video});
          }
        },
        width: 1280,
        height: 720
      });

      return stream;
    } catch (error) {
      console.error('Camera setup error:', error);
      throw new Error(`Camera access denied: ${error.message}`);
    }
  }

  async startCalibration(onProgress) {
    const CALIBRATION_TIME = 3000; // 3 seconds
    const startTime = Date.now();
    
    this.calibrationData.gazeX = [];
    this.calibrationData.gazeY = [];
    
    // Start camera
    await this.camera.start();
    
    return new Promise((resolve) => {
      const calibrationInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min((elapsed / CALIBRATION_TIME) * 100, 100);
        
        if (onProgress) {
          onProgress(progress);
        }
        
        if (elapsed >= CALIBRATION_TIME) {
          clearInterval(calibrationInterval);
          this.finishCalibration();
          resolve();
        }
      }, 100);
    });
  }

  finishCalibration() {
    if (this.calibrationData.gazeX.length > 0) {
      this.calibrationData.baselineX = 
        this.calibrationData.gazeX.reduce((a, b) => a + b) / this.calibrationData.gazeX.length;
      this.calibrationData.baselineY = 
        this.calibrationData.gazeY.reduce((a, b) => a + b) / this.calibrationData.gazeY.length;
      this.calibrationData.isCalibrated = true;
      console.log('Calibration complete:', this.calibrationData.baselineX, this.calibrationData.baselineY);
    } else {
      console.warn('Calibration failed: no face detected');
      this.calibrationData.baselineX = 0.5;
      this.calibrationData.baselineY = 0.5;
      this.calibrationData.isCalibrated = true;
    }
  }

  async startMonitoring() {
    this.isRunning = true;
    this.stats = {
      totalBlinks: 0,
      violations: [],
      riskScore: 0,
      gazeDirection: 'CENTER',
      facesDetected: 0
    };
    console.log('Monitoring started');
  }

  stopMonitoring() {
    this.isRunning = false;
    if (this.camera) {
      this.camera.stop();
    }
    if (this.video && this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(track => track.stop());
    }
    console.log('Monitoring stopped');
  }

  processFaceMesh(results) {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      this.handleNoFace();
      return;
    }

    const numFaces = results.multiFaceLandmarks.length;
    this.stats.facesDetected = numFaces;

    // Clear no-face timer
    if (this.detectionTimers.noFace) {
      clearTimeout(this.detectionTimers.noFace);
      this.detectionTimers.noFace = null;
    }

    // Multiple faces violation
    if (numFaces > 1) {
      this.addViolation('MULTIPLE FACES DETECTED', 'HIGH');
    }

    // Process first face only
    const landmarks = results.multiFaceLandmarks[0];
    
    // Draw face mesh
    this.drawFaceMesh(results.multiFaceLandmarks[0]);
    
    // Eye analysis
    this.analyzeEyes(landmarks);
    
    // Gaze tracking
    this.analyzeGaze(landmarks);
    
    // Mouth movement
    this.analyzeMouth(landmarks);
    
    // Head pose
    this.analyzeHeadPose(landmarks);
  }

  drawFaceMesh(landmarks) {
    // Draw connections
    drawConnectors(this.ctx, landmarks, FACEMESH_TESSELATION, {
      color: 'rgba(0, 255, 255, 0.2)',
      lineWidth: 1
    });

    // Draw contours
    drawConnectors(this.ctx, landmarks, FACEMESH_CONTOURS, {
      color: 'rgba(0, 255, 255, 0.5)',
      lineWidth: 2
    });

    // Draw irises
    drawConnectors(this.ctx, landmarks, FACEMESH_IRISES, {
      color: 'rgba(0, 255, 0, 0.8)',
      lineWidth: 2
    });

    // Draw landmarks
    for (const landmark of landmarks) {
      const x = landmark.x * this.canvas.width;
      const y = landmark.y * this.canvas.height;
      
      this.ctx.beginPath();
      this.ctx.arc(x, y, 1, 0, 2 * Math.PI);
      this.ctx.fillStyle = 'rgba(0, 255, 255, 0.5)';
      this.ctx.fill();
    }
  }

  analyzeEyes(landmarks) {
    const leftEye = [
      landmarks[33], landmarks[160], landmarks[158],
      landmarks[133], landmarks[153], landmarks[144]
    ];
    
    const rightEye = [
      landmarks[362], landmarks[385], landmarks[387],
      landmarks[263], landmarks[373], landmarks[380]
    ];

    const leftEAR = this.calculateEAR(leftEye);
    const rightEAR = this.calculateEAR(rightEye);
    const avgEAR = (leftEAR + rightEAR) / 2;

    if (avgEAR < this.THRESHOLDS.EAR_BLINK) {
      this.blinkState.frames++;
      
      if (!this.detectionTimers.eyesClosed) {
        this.detectionTimers.eyesClosed = setTimeout(() => {
          this.addViolation('EYES CLOSED FOR EXTENDED TIME', 'MEDIUM');
        }, this.THRESHOLDS.EYES_CLOSED_TIME);
      }
    } else {
      if (this.detectionTimers.eyesClosed) {
        clearTimeout(this.detectionTimers.eyesClosed);
        this.detectionTimers.eyesClosed = null;
      }
      
      if (this.blinkState.frames >= this.THRESHOLDS.BLINK_FRAMES) {
        const now = Date.now();
        if (now - this.blinkState.lastBlinkTime > this.THRESHOLDS.BLINK_MIN_SEP * 1000) {
          this.stats.totalBlinks++;
          this.blinkState.lastBlinkTime = now;
          this.blinkState.history.push(now);
          
          const recentBlinks = this.blinkState.history.filter(
            t => now - t < 60000
          ).length;
          
          if (recentBlinks > this.THRESHOLDS.EXCESSIVE_BLINKS) {
            this.addViolation('EXCESSIVE BLINKING', 'MEDIUM');
          }
        }
      }
      this.blinkState.frames = 0;
    }
  }

  calculateEAR(eyeLandmarks) {
    const p1 = eyeLandmarks[1];
    const p2 = eyeLandmarks[2];
    const p3 = eyeLandmarks[3];
    const p4 = eyeLandmarks[4];
    const p5 = eyeLandmarks[5];
    const p0 = eyeLandmarks[0];

    const vertical1 = this.distance(p1, p5);
    const vertical2 = this.distance(p2, p4);
    const horizontal = this.distance(p0, p3);

    if (horizontal === 0) return 0;
    return (vertical1 + vertical2) / (2.0 * horizontal);
  }

  analyzeGaze(landmarks) {
    const leftIris = landmarks[468];
    const rightIris = landmarks[473];
    
    if (!leftIris || !rightIris) return;

    const avgX = (leftIris.x + rightIris.x) / 2;
    const avgY = (leftIris.y + rightIris.y) / 2;

    if (!this.calibrationData.isCalibrated) {
      this.calibrationData.gazeX.push(avgX);
      this.calibrationData.gazeY.push(avgY);
      return;
    }

    const dx = avgX - this.calibrationData.baselineX;
    const dy = avgY - this.calibrationData.baselineY;

    let direction = 'CENTER';
    if (Math.abs(dx) <= this.THRESHOLDS.GAZE_X_DELTA && 
        Math.abs(dy) <= this.THRESHOLDS.GAZE_Y_DELTA) {
      direction = 'CENTER';
      
      if (this.detectionTimers.gazeAway) {
        clearTimeout(this.detectionTimers.gazeAway);
        this.detectionTimers.gazeAway = null;
      }
    } else {
      if (Math.abs(dx) > Math.abs(dy)) {
        direction = dx < 0 ? 'LEFT' : 'RIGHT';
      } else {
        direction = dy < 0 ? 'UP' : 'DOWN';
      }

      if (!this.detectionTimers.gazeAway) {
        this.detectionTimers.gazeAway = setTimeout(() => {
          this.addViolation(`GAZE AWAY - LOOKING ${direction}`, 'MEDIUM');
        }, this.THRESHOLDS.GAZE_AWAY_TIME);
      }
    }

    this.stats.gazeDirection = direction;
  }

  analyzeMouth(landmarks) {
    const upperLip = landmarks[13];
    const lowerLip = landmarks[14];
    const mouthOpen = this.distance(upperLip, lowerLip);
    
    this.mouthHistory.push(mouthOpen);
    if (this.mouthHistory.length > 30) {
      this.mouthHistory.shift();
    }

    if (this.mouthHistory.length >= 20) {
      const variance = this.calculateVariance(this.mouthHistory);
      
      if (variance > this.THRESHOLDS.MOUTH_MOVEMENT) {
        if (!this.detectionTimers.talking) {
          this.detectionTimers.talking = setTimeout(() => {
            this.addViolation('TALKING DETECTED', 'HIGH');
            this.detectionTimers.talking = null;
          }, 2500);
        }
      } else {
        if (this.detectionTimers.talking) {
          clearTimeout(this.detectionTimers.talking);
          this.detectionTimers.talking = null;
        }
      }
    }
  }

  analyzeHeadPose(landmarks) {
    const nose = landmarks[1];
    const headTurned = Math.abs(nose.x - 0.5) > this.THRESHOLDS.HEAD_TURN_THRESHOLD;
    
    if (headTurned) {
      this.addViolation('HEAD TURNED AWAY', 'MEDIUM');
    }
  }

  handleNoFace() {
    this.stats.facesDetected = 0;
    this.stats.gazeDirection = 'NO_FACE';
    
    if (!this.detectionTimers.noFace) {
      this.detectionTimers.noFace = setTimeout(() => {
        this.addViolation('CANDIDATE LEFT FRAME', 'HIGH');
      }, this.THRESHOLDS.NO_FACE_TIME);
    }
  }

  addViolation(type, severity) {
    const lastViolation = this.stats.violations[this.stats.violations.length - 1];
    if (lastViolation && lastViolation.type === type) {
      const timeDiff = Date.now() - new Date(lastViolation.timestamp).getTime();
      if (timeDiff < 5000) return;
    }

    const violation = {
      timestamp: new Date().toISOString(),
      type: type,
      severity: severity
    };

    this.stats.violations.push(violation);

    if (severity === 'HIGH') {
      this.stats.riskScore += 10;
    } else if (severity === 'MEDIUM') {
      this.stats.riskScore += 5;
    } else {
      this.stats.riskScore += 2;
    }

    if (this.onViolation) {
      this.onViolation(violation);
    }
  }

  getStats() {
    return {
      ...this.stats,
      timestamp: Date.now()
    };
  }

  distance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  calculateVariance(arr) {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b) / arr.length;
    const squareDiffs = arr.map(value => Math.pow(value - mean, 2));
    return squareDiffs.reduce((a, b) => a + b) / arr.length;
  }

  cleanup() {
    this.stopMonitoring();
    if (this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

// Export
if (typeof window !== 'undefined') {
  window.MLDetector = MLDetector;
}