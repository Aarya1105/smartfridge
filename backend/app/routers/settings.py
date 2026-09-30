import json
import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.models import User, Zone, NotificationLog
from app.schemas import UserOut, UserUpdate, NotificationLogOut
from app.services import notification
from app.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["Settings & Notifications"])

@router.get("")
def get_user_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    zones = db.query(Zone).all()
    return {
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "full_name": current_user.full_name,
            "phone_number": current_user.phone_number,
            "email_notifications_enabled": current_user.email_notifications_enabled,
            "push_notifications_enabled": current_user.push_notifications_enabled,
            "sms_notifications_enabled": current_user.sms_notifications_enabled,
            "has_push_subscription": bool(current_user.push_subscription),
            "email_for_expiring": current_user.email_for_expiring,
            "email_for_expired": current_user.email_for_expired,
            "email_daily_digest": current_user.email_daily_digest,
            "push_for_expiring": current_user.push_for_expiring,
            "push_for_expired": current_user.push_for_expired,
            "push_for_temperature": current_user.push_for_temperature,
            "sms_for_critical": current_user.sms_for_critical,
            "alert_lead_days": current_user.alert_lead_days,
            "quiet_hours_start": current_user.quiet_hours_start,
            "quiet_hours_end": current_user.quiet_hours_end,
            "audit_day": current_user.audit_day,
            "audit_time": current_user.audit_time
        },
        "zones": [
            {
                "id": z.id,
                "name": z.name,
                "code": z.code,
                "target_temp_min": z.target_temp_min,
                "target_temp_max": z.target_temp_max,
                "target_humidity_min": z.target_humidity_min,
                "target_humidity_max": z.target_humidity_max,
                "description": z.description
            }
            for z in zones
        ]
    }

@router.put("")
def update_user_settings(
    settings_in: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    update_data = settings_in.dict(exclude_unset=True)
    for field, val in update_data.items():
        setattr(current_user, field, val)

    db.commit()
    db.refresh(current_user)
    return {"message": "Settings updated successfully", "user": current_user}

@router.get("/vapid-public-key")
def get_vapid_public_key():
    """
    Returns the VAPID Public Key for client-side PWA Push Subscription registration.
    """
    return {
        "public_key": settings.VAPID_PUBLIC_KEY,
        "enabled": settings.WEB_PUSH_ENABLED
    }

@router.post("/subscribe-push")
def subscribe_web_push(
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Stores or updates the Web Push (VAPID) subscription JSON from the React PWA service worker.
    """
    current_user.push_subscription = json.dumps(payload)
    current_user.push_notifications_enabled = True
    db.commit()
    return {"status": "subscribed", "message": "Device successfully registered for Web Push notifications"}

@router.post("/test-email")
async def send_test_email(
    recipient: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Dispatches a test HTML email through the primary email channel (SMTP / Resend / Brevo).
    """
    target_email = recipient or current_user.email
    if not target_email:
        raise HTTPException(status_code=400, detail="No email address specified")

    test_metadata = {
        "food_name": "Demo Organic Strawberries",
        "expiry_date": "Tomorrow",
        "status": "Expiring Soon",
        "image_url": "/api/static/samples/strawberry.jpg"
    }

    # Temporarily ensure user has this email for delivery
    user_copy = current_user
    if recipient:
        user_copy.email = recipient

    res = await notification.send(
        user=user_copy,
        title="Smart Fridge Test Email Alert",
        message="Your email notification service is active and verified! Expiring food alerts and daily digests will be delivered here.",
        channel="email",
        metadata=test_metadata,
        db=db
    )
    return {
        "status": "success",
        "channel": "email",
        "recipient": target_email,
        "result": res.get("email", {})
    }

@router.post("/test-push")
async def send_test_push(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Dispatches a test Web Push notification to the registered browser PWA service worker.
    """
    if not current_user.push_subscription:
        raise HTTPException(
            status_code=400,
            detail="No Web Push subscription found for this account. Click 'Enable Phone Notifications' first."
        )

    res = await notification.send(
        user=current_user,
        title="Smart Fridge Web Push 🔔",
        message="Web Push notification test successful! Your phone/browser is now linked.",
        channel="web_push",
        metadata={"action_url": f"{settings.APP_URL}/foods"},
        db=db
    )
    return {
        "status": "success",
        "channel": "web_push",
        "result": res.get("web_push", {})
    }

@router.post("/test-sms")
async def send_test_sms(
    phone_number: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Dispatches a test SMS notification (<160 chars) via Twilio or Fast2SMS.
    """
    target_phone = phone_number or current_user.phone_number
    if not target_phone:
        raise HTTPException(status_code=400, detail="No phone number configured")

    user_copy = current_user
    if phone_number:
        user_copy.phone_number = phone_number

    res = await notification.send(
        user=user_copy,
        title="Smart Fridge",
        message="Test alert: Smart Fridge SMS alerts are working.",
        channel="sms",
        db=db
    )
    return {
        "status": "success",
        "channel": "sms",
        "recipient": target_phone,
        "result": res.get("sms", {})
    }

@router.get("/notifications-log", response_model=List[NotificationLogOut])
def get_notification_logs(
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns history of sent and attempted notifications with retry count, error status, and timestamp.
    """
    logs = db.query(NotificationLog).filter(
        NotificationLog.user_id == current_user.id
    ).order_by(NotificationLog.created_at.desc()).limit(limit).all()
    return logs
