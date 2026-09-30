from pydantic_settings import BaseSettings
from typing import Optional
import os

class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Fridge"
    API_V1_STR: str = "/api"
    SECRET_KEY: str = "smart_fridge_super_secret_jwt_key_2026_change_in_prod"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    APP_URL: str = "http://localhost:5173"
    
    # Database: Default to SQLite file if Postgres is not specified
    DATABASE_URL: str = "sqlite:///./smart_fridge.db"
    
    # 1. Email Provider Config (SMTP / Resend / Brevo)
    EMAIL_PROVIDER: str = "smtp"  # 'smtp', 'resend', or 'brevo'
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = "smartfridge843@gmail.com"
    SMTP_PASSWORD: Optional[str] = None
    EMAILS_FROM_NAME: str = "Smart Fridge Assistant"
    EMAILS_FROM_EMAIL: str = "smartfridge843@gmail.com"
    EMAIL_FROM: Optional[str] = "smartfridge843@gmail.com"
    RESEND_API_KEY: Optional[str] = None
    BREVO_API_KEY: Optional[str] = None
    
    # 2. Web Push (VAPID) Config
    WEB_PUSH_ENABLED: bool = True
    VAPID_PUBLIC_KEY: str = "BKHP_lRxFvV3_MOAYFSLq5gpWbxxwB9NH6lZDPgHsAU6zhujqyRYy1cs6-P-E8WAhUV6GvVlVCG07TgpNz7BjIk"
    VAPID_PRIVATE_KEY: str = "1hwwXkj035YuZW4m53khj2jaK0j211AG5zPk4WXZdKU"
    VAPID_CLAIM_EMAIL: str = "admin@smartfridge.local"
    
    # 3. SMS Provider Config (Twilio / Fast2SMS)
    SMS_ENABLED: bool = False
    SMS_PROVIDER: str = "twilio"  # 'twilio' or 'fast2sms'
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_FROM_NUMBER: Optional[str] = None
    FAST2SMS_API_KEY: Optional[str] = None
    FAST2SMS_DLT_TE_ID: Optional[str] = None
    
    # Kaggle Credentials for Dataset Downloads
    KAGGLE_USERNAME: Optional[str] = None
    KAGGLE_KEY: Optional[str] = None
    
    # Storage Paths
    STORAGE_DIR: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "storage"))
    UPLOAD_DIR: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "storage", "uploads"))
    FOOD_IMG_DIR: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "storage", "foods"))
    AUDIT_IMG_DIR: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "storage", "audit"))
    
    # ML Model Path
    MODEL_PATH: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "ml", "models", "best_model.pth"))
    
    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()

# Ensure directories exist
os.makedirs(settings.STORAGE_DIR, exist_ok=True)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.FOOD_IMG_DIR, exist_ok=True)
os.makedirs(settings.AUDIT_IMG_DIR, exist_ok=True)
