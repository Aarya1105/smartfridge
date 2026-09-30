from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Alert, User
from app.schemas import AlertOut
from app.services.alert_engine import evaluate_food_alerts, evaluate_compatibility_alerts, evaluate_temperature_alerts
from app.services import notification
from app.security import get_current_user

router = APIRouter(prefix="/alerts", tags=["Alerts & Notifications"])

def serialize_alert(a: Alert) -> dict:
    return {
        "id": a.id,
        "food_item_id": a.food_item_id,
        "food_item_name": a.food_item.name if a.food_item else None,
        "zone_id": a.zone_id,
        "zone_name": a.zone.name if a.zone else None,
        "alert_type": a.alert_type,
        "severity": a.severity,
        "title": a.title,
        "message": a.message,
        "is_read": a.is_read,
        "channel_sent": a.channel_sent,
        "created_at": a.created_at
    }

@router.get("", response_model=List[AlertOut])
def get_alerts(
    alert_type: Optional[str] = None,
    is_read: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Alert).filter(Alert.user_id == current_user.id)
    if alert_type:
        query = query.filter(Alert.alert_type == alert_type)
    if is_read is not None:
        query = query.filter(Alert.is_read == is_read)

    alerts = query.order_by(Alert.created_at.desc()).all()
    return [serialize_alert(a) for a in alerts]

@router.put("/{alert_id}/read")
def mark_alert_read(alert_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id, Alert.user_id == current_user.id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_read = True
    db.commit()
    return {"message": "Alert marked as read"}

@router.put("/read-all")
def mark_all_read(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Alert).filter(Alert.user_id == current_user.id, Alert.is_read == False).update({"is_read": True})
    db.commit()
    return {"message": "All alerts marked as read"}

@router.delete("/{alert_id}")
def delete_alert(alert_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id, Alert.user_id == current_user.id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    db.delete(alert)
    db.commit()
    return {"message": "Alert deleted"}

@router.post("/evaluate")
async def trigger_alert_evaluation(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f_alerts = await evaluate_food_alerts(db, current_user)
    c_alerts = await evaluate_compatibility_alerts(db, current_user)
    t_alerts = await evaluate_temperature_alerts(db, current_user)
    total_new = len(f_alerts) + len(c_alerts) + len(t_alerts)
    return {
        "status": "success",
        "new_alerts_count": total_new,
        "message": f"Evaluated alert rules. {total_new} new alert(s) generated."
    }

@router.post("/test-notification")
async def send_test_notification(
    channel: str = Query("all", description="Channel: email, web_push, sms, or all"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    res = await notification.send(
        user=current_user,
        title="Smart Fridge Test Alert ✅",
        message="This is a test notification from your Smart Refrigerator Assistant. Alerts for expiring foods, gas compatibility, and temperature will arrive here!",
        channel=channel,
        db=db
    )
    return {
        "status": "success",
        "channel": channel,
        "results": res
    }
