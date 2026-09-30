import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from app.models import User, FoodItem, Alert, Zone, ShelfLifeDefault
from app.services.notification import send as send_notification

logger = logging.getLogger(__name__)

ETHYLENE_PRODUCERS = {"apple", "banana", "tomato", "avocado"}
ETHYLENE_SENSITIVE = {"lettuce", "coriander", "capsicum", "strawberry", "spinach"}

def should_skip_quiet_hours(user: User) -> bool:
    """
    Checks if current local time falls into user's quiet hours (e.g. 22:00 to 07:00).
    """
    now = datetime.utcnow()
    current_time_str = now.strftime("%H:%M")
    
    start = user.quiet_hours_start or "22:00"
    end = user.quiet_hours_end or "07:00"

    if start > end:  # overnight, e.g. 22:00 to 07:00
        return current_time_str >= start or current_time_str < end
    else:
        return start <= current_time_str < end


def alert_already_exists(db: Session, user_id: int, alert_type: str, food_item_id: int = None, zone_id: int = None) -> bool:
    """
    Prevents duplicate alerts within 24 hours for the same item/zone and alert type.
    """
    cutoff = datetime.utcnow() - timedelta(hours=24)
    query = db.query(Alert).filter(
        Alert.user_id == user_id,
        Alert.alert_type == alert_type,
        Alert.created_at >= cutoff
    )
    if food_item_id:
        query = query.filter(Alert.food_item_id == food_item_id)
    if zone_id:
        query = query.filter(Alert.zone_id == zone_id)
        
    return query.first() is not None


async def evaluate_food_alerts(db: Session, user: User) -> List[Alert]:
    """
    Evaluates all food items for a user against expiry and freshness rules.
    """
    now = datetime.utcnow()
    lead_days = user.alert_lead_days or 2
    created_alerts = []

    active_foods = db.query(FoodItem).filter(
        FoodItem.user_id == user.id,
        FoodItem.is_used == False,
        FoodItem.is_discarded == False
    ).all()

    for food in active_foods:
        days_in_fridge = (now - food.added_at).days if food.added_at else 0
        time_to_expiry = food.expiry_date - now
        days_until_expiry = time_to_expiry.total_seconds() / 86400.0

        # Retrieve typical shelf life default
        shelf_def = db.query(ShelfLifeDefault).filter(ShelfLifeDefault.item_name == food.name.lower()).first()
        typical_shelf = shelf_def.typical_shelf_life_days if shelf_def else 7

        # 1. PACKAGED FOOD RULES
        if food.item_type == "packaged":
            if days_until_expiry < 0:
                # Expired
                alert_type = "Expired / Remove Now"
                if not alert_already_exists(db, user.id, alert_type, food_item_id=food.id):
                    alert = Alert(
                        user_id=user.id,
                        food_item_id=food.id,
                        zone_id=food.zone_id,
                        alert_type=alert_type,
                        severity="critical",
                        title=f"{food.name} has Expired!",
                        message=f"{food.name} expired on {food.expiry_date.strftime('%b %d, %Y')}. Please remove it immediately to avoid spoilage.",
                        channel_sent="email,push"
                    )
                    db.add(alert)
                    created_alerts.append(alert)
                    food.freshness_status = "Expired"

            elif days_until_expiry <= lead_days:
                # Expiring soon
                alert_type = "Expiring Soon"
                if not alert_already_exists(db, user.id, alert_type, food_item_id=food.id):
                    days_int = max(0, int(days_until_expiry))
                    alert = Alert(
                        user_id=user.id,
                        food_item_id=food.id,
                        zone_id=food.zone_id,
                        alert_type=alert_type,
                        severity="warning",
                        title=f"{food.name} Expiring Soon",
                        message=f"{food.name} will expire in {days_int} day{'s' if days_int!=1 else ''} ({food.expiry_date.strftime('%b %d')}). Plan to use it soon!",
                        channel_sent="email,push"
                    )
                    db.add(alert)
                    created_alerts.append(alert)
                    food.freshness_status = "Expiring Soon"

        # 2. FRUITS / VEGETABLES RULES
        else:
            # Check Rotten or past shelf life
            is_rotten = food.freshness_status in ["Rotten", "Expired"] or days_until_expiry < 0
            
            # Safety Rule: if status is Fresh but days in fridge exceeds typical shelf life, override!
            if food.freshness_status == "Fresh" and days_in_fridge > typical_shelf:
                food.freshness_status = "Expiring Soon"

            if is_rotten:
                alert_type = "Expired / Remove Now"
                if not alert_already_exists(db, user.id, alert_type, food_item_id=food.id):
                    alert = Alert(
                        user_id=user.id,
                        food_item_id=food.id,
                        zone_id=food.zone_id,
                        alert_type=alert_type,
                        severity="critical",
                        title=f"{food.name} Spoiled / Remove Now",
                        message=f"This {food.name} is no longer usable. Remove it from the fridge immediately to keep other foods safe.",
                        channel_sent="email,push"
                    )
                    db.add(alert)
                    created_alerts.append(alert)
                    food.freshness_status = "Rotten"

            elif food.freshness_status in ["Ripe", "Overripe", "Expiring Soon"] or days_until_expiry <= lead_days:
                alert_type = "Expiring Soon"
                if not alert_already_exists(db, user.id, alert_type, food_item_id=food.id):
                    status_note = f"State: {food.freshness_status}."
                    alert = Alert(
                        user_id=user.id,
                        food_item_id=food.id,
                        zone_id=food.zone_id,
                        alert_type=alert_type,
                        severity="warning",
                        title=f"{food.name} Needs Attention",
                        message=f"{food.name} is {food.freshness_status.lower()}. Use soon within {max(1, int(days_until_expiry))} day(s) before it spoils.",
                        channel_sent="email,push"
                    )
                    db.add(alert)
                    created_alerts.append(alert)

    db.commit()
    return created_alerts


async def evaluate_compatibility_alerts(db: Session, user: User) -> List[Alert]:
    """
    Checks each zone for ethylene producers stored with ethylene sensitive items.
    """
    created_alerts = []
    zones = db.query(Zone).all()

    for zone in zones:
        zone_foods = db.query(FoodItem).filter(
            FoodItem.zone_id == zone.id,
            FoodItem.user_id == user.id,
            FoodItem.is_used == False,
            FoodItem.is_discarded == False
        ).all()

        producers = [f for f in zone_foods if f.name.lower() in ETHYLENE_PRODUCERS]
        sensitive = [f for f in zone_foods if f.name.lower() in ETHYLENE_SENSITIVE]

        if producers and sensitive:
            alert_type = "Compatibility Warning"
            if not alert_already_exists(db, user.id, alert_type, zone_id=zone.id):
                p_names = ", ".join(set([p.name for p in producers]))
                s_names = ", ".join(set([s.name for s in sensitive]))
                alert = Alert(
                    user_id=user.id,
                    zone_id=zone.id,
                    alert_type=alert_type,
                    severity="warning",
                    title=f"Ethylene Gas Warning in {zone.name}",
                    message=f"Ethylene producer ({p_names}) is stored alongside sensitive items ({s_names}) in {zone.name}. This accelerates decay! Separate them into different shelves.",
                    channel_sent="in_app"
                )
                db.add(alert)
                created_alerts.append(alert)

    db.commit()
    return created_alerts


async def evaluate_temperature_alerts(db: Session, user: User) -> List[Alert]:
    """
    Checks if any zone temperature or humidity is in critical bounds.
    """
    created_alerts = []
    zones = db.query(Zone).all()

    for zone in zones:
        if zone.status in ["critical", "warning"]:
            alert_type = "Temperature Warning"
            if not alert_already_exists(db, user.id, alert_type, zone_id=zone.id):
                is_crit = zone.status == "critical"
                alert = Alert(
                    user_id=user.id,
                    zone_id=zone.id,
                    alert_type=alert_type,
                    severity="critical" if is_crit else "warning",
                    title=f"Zone Alert: {zone.name} is {zone.status.upper()}",
                    message=f"{zone.name} sensor reading is {zone.current_temp}°C ({zone.current_humidity}% RH). Target: {zone.target_temp_min}-{zone.target_temp_max}°C. Check fridge door or thermostat.",
                    channel_sent="email,push,sms" if is_crit else "in_app"
                )
                db.add(alert)
                created_alerts.append(alert)

    db.commit()
    return created_alerts


async def run_all_alert_rules(db: Session):
    """
    Master runner for scheduled daily and hourly alert checks.
    """
    users = db.query(User).filter(User.is_active == True).all()
    for user in users:
        is_quiet = should_skip_quiet_hours(user)

        food_alerts = await evaluate_food_alerts(db, user)
        compat_alerts = await evaluate_compatibility_alerts(db, user)
        temp_alerts = await evaluate_temperature_alerts(db, user)

        all_new = food_alerts + compat_alerts + temp_alerts
        logger.info(f"Alert engine generated {len(all_new)} alerts for user {user.email}")

        # Send notifications via Email, Web Push, and SMS if not in quiet hours (or if critical)
        for alert in all_new:
            if alert.severity == "critical" or not is_quiet:
                metadata = {}
                if alert.food_item_id:
                    food = db.query(FoodItem).get(alert.food_item_id)
                    if food:
                        metadata = {
                            "food_name": food.name,
                            "expiry_date": food.expiry_date.strftime("%b %d, %Y") if food.expiry_date else "Soon",
                            "status": food.freshness_status,
                            "image_url": food.image_path,
                            "food_item_id": food.id
                        }
                await send_notification(
                    user=user,
                    title=alert.title,
                    message=alert.message,
                    channel="all",
                    metadata=metadata,
                    db=db
                )
