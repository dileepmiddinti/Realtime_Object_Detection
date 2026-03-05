# YOLO Vision — Real-Time Object Detection Dashboard
### Final Year Project — YOLOv8 + Flask + SQLite

---

## Project Structure

```
project/
├── frontend/
│   ├── index.html       ← Main dashboard UI
│   ├── style.css        ← Dark theme styles
│   └── script.js        ← Frontend logic & API calls
│
├── backend/
│   ├── app.py           ← Flask API server
│   └── detect.py        ← YOLOv8 detection module
│
├── model/
│   └── best.pt          ← Your trained YOLOv8 weights (place here)
│
├── database/
│   └── detections.db    ← Auto-created SQLite database
│
├── uploads/             ← Auto-created folder for saved images
└── requirements.txt
```

---

## How to Run in Visual Studio Code

### Prerequisites
- Python 3.9 or higher
- Node.js (optional, only needed for Live Server extension)
- VS Code with the following extensions:
  - **Python** (Microsoft)
  - **Live Server** (Ritwick Dey)

---

### STEP 1 — Open the Project in VS Code

```bash
# Clone or download the project, then open the folder in VS Code:
File → Open Folder → select the "project" folder
```

---

### STEP 2 — Set Up Python Virtual Environment

Open the integrated terminal in VS Code (`Ctrl + `` ` ``):

```bash
# Create a virtual environment
python -m venv venv

# Activate it
# On Windows:
venv\Scripts\activate

# On macOS / Linux:
source venv/bin/activate
```

---

### STEP 3 — Install Python Dependencies

```bash
pip install -r requirements.txt
```

This installs: `ultralytics`, `flask`, `flask-cors`, `opencv-python`, `torch`, `Pillow`, `numpy`.

> **Note:** PyTorch installation may take a few minutes depending on your internet speed.

---

### STEP 4 — Add Your YOLOv8 Model Weights

Place your trained YOLOv8 weights file at:
```
project/model/best.pt
```

**If you don't have a trained model yet:**
The app will automatically fall back to the pretrained `yolov8n.pt` (COCO 80-class model) for development and testing. Ultralytics will download it automatically on first run.

---

### STEP 5 — Start the Flask Backend

In VS Code terminal (with venv activated):

```bash
cd backend
python app.py
```

You should see:
```
[*] Initialising database...
[DB] Database initialised at: .../database/detections.db
[*] Loading YOLOv8 model from: .../model/best.pt
[OK] Model loaded: yolov8n.pt
[OK] Model warm-up complete
[*] Starting Flask server on http://127.0.0.1:5000
```

**Keep this terminal running.**

---

### STEP 6 — Launch the Frontend

1. In VS Code Explorer, right-click on `frontend/index.html`
2. Select **"Open with Live Server"**
3. Your browser will open at `http://127.0.0.1:5500/frontend/index.html`

**Alternatively**, open `frontend/index.html` directly in Chrome/Firefox — most features work without a server since API calls go to `http://127.0.0.1:5000`.

---

## Using the Dashboard

### Upload Image Detection
1. Click the **Upload Image** card on the Dashboard
2. Select any JPG, PNG, or WEBP image
3. Click the green **Run Detection** button
4. View detected objects with confidence bars and bounding boxes

### Live Webcam Detection
1. Click the **Live Webcam** card
2. Allow browser camera access when prompted
3. Click **Run Detection** to capture and analyse the current frame
4. Repeat to track objects in real-time

### Detection History
- Click **History** in the sidebar
- View all past detections with thumbnails, class tags, and timestamps
- Search by class name or filter by dropdown
- Click **Export CSV** to download all records

### Analytics
- Click **Analytics** to see class distribution, confidence histogram, and detections-over-time charts

### Settings
- Adjust confidence threshold, IOU threshold, and max detections
- Change backend URL if deploying remotely

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/detect-image` | Upload image file for detection |
| POST | `/webcam-detect` | Submit webcam frame for detection |
| GET | `/history` | Fetch all detection records |
| DELETE | `/history/<id>` | Delete a record by ID |
| GET | `/uploads/<filename>` | Serve saved image files |
| GET | `/health` | Backend health check |

---

## Database Schema

**Table: `detections`**

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Auto-increment primary key |
| image_path | TEXT | Path to saved image file |
| detected_objects | TEXT | JSON array of class names |
| confidence_scores | TEXT | JSON array of confidence values |
| timestamp | TEXT | ISO 8601 UTC timestamp |

---

## Troubleshooting

**Backend connection refused:**
- Make sure `python app.py` is running
- Check that port 5000 is not blocked by firewall or antivirus

**Model not loading:**
- Ensure the virtual environment is activated before running `app.py`
- Re-run `pip install -r requirements.txt`

**Webcam not starting:**
- Browser requires HTTPS or localhost to access the camera
- Use Live Server (`http://127.0.0.1:5500`) rather than opening the HTML directly as `file://`

**No bounding boxes drawn:**
- The canvas overlay is scaled to the preview container. Resize the window or reload if boxes appear offset.

---

## Built With
- **YOLOv8** by Ultralytics
- **Flask** — Python web framework
- **SQLite** — Embedded database
- **Chart.js** — Analytics charts
- **Syne + DM Mono** — Google Fonts
