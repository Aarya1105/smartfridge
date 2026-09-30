import os
import uuid
import shutil
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.models import FoodImage, User
from app.schemas import PredictionResponse
from app.services.ml_inference import ml_service
from app.security import get_current_user

router = APIRouter(prefix="/predict", tags=["AI Recognition"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

@router.post("", response_model=PredictionResponse)
async def predict_freshness(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed extensions: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Generate unique filename
    unique_filename = f"{uuid.uuid4().hex}_{file.filename}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        # Run ML inference
        pred_res = ml_service.predict(file_path, db)

        top_pred = pred_res["top_prediction"]

        # Record in FoodImage for dataset tracking and retraining loop
        food_img = FoodImage(
            path=f"/storage/uploads/{unique_filename}",
            predicted_label=top_pred["item_name"],
            predicted_freshness=top_pred["freshness_class"],
            confidence=top_pred["confidence"],
            split="pending"
        )
        db.add(food_img)
        db.commit()
        db.refresh(food_img)

        return pred_res
    except Exception as e:
        # If error occurs, remove the uploaded file
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Image prediction failed: {str(e)}")
