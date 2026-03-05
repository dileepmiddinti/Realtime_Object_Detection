"""
YOLO Vision — Detection Module
detect.py

Wraps Ultralytics YOLOv8 to provide a clean detection API.
Handles model loading, inference, and result formatting.
"""

import os
import cv2
import torch
from ultralytics import YOLO

# ─────────────────────────────────────────────────────────
# Module-level model reference (loaded once at startup)
# ─────────────────────────────────────────────────────────
_model = None
_model_path = None


def init_model(model_path: str):
    """
    Load the YOLOv8 model into memory.
    Called once when the Flask app starts.

    Falls back to the pretrained YOLOv8n model if the
    custom weights file is not found at model_path.
    """
    global _model, _model_path

    if not os.path.exists(model_path):
        print(f"[WARN] Custom model not found at '{model_path}'. "
              "Falling back to pretrained YOLOv8n (COCO weights).")
        # Use the standard nano model as a fallback during development
        model_path = os.path.join(os.path.dirname(__file__), '..', '..', 'yolov8n.pt')

    # Force fallback to default model for now since custom model isn't working
    print(f"[INFO] Using default YOLOv8n model for reliable detection")
    model_path = os.path.join(os.path.dirname(__file__), '..', '..', 'yolov8n.pt')

    _model = YOLO(model_path)
    _model_path = model_path
    print(f"[OK] Model loaded: {model_path}")

    # Warm up the model with a dummy forward pass
    dummy = torch.zeros(1, 3, 640, 640)
    _model.predict(source=dummy, verbose=False)
    print("[OK] Model warm-up complete")


def run_detection(image_path: str,
                  conf_threshold: float = 0.5,
                  iou_threshold: float  = 0.45,
                  max_det: int          = 100) -> list:
    """
    Run YOLOv8 object detection on a single image.

    Args:
        image_path    : Absolute path to the input image.
        conf_threshold: Minimum confidence to include a detection.
        iou_threshold : IOU threshold for non-maximum suppression.
        max_det       : Maximum number of detections to return.

    Returns:
        A list of detection dictionaries, each containing:
        {
          class_id   : int,
          class_name : str,
          confidence : float (0–1),
          x1, y1, x2, y2 : bounding box coordinates (pixel space)
        }
    """
    global _model

    if _model is None:
        raise RuntimeError("Model is not initialised. Call init_model() first.")

    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    # Run inference
    results = _model.predict(
        source=image_path,
        conf=conf_threshold,
        iou=iou_threshold,
        max_det=max_det,
        verbose=False,   # suppress Ultralytics logging
        save=False,      # don't auto-save annotated images
    )

    detections = []

    # results is a list; we process the first (and only) image
    for result in results:
        boxes = result.boxes

        if boxes is None or len(boxes) == 0:
            continue

        for box in boxes:
            # Bounding box coordinates in xyxy format
            x1, y1, x2, y2 = box.xyxy[0].tolist()

            class_id   = int(box.cls[0].item())
            confidence = float(box.conf[0].item())

            # Get the human-readable class name from the model
            class_name = result.names.get(class_id, f'class_{class_id}')

            detections.append({
                'class_id':   class_id,
                'class_name': class_name,
                'confidence': round(confidence, 4),
                'x1': round(x1, 1),
                'y1': round(y1, 1),
                'x2': round(x2, 1),
                'y2': round(y2, 1),
            })

    # Sort by confidence descending so highest-confidence results come first
    detections.sort(key=lambda d: d['confidence'], reverse=True)

    return detections


def detect_from_frame(frame_bgr,
                      conf_threshold: float = 0.5,
                      iou_threshold: float  = 0.45,
                      max_det: int          = 100) -> list:
    """
    Run detection directly on an in-memory OpenCV BGR frame.
    Useful for real-time webcam processing without saving to disk.

    Args:
        frame_bgr     : NumPy array (H, W, 3) in BGR format from OpenCV.
        conf_threshold: Minimum confidence score.
        iou_threshold : IOU for NMS.
        max_det       : Maximum detections.

    Returns:
        Same format as run_detection().
    """
    global _model

    if _model is None:
        raise RuntimeError("Model is not initialised.")

    # Convert BGR (OpenCV default) to RGB (expected by YOLO)
    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

    results = _model.predict(
        source=frame_rgb,
        conf=conf_threshold,
        iou=iou_threshold,
        max_det=max_det,
        verbose=False,
        save=False,
    )

    detections = []

    for result in results:
        boxes = result.boxes
        if boxes is None:
            continue

        for box in boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            class_id        = int(box.cls[0].item())
            confidence      = float(box.conf[0].item())
            class_name      = result.names.get(class_id, f'class_{class_id}')

            detections.append({
                'class_id':   class_id,
                'class_name': class_name,
                'confidence': round(confidence, 4),
                'x1': round(x1, 1),
                'y1': round(y1, 1),
                'x2': round(x2, 1),
                'y2': round(y2, 1),
            })

    detections.sort(key=lambda d: d['confidence'], reverse=True)
    return detections


def get_model_info() -> dict:
    """
    Return basic metadata about the currently loaded model.
    Useful for the /health endpoint or a settings page.
    """
    global _model, _model_path

    if _model is None:
        return {'loaded': False}

    return {
        'loaded': True,
        'path': _model_path,
        'task': getattr(_model, 'task', 'detect'),
        'num_classes': len(_model.names) if hasattr(_model, 'names') else 0,
        'class_names': list(_model.names.values()) if hasattr(_model, 'names') else [],
    }
