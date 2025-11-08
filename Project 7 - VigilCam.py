import cv2
import mediapipe as mp
import numpy as np
import sounddevice as sd
import time
import threading
from collections import deque
import json
from datetime import datetime
import winsound
import os

CALIB_SECONDS = 3.0
EAR_BLINK_THRESHOLD = 0.18
BLINK_CONSEC_FRAMES = 2
FACE_DET_CONF = 0.45
EYE_VARIANCE_THRESHOLD = 200.0
EYE_MEAN_DARK = 45.0
GAZE_X_DELTA = 0.07
GAZE_Y_DELTA = 0.06
SCORE_SMOOTH = 6
NOISE_SENSITIVITY = 3.5
AUDIO_CALIB_SECONDS = 2.0
AUDIO_SR = 22050
AUDIO_BLOCKSIZE = 1024
EYES_CLOSED_SECONDS = 4.0
NO_FACE_SECONDS = 6.0
SUSPICIOUS_GAZE_TIME = 4.0
MULTIPLE_FACE_PENALTY = 2.0
MOUTH_MOVEMENT_THRESHOLD = 0.5
HEAD_TURN_THRESHOLD = 0.22
EXCESSIVE_BLINK_THRESHOLD = 40

mp_face_mesh = mp.solutions.face_mesh
mp_face_detection = mp.solutions.face_detection
mp_drawing = mp.solutions.drawing_utils

face_mesh = mp_face_mesh.FaceMesh(refine_landmarks=True, max_num_faces=3)
face_detection = mp_face_detection.FaceDetection(min_detection_confidence=0.4)

LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]
LEFT_IRIS = 468
RIGHT_IRIS = 473
MOUTH_TOP = 13
MOUTH_BOTTOM = 14
NOSE_TIP = 1

_audio_rms = 0.0
_audio_lock = threading.Lock()
_audio_stream = None
_audio_baseline = 1e-6

exam_data = {
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

alert_queue = deque(maxlen=5)
last_alert_time = 0
alert_cooldown = 3.0
violation_timers = {}
blink_history = deque(maxlen=60)

def play_alert_sound(severity="MEDIUM"):
    try:
        if severity == "HIGH":
            for _ in range(3):
                winsound.Beep(1200, 200)
                time.sleep(0.1)
        elif severity == "MEDIUM":
            for _ in range(2):
                winsound.Beep(1000, 250)
                time.sleep(0.1)
        else:
            winsound.Beep(800, 200)
    except:
        print('\a')

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
    
    alert_queue.append(violation_type)
    
    global last_alert_time
    if current_time - last_alert_time > alert_cooldown:
        threading.Thread(target=play_alert_sound, args=(severity,), daemon=True).start()
        last_alert_time = current_time

def audio_callback(indata, frames, time_info, status):
    global _audio_rms
    mono = np.mean(indata, axis=1) if indata.ndim > 1 else indata[:,0]
    rms = float(np.sqrt(np.mean(np.square(mono))))
    with _audio_lock:
        _audio_rms = rms

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
        print("Audio stream start failed:", e)
        return False

def calibrate_audio_baseline():
    global _audio_baseline
    try:
        print(f"Calibrating microphone for {AUDIO_CALIB_SECONDS:.1f}s - please be quiet...")
        rec = sd.rec(int(AUDIO_CALIB_SECONDS * AUDIO_SR), samplerate=AUDIO_SR, channels=1, dtype='float64')
        sd.wait()
        mono = rec[:,0]
        _audio_baseline = max(1e-6, float(np.sqrt(np.mean(np.square(mono)))) * 1.5)
        print(f"Audio baseline RMS = {_audio_baseline:.6f}")
    except Exception as e:
        print("Audio calibration failed:", e)
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

def eye_region_stats(gray, landmarks, eye_indices, w, h, pad=6):
    xs = [int(landmarks[i].x * w) for i in eye_indices]
    ys = [int(landmarks[i].y * h) for i in eye_indices]
    x1 = max(min(xs) - pad, 0); x2 = min(max(xs) + pad, w-1)
    y1 = max(min(ys) - pad, 0); y2 = min(max(ys) + pad, h-1)
    if x2 <= x1 or y2 <= y1:
        return None
    region = gray[y1:y2, x1:x2]
    if region.size == 0:
        return None
    return float(np.mean(region)), float(np.var(region))

def get_iris_avg(landmarks):
    try:
        return (landmarks[LEFT_IRIS].x + landmarks[RIGHT_IRIS].x) / 2.0, \
               (landmarks[LEFT_IRIS].y + landmarks[RIGHT_IRIS].y) / 2.0
    except Exception:
        return None, None

def draw_violation_text(frame, h, w):
    y_offset = h - 10
    recent_violations = exam_data['violations'][-5:]
    recent_violations.reverse()
    
    for v in recent_violations:
        text = f"{v['timestamp'][-8:]}: {v['type']}"
        color = (0, 0, 255) if v['severity'] == "HIGH" else (0, 165, 255) if v['severity'] == "MEDIUM" else (0, 255, 255)
        cv2.putText(frame, text, (5, y_offset), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.3, color, 1, cv2.LINE_AA)
        y_offset -= 15

def save_exam_report():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"exam_report_{timestamp}.json"
    
    elapsed = time.time() - exam_data['start_time']
    report = {
        'timestamp': timestamp,
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
        'violations': exam_data['violations']
    }
    
    with open(filename, 'w') as f:
        json.dump(report, f, indent=4)
    
    print(f"Exam report saved to {filename}")
    
    if exam_data['risk_score'] > 50:
        print("WARNING: HIGH RISK EXAM SESSION DETECTED")
    elif exam_data['risk_score'] > 25:
        print("WARNING: MODERATE RISK DETECTED")
    else:
        print("Exam session completed with low risk")

audio_ok = start_audio()
if audio_ok:
    calibrate_audio_baseline()
else:
    print("Warning: audio disabled; talking detection will be off.")

cap = cv2.VideoCapture(0)
if not cap.isOpened():
    print("ERROR: Cannot open camera. Close other apps or check device.")
    raise SystemExit

cv2.namedWindow("Exam Proctoring System", cv2.WINDOW_NORMAL)
print("Camera opened. Starting calibration - look straight at the camera.")

calib_x = []
calib_y = []
calib_start = time.time()
while time.time() - calib_start < CALIB_SECONDS:
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
            calib_x.append(avgx); calib_y.append(avgy)
    cv2.putText(frame, "Calibrating - keep eyes on camera...", (20,40),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,255), 2, cv2.LINE_AA)
    cv2.imshow("Exam Proctoring System", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        cap.release()
        cv2.destroyAllWindows()
        raise SystemExit

if not calib_x:
    print("Calibration failed: no face detected. Please retry.")
    cap.release()
    cv2.destroyAllWindows()
    raise SystemExit

baseline_x = float(np.mean(calib_x))
baseline_y = float(np.mean(calib_y))
print(f"Calibration complete. Monitoring started.")
print("Exam session active - any suspicious activity will be logged and alerted.")

frame_no = 0
blink_frames = 0
last_blink_time = 0.0
BLINK_MIN_SEP = 0.35
eyes_closed_start = None
no_face_start = None
gaze_away_start = None
talking_start = None
mouth_baseline = 0.0
mouth_samples = []
mouth_history = deque(maxlen=30)
occlusion_frames = 0
noise_frames = 0

while True:
    ret, frame = cap.read()
    if not ret:
        print("Frame grab failed; exiting.")
        break

    frame_no += 1
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

    occluded = False
    gaze_dir = "UNKNOWN"
    talking_detected = False
    head_turned = False
    blink_event = False

    if mesh.multi_face_landmarks and face_conf >= FACE_DET_CONF and num_faces == 1:
        no_face_start = None
        lm = mesh.multi_face_landmarks[0].landmark

        mp_drawing.draw_landmarks(frame, mesh.multi_face_landmarks[0], mp_face_mesh.FACEMESH_TESSELATION,
                                  mp_drawing.DrawingSpec(color=(0,200,0), thickness=1, circle_radius=1),
                                  mp_drawing.DrawingSpec(color=(0,150,255), thickness=1))

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
                    blink_event = True
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
            mouth_baseline = np.mean(mouth_samples)
        
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

        left_stats = eye_region_stats(gray, lm, LEFT_EYE, w, h)
        right_stats = eye_region_stats(gray, lm, RIGHT_EYE, w, h)
        if left_stats is None or right_stats is None:
            occluded = True
        else:
            lmean, lvar = left_stats
            rmean, rvar = right_stats
            
            if (lvar < EYE_VARIANCE_THRESHOLD or lmean < EYE_MEAN_DARK) and \
               (rvar < EYE_VARIANCE_THRESHOLD or rmean < EYE_MEAN_DARK):
                occlusion_frames += 1
                if occlusion_frames > 90:
                    occluded = True
                    add_violation("FACE OCCLUDED/COVERED", "HIGH")
                    occlusion_frames = 0
            else:
                occlusion_frames = 0

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

    status_color = (0, 255, 0)
    status_text = "MONITORING"
    
    if len(alert_queue) > 0:
        recent_alert = alert_queue[-1]
        if time.time() - last_alert_time < 3.0:
            status_color = (0, 0, 255)
            status_text = f"ALERT: {recent_alert}"
    
    cv2.putText(frame, "EXAM PROCTORING", (w//2 - 120, 30), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(frame, status_text, (w//2 - 100, 55), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, status_color, 1, cv2.LINE_AA)

    info_y = 30
    cv2.putText(frame, f"Gaze: {gaze_dir}", (10, info_y), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1, cv2.LINE_AA)
    cv2.putText(frame, f"Blinks: {exam_data['total_blinks']}", (10, info_y+20), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1, cv2.LINE_AA)
    cv2.putText(frame, f"Violations: {len(exam_data['violations'])}", (10, info_y+40), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 100, 100), 1, cv2.LINE_AA)

    elapsed = int(time.time() - exam_data['start_time'])
    mins = elapsed // 60
    secs = elapsed % 60
    cv2.putText(frame, f"{mins:02d}:{secs:02d}", (w - 70, 30), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1, cv2.LINE_AA)

    risk_color = (0, 255, 0) if exam_data['risk_score'] < 25 else (0, 165, 255) if exam_data['risk_score'] < 50 else (0, 0, 255)
    bar_w = 150
    bar_h = 12
    bar_x = w - bar_w - 10
    bar_y = 45
    risk_fill = min(int((exam_data['risk_score'] / 100.0) * bar_w), bar_w)
    cv2.rectangle(frame, (bar_x, bar_y), (bar_x+bar_w, bar_y+bar_h), (50, 50, 50), -1)
    cv2.rectangle(frame, (bar_x, bar_y), (bar_x+risk_fill, bar_y+bar_h), risk_color, -1)
    cv2.rectangle(frame, (bar_x, bar_y), (bar_x+bar_w, bar_y+bar_h), (150, 150, 150), 1)
    cv2.putText(frame, f"Risk: {exam_data['risk_score']}", (bar_x, bar_y - 5), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, (200, 200, 200), 1, cv2.LINE_AA)

    if num_faces > 1:
        cv2.putText(frame, "MULTIPLE PEOPLE DETECTED!", (w//2 - 180, h//2), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2, cv2.LINE_AA)
    
    if blink_event:
        cv2.circle(frame, (w - 25, h - 25), 8, (0, 255, 255), -1)

    draw_violation_text(frame, h, w)

    cv2.imshow("Exam Proctoring System", frame)
    key = cv2.waitKey(1) & 0xFF
    
    if key == ord('q'):
        print("Ending exam session...")
        break

save_exam_report()

try:
    if _audio_stream is not None:
        _audio_stream.stop()
        _audio_stream.close()
except Exception:
    pass

cap.release()
cv2.destroyAllWindows()
print("Exam monitoring ended.")