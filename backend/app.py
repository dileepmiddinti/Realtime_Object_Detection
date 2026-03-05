"""
YOLO Vision — Flask Backend API
app.py

Endpoints:
  POST /detect-image   — Run YOLOv8 detection on an uploaded image
  POST /webcam-detect  — Run YOLOv8 detection on a webcam frame
  GET  /history        — Fetch all detection history from SQLite
  DELETE /history/<id> — Delete a specific record
  GET  /uploads/<file> — Serve uploaded images to frontend

Run with:
  python app.py
"""

import os
import json
import sqlite3
from datetime import datetime

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

from detect import run_detection, init_model

# ─────────────────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────────────────
app = Flask(__name__)

# Allow requests from the frontend (adjust origin in production)
CORS(app, origins=["http://localhost:8000", "http://127.0.0.1:8000",
                   "http://localhost:5500", "http://127.0.0.1:5500",
                   "http://localhost:3000", "*"],
     supports_credentials=True)

# Folders
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, '..', 'uploads')
DB_PATH       = os.path.join(BASE_DIR, '..', 'database', 'detections.db')
MODEL_PATH    = os.path.join(BASE_DIR, '..', 'model', 'best.pt')

# If custom model doesn't exist or fails, use default YOLOv8n
if not os.path.exists(MODEL_PATH):
    MODEL_PATH = os.path.join(BASE_DIR, '..', '..', 'yolov8n.pt')  # Use default COCO model

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024  # 32 MB max upload

# Allowed image extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'bmp'}


# ─────────────────────────────────────────────────────────
# Database initialisation
# ─────────────────────────────────────────────────────────
def init_db():
    """Create the detections table if it doesn't already exist."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS detections (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            image_path       TEXT,
            detected_objects TEXT,
            confidence_scores TEXT,
            timestamp        TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()
    print("[DB] Database initialised at:", DB_PATH)


def save_detection(image_path, detected_objects, confidence_scores):
    """Insert a single detection result row into SQLite."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO detections (image_path, detected_objects, confidence_scores, timestamp)
        VALUES (?, ?, ?, ?)
    """, (
        image_path,
        json.dumps(detected_objects),
        json.dumps(confidence_scores),
        datetime.utcnow().isoformat()
    ))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id


# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────
def allowed_file(filename):
    """Check that the uploaded file has an allowed extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def parse_thresholds(form):
    """Safely parse confidence / IOU thresholds from a form submission."""
    try:
        conf = float(form.get('conf_threshold', 0.5))
        iou  = float(form.get('iou_threshold',  0.45))
        max_det = int(form.get('max_det', 100))
    except (ValueError, TypeError):
        conf, iou, max_det = 0.5, 0.45, 100
    # Clamp to valid ranges
    conf = max(0.01, min(conf, 1.0))
    iou  = max(0.01, min(iou,  1.0))
    max_det = max(1, min(max_det, 1000))
    return conf, iou, max_det


# ─────────────────────────────────────────────────────────
# ROUTE: POST /detect-image
# Accepts a multipart/form-data upload with key "image"
# ─────────────────────────────────────────────────────────
@app.route('/detect-image', methods=['POST'])
def detect_image():
    print("[DEBUG] /detect-image endpoint called")
    if 'image' not in request.files:
        print("[ERROR] No image file in request")
        return jsonify({'error': 'No image file provided in request'}), 400

    file = request.files['image']
    if file.filename == '':
        print("[ERROR] Empty filename")
        return jsonify({'error': 'Empty filename'}), 400

    if not allowed_file(file.filename):
        print(f"[ERROR] File type not allowed: {file.filename}")
        return jsonify({'error': 'File type not allowed. Use PNG, JPG, JPEG, WEBP.'}), 400

    # Save uploaded file with a timestamped name to avoid collisions
    timestamp_str = datetime.utcnow().strftime('%Y%m%d_%H%M%S_%f')
    ext = file.filename.rsplit('.', 1)[1].lower()
    safe_filename = f"upload_{timestamp_str}.{ext}"
    save_path = os.path.join(app.config['UPLOAD_FOLDER'], safe_filename)
    file.save(save_path)
    print(f"[DEBUG] Saved image to: {save_path}")

    conf, iou, max_det = parse_thresholds(request.form)
    print(f"[DEBUG] Parameters: conf={conf}, iou={iou}, max_det={max_det}")

    # Run YOLOv8 detection
    detections = run_detection(save_path, conf_threshold=conf, iou_threshold=iou, max_det=max_det)
    print(f"[DEBUG] Detection results: {len(detections)} objects found")

    # Extract object names and confidence values for database storage
    object_names = [d['class_name'] for d in detections]
    conf_values  = [d['confidence'] for d in detections]

    # Save result to database
    record_id = save_detection(safe_filename, object_names, conf_values)

    return jsonify({
        'success': True,
        'record_id': record_id,
        'image_path': safe_filename,
        'detection_count': len(detections),
        'detections': detections,
    })


# ─────────────────────────────────────────────────────────
# ROUTE: POST /webcam-detect
# Accepts a JPEG frame blob from the webcam canvas capture
# ─────────────────────────────────────────────────────────
@app.route('/webcam-detect', methods=['POST'])
def webcam_detect():
    if 'image' not in request.files:
        return jsonify({'error': 'No image frame provided'}), 400

    file = request.files['image']

    # Save webcam frame temporarily
    timestamp_str = datetime.utcnow().strftime('%Y%m%d_%H%M%S_%f')
    save_path = os.path.join(app.config['UPLOAD_FOLDER'], f"webcam_{timestamp_str}.jpg")
    file.save(save_path)

    conf, iou, max_det = parse_thresholds(request.form)

    # Run detection on the captured frame
    detections = run_detection(save_path, conf_threshold=conf, iou_threshold=iou, max_det=max_det)

    # Save result to database
    object_names = [d['class_name'] for d in detections]
    conf_values  = [d['confidence'] for d in detections]
    record_id    = save_detection(f"webcam_{timestamp_str}.jpg", object_names, conf_values)

    return jsonify({
        'success': True,
        'record_id': record_id,
        'image_path': f"webcam_{timestamp_str}.jpg",
        'detection_count': len(detections),
        'detections': detections,
    })


# ─────────────────────────────────────────────────────────
# ROUTE: GET /history
# Returns all detection records, most recent first
# ─────────────────────────────────────────────────────────
@app.route('/history', methods=['GET'])
def get_history():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # return dict-like rows
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM detections ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()

    records = []
    for row in rows:
        records.append({
            'id':               row['id'],
            'image_path':       row['image_path'],
            'detected_objects': json.loads(row['detected_objects'] or '[]'),
            'confidence_scores': json.loads(row['confidence_scores'] or '[]'),
            'timestamp':        row['timestamp'],
        })

    return jsonify({'history': records, 'count': len(records)})


# ─────────────────────────────────────────────────────────
# ROUTE: DELETE /history/<id>
# Remove a specific record from the database
# ─────────────────────────────────────────────────────────
@app.route('/history/<int:record_id>', methods=['DELETE'])
def delete_history(record_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM detections WHERE id = ?", (record_id,))
    deleted = cursor.rowcount
    conn.commit()
    conn.close()

    if deleted == 0:
        return jsonify({'error': 'Record not found'}), 404

    return jsonify({'success': True, 'deleted_id': record_id})


# ─────────────────────────────────────────────────────────
# ROUTE: GET /uploads/<filename>
# Serve saved images back to the frontend (for history thumbnails)
# ─────────────────────────────────────────────────────────
@app.route('/uploads/<path:filename>', methods=['GET'])
def serve_upload(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


# ─────────────────────────────────────────────────────────
# ROUTE: GET /health
# Simple health check endpoint
# ─────────────────────────────────────────────────────────
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok', 'model': MODEL_PATH})


# ─────────────────────────────────────────────────────────
# Startup
# ─────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("[*] Initialising database...")
    init_db()

    print(f"[*] Loading YOLOv8 model from: {MODEL_PATH}")
    init_model(MODEL_PATH)

    print("[*] Starting Flask server on http://127.0.0.1:5000")
    app.run(debug=True, host='127.0.0.1', port=5000)
