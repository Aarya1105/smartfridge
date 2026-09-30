import os
import uuid
import shutil
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from app.config import settings
from app.services.ocr_service import extract_expiry_date
from app.models import User
from app.security import get_current_user

router = APIRouter(prefix="/ocr", tags=["OCR Expiry Detection"])

@router.post("/expiry")
async def read_expiry_from_photo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    unique_filename = f"ocr_{uuid.uuid4().hex}_{file.filename}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        parsed_date, label, confidence = extract_expiry_date(file_path)
        return {
            "expiry_date": parsed_date,
            "detected_text": label,
            "confidence": confidence,
            "success": parsed_date is not None
        }
    finally:
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass
