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
app.use(express.json());

// Static folder
app.use(express.static(path.join(__dirname, 'public')));

// Express session middleware
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'vigilcam_secret_key_change_in_production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
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

// Socket.IO connection handling
const { PythonShell } = require('python-shell');
const fs = require('fs');

let activeSessions = new Map(); // Store active monitoring sessions

// Function to find Python executable
function getPythonCommand() {
  const { execSync } = require('child_process');
  
  // Try different Python commands
  const commands = ['python', 'python3', 'py'];
  
  for (const cmd of commands) {
    try {
      const result = execSync(`${cmd} --version`, { encoding: 'utf8', stdio: 'pipe' });
      if (result.includes('Python 3')) {
        console.log(`Found Python: ${cmd} - ${result.trim()}`);
        return cmd;
      }
    } catch (err) {
      // Command not found, try next
      continue;
    }
  }
  
  // If none found, return 'python3' as default
  console.warn('Warning: Could not detect Python installation. Using default "python3"');
  return 'python3';
}

const pythonCommand = getPythonCommand();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('start-monitoring', (data) => {
    console.log('Starting monitoring for user:', data.userId);
    
    const options = {
      mode: 'json',
      pythonPath: pythonCommand,
      pythonOptions: ['-u'],
      scriptPath: __dirname,
      args: [data.userId, socket.id]
    };

    let pyshell;
    
    try {
      pyshell = new PythonShell('vigilcam_stream.py', options);
      
      // Store the session
      activeSessions.set(socket.id, {
        pyshell: pyshell,
        userId: data.userId,
        startTime: Date.now()
      });

      pyshell.on('message', (message) => {
        console.log('Python message type:', message.type); // Debug log
        
        // Emit all detection data to client
        socket.emit('detection-data', message);
        
        // Special handling for report
        if (message.type === 'report') {
          console.log('Report generated, sending to client');
        }
      });

      pyshell.on('error', (err) => {
        console.error('Python Error:', err);
        socket.emit('error', { 
          message: 'Detection system error. Please ensure Python is installed and all dependencies are available.' 
        });
      });

      pyshell.on('close', (code) => {
        console.log('Python script closed with code:', code);
        
        // Clean up session
        if (activeSessions.has(socket.id)) {
          activeSessions.delete(socket.id);
        }
      });
      
    } catch (err) {
      console.error('Failed to start Python script:', err);
      socket.emit('error', { 
        message: 'Failed to start monitoring. Please check Python installation and dependencies.' 
      });
    }
  });

  socket.on('stop-monitoring', () => {
    console.log('Stop monitoring requested for:', socket.id);
    const session = activeSessions.get(socket.id);
    
    if (session && session.pyshell) {
      try {
        // Send SIGTERM to Python process to trigger graceful shutdown
        session.pyshell.childProcess.stdin.write('\n');
        session.pyshell.childProcess.kill('SIGTERM');
        
        console.log('Sent termination signal to Python process');
        
        // Wait a bit for Python to send the report
        setTimeout(() => {
          if (session.pyshell && session.pyshell.childProcess) {
            session.pyshell.childProcess.kill('SIGKILL');
          }
          activeSessions.delete(socket.id);
        }, 3000); // Wait 3 seconds for graceful shutdown
        
      } catch (err) {
        console.error('Error stopping Python process:', err);
        activeSessions.delete(socket.id);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const session = activeSessions.get(socket.id);
    
    if (session && session.pyshell) {
      try {
        session.pyshell.childProcess.kill('SIGTERM');
        setTimeout(() => {
          if (session.pyshell && session.pyshell.childProcess) {
            session.pyshell.childProcess.kill('SIGKILL');
          }
        }, 2000);
      } catch (err) {
        console.error('Error killing Python process on disconnect:', err);
      }
      activeSessions.delete(socket.id);
    }
  });
});

// Set port
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`═══════════════════════════════════════════════`);
  console.log(`    VigilCam Server Running on Port ${PORT}`);
  console.log(`    Access at: http://localhost:${PORT}`);
  console.log(`    WebSocket Server: Active`);
  console.log(`    Python Command: ${pythonCommand}`);
  console.log(`═══════════════════════════════════════════════`);
});