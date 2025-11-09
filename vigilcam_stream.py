#!/usr/bin/env python
# -*- coding: utf-8 -*-
import sys
import json
import traceback
import signal

# Global flag for graceful shutdown
shutdown_flag = False

def output_json(data):
    """Send JSON data to Node.js via stdout"""
    try:
        print(json.dumps(data), flush=True)
    except Exception as e:
        print(json.dumps({'type': 'error', 'message': f'JSON output error: {str(e)}'}), flush=True)

def signal_handler(signum, frame):
    """Handle termination signals gracefully"""
    global shutdown_flag
    shutdown_flag = True
    output_json({'type': 'status', 'message': 'Shutdown signal received'})

# Register signal handlers
signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

# Send startup message
output_json({'type': 'status', 'message': 'Python script starting...'})

try:
    import cv2
    output_json({'type': 'status', 'message': f'OpenCV loaded: {cv2.__version__}'})
except Exception as e:
    output_json({'type': 'error', 'message': f'OpenCV import failed: {str(e)}'})
    sys.exit(1)

try:
    import mediapipe as mp
    output_json({'type': 'status', 'message': 'MediaPipe loaded'})
except Exception as e:
    output_json({'type': 'error', 'message': f'MediaPipe import failed: {str(e)}'})
    sys.exit(1)

try:
    import numpy as np
    output_json({'type': 'status', 'message': 'NumPy loaded'})
except Exception as e:
    output_json({'type': 'error', 'message': f'NumPy import failed: {str(e)}'})
    sys.exit(1)

try:
    import sounddevice as sd
    output_json({'type': 'status', 'message': 'SoundDevice loaded'})
except Exception as e:
    output_json({'type': 'error', 'message': f'SoundDevice import failed: {str(e)}'})
    sys.exit(1)

import time
import threading
from collections import deque
from datetime import datetime
import base64
import os

# Get user ID and socket ID from command line arguments
user_id = sys.argv[1] if len(sys.argv) > 1 else "unknown"
socket_id = sys.argv[2] if len(sys.argv) > 2 else "unknown"

output_json({'type': 'status', 'message': f'User ID: {user_id}, Socket: {socket_id}'})

# Configuration constants
CALIB_SECONDS = 3.0
EAR_BLINK_THRESHOLD = 0.18
BLINK_CONSEC_FRAMES = 2
FACE_DET_CONF = 0.45
EYE_VARIANCE_THRESHOLD = 200.0
EYE_MEAN_DARK = 45.0
GAZE_X_DELTA = 0.07
GAZE_Y_DELTA = 0.06
NOISE_SENSITIVITY = 3.5
AUDIO_CALIB_SECONDS = 2.0
AUDIO_SR = 22050
AUDIO_BLOCKSIZE = 1024
EYES_CLOSED_SECONDS = 4.0
NO_FACE_SECONDS = 6.0
SUSPICIOUS_GAZE_TIME = 4.0
MOUTH_MOVEMENT_THRESHOLD = 0.5
HEAD_TURN_THRESHOLD = 0.22
EXCESSIVE_BLINK_THRESHOLD = 40

# Initialize MediaPipe
try:
    mp_face_mesh = mp.solutions.face_mesh
    mp_face_detection = mp.solutions.face_detection
    mp_drawing = mp.solutions.drawing_utils
    mp_drawing_styles = mp.solutions.drawing_styles

    face_mesh = mp_face_mesh.FaceMesh(
        refine_landmarks=True, 
        max_num_faces=3,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    face_detection = mp_face_detection.FaceDetection(min_detection_confidence=0.4)
    
    output_json({'type': 'status', 'message': 'MediaPipe initialized'})
except Exception as e:
    output_json({'type': 'error', 'message': f'MediaPipe initialization failed: {str(e)}'})
    sys.exit(1)

# Landmark indices
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]
LEFT_IRIS = 468
RIGHT_IRIS = 473
MOUTH_TOP = 13
MOUTH_BOTTOM = 14
NOSE_TIP = 1

# Audio monitoring
_audio_rms = 0.0
_audio_lock = threading.Lock()
_audio_stream = None
_audio_baseline = 1e-6

# Exam data tracking
exam_data = {
    'user_id': user_id,
    'start_time': time.time(),
    'violations': [],
    'gaze_away_count': 0,
    'no_face_count': 0,
    'multiple_faces_count': 0,
    'talking_count': 0,
    'eyes_closed_count': 0,
    'total_blinks': 0,
    'excessive_blink_count': 0,
    'total_warnings': 0,
    'risk_score': 0
}

violation_timers = {}
blink_history = deque(maxlen=60)

def add_violation(violation_type, severity="MEDIUM"):
    current_time = time.time()
    
    if violation_type in violation_timers:
        if current_time - violation_timers[violation_type] < 5.0:
            return
    
    violation_timers[violation_type] = current_time
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    violation = {
        'timestamp': timestamp,
        'type': violation_type,
        'severity': severity
    }
    exam_data['violations'].append(violation)
    exam_data['total_warnings'] += 1
    
    if severity == "HIGH":
        exam_data['risk_score'] += 10
    elif severity == "MEDIUM":
        exam_data['risk_score'] += 5
    else:
        exam_data['risk_score'] += 2
    
    output_json({
        'type': 'violation',
        'data': violation,
        'risk_score': exam_data['risk_score']
    })

def audio_callback(indata, frames, time_info, status):
    global _audio_rms
    try:
        mono = np.mean(indata, axis=1) if indata.ndim > 1 else indata[:,0]
        rms = float(np.sqrt(np.mean(np.square(mono))))
        with _audio_lock:
            _audio_rms = rms
    except Exception:
        pass

def start_audio():
    global _audio_stream
    try:
        _audio_stream = sd.InputStream(callback=audio_callback,
                                       blocksize=AUDIO_BLOCKSIZE,
                                       samplerate=AUDIO_SR,
                                       channels=1)
        _audio_stream.start()
        return True
    except Exception as e:
        output_json({'type': 'warning', 'message': f'Audio init failed: {str(e)}'})
        return False

def calibrate_audio_baseline():
    global _audio_baseline
    try:
        rec = sd.rec(int(AUDIO_CALIB_SECONDS * AUDIO_SR), samplerate=AUDIO_SR, channels=1, dtype='float64')
        sd.wait()
        mono = rec[:,0]
        _audio_baseline = max(1e-6, float(np.sqrt(np.mean(np.square(mono)))) * 1.5)
    except Exception:
        _audio_baseline = 1e-6

def eye_aspect_ratio(landmarks, eye_indices, w, h):
    try:
        pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in eye_indices]
        A = np.linalg.norm(np.array(pts[1]) - np.array(pts[5]))
        B = np.linalg.norm(np.array(pts[2]) - np.array(pts[4]))
        C = np.linalg.norm(np.array(pts[0]) - np.array(pts[3]))
        if C <= 1e-6:
            return 0.0
        return (A + B) / (2.0 * C)
    except Exception:
        return 0.0

def mouth_aspect_ratio(landmarks, w, h):
    try:
        top = (landmarks[MOUTH_TOP].x * w, landmarks[MOUTH_TOP].y * h)
        bottom = (landmarks[MOUTH_BOTTOM].x * w, landmarks[MOUTH_BOTTOM].y * h)
        return np.linalg.norm(np.array(top) - np.array(bottom))
    except Exception:
        return 0.0

def check_head_turn(landmarks):
    try:
        nose = landmarks[NOSE_TIP]
        nose_x = nose.x
        nose_y = nose.y
        head_ok = (abs(nose_x - 0.5) < HEAD_TURN_THRESHOLD and abs(nose_y - 0.5) < 0.18)
        return not head_ok
    except Exception:
        return False

def get_iris_avg(landmarks):
    try:
        return (landmarks[LEFT_IRIS].x + landmarks[RIGHT_IRIS].x) / 2.0, \
               (landmarks[LEFT_IRIS].y + landmarks[RIGHT_IRIS].y) / 2.0
    except Exception:
        return None, None

def draw_face_mesh(frame, face_landmarks):
    try:
        h, w, _ = frame.shape
        
        landmark_drawing_spec = mp_drawing.DrawingSpec(
            color=(0, 255, 255),
            thickness=1,
            circle_radius=1
        )
        
        connection_drawing_spec = mp_drawing.DrawingSpec(
            color=(0, 200, 200),
            thickness=1,
            circle_radius=1
        )
        
        mp_drawing.draw_landmarks(
            image=frame,
            landmark_list=face_landmarks,
            connections=mp_face_mesh.FACEMESH_TESSELATION,
            landmark_drawing_spec=landmark_drawing_spec,
            connection_drawing_spec=connection_drawing_spec
        )
        
        contour_drawing_spec = mp_drawing.DrawingSpec(
            color=(0, 255, 255),
            thickness=1,
            circle_radius=1
        )
        
        mp_drawing.draw_landmarks(
            image=frame,
            landmark_list=face_landmarks,
            connections=mp_face_mesh.FACEMESH_CONTOURS,
            landmark_drawing_spec=None,
            connection_drawing_spec=contour_drawing_spec
        )
        
        iris_drawing_spec = mp_drawing.DrawingSpec(
            color=(0, 255, 0),
            thickness=1,
            circle_radius=2
        )
        
        mp_drawing.draw_landmarks(
            image=frame,
            landmark_list=face_landmarks,
            connections=mp_face_mesh.FACEMESH_IRISES,
            landmark_drawing_spec=iris_drawing_spec,
            connection_drawing_spec=iris_drawing_spec
        )
        
    except Exception:
        pass

def save_exam_report():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    os.makedirs('reports', exist_ok=True)
    
    filename = f"exam_report_{user_id}_{timestamp}.json"
    filepath = os.path.join('reports', filename)
    
    elapsed = time.time() - exam_data['start_time']
    report = {
        'user_id': user_id,
        'timestamp': timestamp,
        'date': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        'duration_seconds': elapsed,
        'total_violations': len(exam_data['violations']),
        'risk_score': exam_data['risk_score'],
        'total_blinks': exam_data['total_blinks'],
        'excessive_blink_count': exam_data['excessive_blink_count'],
        'gaze_away_count': exam_data['gaze_away_count'],
        'no_face_count': exam_data['no_face_count'],
        'multiple_faces_count': exam_data['multiple_faces_count'],
        'talking_count': exam_data['talking_count'],
        'eyes_closed_count': exam_data['eyes_closed_count'],
        'violations': exam_data['violations'],
        'filename': filename
    }
    
    with open(filepath, 'w') as f:
        json.dump(report, f, indent=4)
    
    output_json({
        'type': 'report',
        'data': report,
        'filename': filename
    })
    
    return filepath

# Main execution
try:
    output_json({'type': 'status', 'message': 'Initializing camera...'})
    
    audio_ok = start_audio()
    if audio_ok:
        calibrate_audio_baseline()
        output_json({'type': 'status', 'message': 'Audio initialized'})

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        output_json({'type': 'error', 'message': 'Cannot open camera'})
        sys.exit(1)

    output_json({'type': 'status', 'message': 'Camera opened successfully'})

    output_json({'type': 'status', 'message': 'Calibrating - look straight at camera'})
    
    calib_x = []
    calib_y = []
    calib_start = time.time()
    
    while time.time() - calib_start < CALIB_SECONDS and not shutdown_flag:
        ret, frame = cap.read()
        if not ret:
            continue
        
        frame = cv2.flip(frame, 1)
        h, w, _ = frame.shape
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        det = face_detection.process(rgb)
        mesh = face_mesh.process(rgb)
        
        if mesh.multi_face_landmarks and det.detections:
            landmarks = mesh.multi_face_landmarks[0].landmark
            avgx, avgy = get_iris_avg(landmarks)
            if avgx is not None:
                calib_x.append(avgx)
                calib_y.append(avgy)
            
            draw_face_mesh(frame, mesh.multi_face_landmarks[0])
        
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        frame_base64 = base64.b64encode(buffer).decode('utf-8')
        
        output_json({
            'type': 'frame',
            'frame': frame_base64,
            'status': 'calibrating'
        })

    if not calib_x:
        output_json({'type': 'error', 'message': 'Calibration failed: no face detected'})
        cap.release()
        sys.exit(1)

    baseline_x = float(np.mean(calib_x))
    baseline_y = float(np.mean(calib_y))
    
    output_json({'type': 'status', 'message': 'Calibration complete - monitoring started'})

    # Main monitoring loop
    blink_frames = 0
    last_blink_time = 0.0
    BLINK_MIN_SEP = 0.35
    eyes_closed_start = None
    no_face_start = None
    gaze_away_start = None
    talking_start = None
    mouth_samples = []
    mouth_history = deque(maxlen=30)
    occlusion_frames = 0
    noise_frames = 0

    frame_count = 0
    while not shutdown_flag:
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        h, w, _ = frame.shape
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        det = face_detection.process(rgb)
        mesh = face_mesh.process(rgb)
        
        num_faces = 0
        if det.detections:
            num_faces = len(det.detections)
        
        face_conf = 0.0
        if det.detections:
            face_conf = max([d.score[0] for d in det.detections])

        if num_faces > 1:
            add_violation("MULTIPLE FACES DETECTED", "HIGH")
            exam_data['multiple_faces_count'] += 1

        gaze_dir = "UNKNOWN"

        if mesh.multi_face_landmarks and face_conf >= FACE_DET_CONF and num_faces == 1:
            no_face_start = None
            lm = mesh.multi_face_landmarks[0].landmark

            draw_face_mesh(frame, mesh.multi_face_landmarks[0])

            left_ear = eye_aspect_ratio(lm, LEFT_EYE, w, h)
            right_ear = eye_aspect_ratio(lm, RIGHT_EYE, w, h)
            avg_ear = (left_ear + right_ear) / 2.0

            if avg_ear > 0 and avg_ear < EAR_BLINK_THRESHOLD:
                blink_frames += 1
                if eyes_closed_start is None:
                    eyes_closed_start = time.time()
                if time.time() - eyes_closed_start >= EYES_CLOSED_SECONDS:
                    add_violation("EYES CLOSED FOR EXTENDED TIME", "MEDIUM")
                    exam_data['eyes_closed_count'] += 1
            else:
                if blink_frames >= BLINK_CONSEC_FRAMES:
                    now = time.time()
                    if now - last_blink_time > BLINK_MIN_SEP:
                        last_blink_time = now
                        exam_data['total_blinks'] += 1
                        blink_history.append(now)
                blink_frames = 0
                eyes_closed_start = None

            if len(blink_history) >= 60:
                recent_blinks = sum(1 for t in blink_history if time.time() - t < 60)
                if recent_blinks > EXCESSIVE_BLINK_THRESHOLD:
                    add_violation("EXCESSIVE BLINKING", "MEDIUM")
                    exam_data['excessive_blink_count'] += 1

            mar = mouth_aspect_ratio(lm, w, h)
            mouth_history.append(mar)
            
            if len(mouth_samples) < 30:
                mouth_samples.append(mar)
            
            if len(mouth_history) >= 20:
                mouth_variance = np.var(list(mouth_history))
                if mouth_variance > MOUTH_MOVEMENT_THRESHOLD:
                    if talking_start is None:
                        talking_start = time.time()
                    elif time.time() - talking_start > 2.5:
                        add_violation("TALKING DETECTED", "HIGH")
                        exam_data['talking_count'] += 1
                        talking_start = None
                else:
                    talking_start = None

            head_turned = check_head_turn(lm)
            if head_turned:
                add_violation("HEAD TURNED AWAY", "MEDIUM")

            avgx, avgy = get_iris_avg(lm)
            if avgx is None:
                gaze_dir = "UNKNOWN"
            else:
                dx = avgx - baseline_x
                dy = avgy - baseline_y
                
                if abs(dx) <= GAZE_X_DELTA and abs(dy) <= GAZE_Y_DELTA:
                    gaze_dir = "CENTER"
                    gaze_away_start = None
                elif abs(dx) > abs(dy):
                    gaze_dir = "LEFT" if dx < 0 else "RIGHT"
                else:
                    gaze_dir = "UP" if dy < 0 else "DOWN"
                
                if gaze_dir != "CENTER":
                    if gaze_away_start is None:
                        gaze_away_start = time.time()
                    elif time.time() - gaze_away_start >= SUSPICIOUS_GAZE_TIME:
                        add_violation(f"GAZE AWAY - LOOKING {gaze_dir}", "MEDIUM")
                        exam_data['gaze_away_count'] += 1
                        gaze_away_start = None
                else:
                    gaze_away_start = None

            with _audio_lock:
                current_rms = _audio_rms
            
            if _audio_baseline > 0 and current_rms > _audio_baseline * NOISE_SENSITIVITY:
                noise_frames += 1
                if noise_frames > 30:
                    add_violation("LOUD NOISE DETECTED", "LOW")
                    noise_frames = 0
            else:
                noise_frames = 0
        else:
            gaze_dir = "NO_FACE"
            
            if no_face_start is None:
                no_face_start = time.time()
            else:
                elapsed_no_face = time.time() - no_face_start
                if elapsed_no_face >= NO_FACE_SECONDS:
                    add_violation("CANDIDATE LEFT FRAME", "HIGH")
                    exam_data['no_face_count'] += 1
                    no_face_start = time.time()

        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        frame_base64 = base64.b64encode(buffer).decode('utf-8')
        
        output_json({
            'type': 'frame',
            'frame': frame_base64,
            'stats': {
                'gaze': gaze_dir,
                'blinks': exam_data['total_blinks'],
                'violations': len(exam_data['violations']),
                'risk_score': exam_data['risk_score'],
                'num_faces': num_faces
            },
            'status': 'monitoring'
        })
        
        frame_count += 1
        time.sleep(0.033)

except KeyboardInterrupt:
    output_json({'type': 'status', 'message': 'Monitoring stopped by user'})
except Exception as e:
    output_json({'type': 'error', 'message': f'Fatal error: {str(e)}'})
    output_json({'type': 'error', 'message': f'Traceback: {traceback.format_exc()}'})
finally:
    output_json({'type': 'status', 'message': 'Generating report...'})
    
    try:
        save_exam_report()
    except Exception as e:
        output_json({'type': 'error', 'message': f'Report save failed: {str(e)}'})
    
    try:
        if _audio_stream is not None:
            _audio_stream.stop()
            _audio_stream.close()
    except Exception:
        pass
    
    if 'cap' in locals():
        cap.release()
    
    output_json({'type': 'complete', 'message': 'Monitoring session ended'})
    sys.exit(0)