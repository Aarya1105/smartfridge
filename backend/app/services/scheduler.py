import logging
from datetime import datetime, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from app.database import SessionLocal
from app.services.sensor_simulator import update_sensor_readings
from app.services.alert_engine import run_all_alert_rules
from app.services import notification
from app.models import User, FoodItem

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

def job_update_sensors():
    db = SessionLocal()
    try:
        update_sensor_readings(db)
    except Exception as e:
        logger.error(f"Error in sensor simulator job: {e}")
    finally:
        db.close()


async def job_check_alerts():
    db = SessionLocal()
    try:
        await run_all_alert_rules(db)
    except Exception as e:
        logger.error(f"Error in alert rules job: {e}")
    finally:
        db.close()


async def job_daily_digest_8am():
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.is_active == True).all()
        now = datetime.utcnow()
        for user in users:
            if not (user.email and user.email_daily_digest and user.email_notifications_enabled):
                continue
            lead_date = now + timedelta(days=user.alert_lead_days)
            expiring_items = db.query(FoodItem).filter(
                FoodItem.user_id == user.id,
                FoodItem.is_used == False,
                FoodItem.is_discarded == False,
                FoodItem.expiry_date <= lead_date
            ).all()

            if expiring_items:
                digest_items = []
                for item in expiring_items:
                    days_left = max(0, int((item.expiry_date - now).total_seconds() / 86400))
                    zone_name = item.zone.name if item.zone else "Fridge"
                    digest_items.append({
                        "id": item.id,
                        "name": item.name,
                        "zone": zone_name,
                        "days_left": days_left
                    })
                await notification.send_daily_digest(user, digest_items, db=db)
    except Exception as e:
        logger.error(f"Error in daily digest job: {e}")
    finally:
        db.close()


async def job_weekly_audit_reminder():
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.is_active == True).all()
        for user in users:
            await notification.send(
                user=user,
                title="Weekly Fridge Audit Reminder 📸",
                message="It's Sunday! Take 2-5 photos of your fridge shelves to verify inventory and freshness.",
                channel="all",
                db=db
            )
    except Exception as e:
        logger.error(f"Error in weekly audit reminder job: {e}")
    finally:
        db.close()


def start_scheduler():
    # 1. Update sensors every 30 seconds
    scheduler.add_job(job_update_sensors, IntervalTrigger(seconds=30), id="sensor_sim", replace_existing=True)

    # 2. Hourly check for critical alerts
    scheduler.add_job(job_check_alerts, IntervalTrigger(hours=1), id="hourly_alerts", replace_existing=True)

    # 3. Daily 8:00 AM main alert run & Daily Digest email
    scheduler.add_job(job_check_alerts, CronTrigger(hour=8, minute=0), id="daily_8am_alerts", replace_existing=True)
    scheduler.add_job(job_daily_digest_8am, CronTrigger(hour=8, minute=0), id="daily_8am_digest", replace_existing=True)

    # 4. Weekly Sunday audit reminder at 10:00 AM
    scheduler.add_job(job_weekly_audit_reminder, CronTrigger(day_of_week="sun", hour=10, minute=0), id="weekly_audit", replace_existing=True)

    scheduler.start()
    logger.info("APScheduler background jobs started successfully.")

def shutdown_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("APScheduler stopped.")

