import json
import logging
import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

import httpx
from sqlalchemy.orm import Session
from app.config import settings
from app.models import User, NotificationLog

logger = logging.getLogger(__name__)

# ==============================================================================
# 1. HTML Email Templates & Rendering
# ==============================================================================

def render_alert_email_html(title: str, message: str, metadata: Optional[Dict[str, Any]] = None) -> str:
    metadata = metadata or {}
    food_name = metadata.get("food_name", "Pantry Item")
    expiry_date = metadata.get("expiry_date", "Soon")
    status = metadata.get("status", "Attention")
    image_url = metadata.get("image_url")
    food_id = metadata.get("food_item_id")
    action_url = metadata.get("action_url") or f"{settings.APP_URL}/foods"
    if food_id:
        action_url = f"{settings.APP_URL}/foods?action=mark_used&id={food_id}"

    status_color = "#f43f5e" if status in ["Expired", "Rotten"] else "#f59e0b" if status in ["Expiring Soon", "Ripe", "Overripe"] else "#22c55e"
    status_bg = "#fff1f2" if status in ["Expired", "Rotten"] else "#fef3c7" if status in ["Expiring Soon", "Ripe", "Overripe"] else "#f0fdf4"

    img_html = ""
    if image_url:
        full_img_url = image_url if image_url.startswith("http") else f"{settings.APP_URL}{image_url}"
        img_html = f'''
        <div style="text-align: center; margin: 16px 0;">
            <img src="{full_img_url}" alt="{food_name}" style="max-width: 220px; max-height: 180px; border-radius: 12px; object-fit: cover; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.06);" />
        </div>
        '''

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
            .container {{ max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }}
            .header {{ background: linear-gradient(135deg, #16a34a, #22c55e); padding: 28px 24px; text-align: center; color: white; }}
            .header h1 {{ margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }}
            .header p {{ margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; }}
            .content {{ padding: 24px; }}
            .alert-card {{ background: #f8fafc; border-radius: 14px; padding: 18px; border: 1px solid #e2e8f0; margin-bottom: 20px; }}
            .status-badge {{ display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; color: {status_color}; background-color: {status_bg}; }}
            .btn {{ display: block; text-align: center; background: #22c55e; color: #ffffff !important; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 700; text-decoration: none; box-shadow: 0 2px 10px rgba(34, 197, 94, 0.3); }}
            .footer {{ padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Smart Fridge Assistant</h1>
                <p>Smart Food. Healthy You.</p>
            </div>
            <div class="content">
                <div class="alert-card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span class="status-badge">{status}</span>
                        <span style="font-size: 12px; color: #64748b;">Expires: <strong>{expiry_date}</strong></span>
                    </div>
                    <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 4px 0;">{food_name}</div>
                    <h2 style="margin: 6px 0; font-size: 15px; color: #334155; font-weight: 600;">{title}</h2>
                    <p style="margin: 4px 0 0 0; font-size: 13px; color: #475569; line-height: 1.5;">{message}</p>
                    {img_html}
                </div>
                <a href="{action_url}" class="btn">Mark as Used / Consumed</a>
            </div>
            <div class="footer">
                Freshness predictions are assistive and not a food safety guarantee.<br>
                Configure email lead times and quiet hours in your Smart Fridge Settings.
            </div>
        </div>
    </body>
    </html>
    """

def render_daily_digest_html(items: List[Dict[str, Any]]) -> str:
    rows = ""
    for item in items:
        rows += f"""
        <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 8px; font-weight: 600; font-size: 13px; color: #1e293b;">{item.get('name')}</td>
            <td style="padding: 10px 8px; font-size: 12px; color: #64748b;">{item.get('zone')}</td>
            <td style="padding: 10px 8px; font-size: 12px; font-weight: 700; color: #f59e0b;">{item.get('days_left')} day(s) left</td>
            <td style="padding: 10px 8px; text-align: right;">
                <a href="{settings.APP_URL}/foods?action=mark_used&id={item.get('id')}" style="font-size: 11px; font-weight: 700; color: #16a34a; text-decoration: none;">Mark Used</a>
            </td>
        </tr>
        """

    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f8fafc; padding: 24px;">
        <div style="max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #e2e8f0;">
            <div style="background: linear-gradient(135deg, #16a34a, #22c55e); padding: 24px; text-align: center; color: white;">
                <h1 style="margin: 0; font-size: 20px;">Daily Pantry Digest 🍳</h1>
                <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Items expiring soon in your Smart Fridge</p>
            </div>
            <div style="padding: 20px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-transform: uppercase;">
                            <th style="padding: 8px; text-align: left;">Item</th>
                            <th style="padding: 8px; text-align: left;">Shelf</th>
                            <th style="padding: 8px; text-align: left;">Remaining</th>
                            <th style="padding: 8px; text-align: right;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows}
                    </tbody>
                </table>
                <div style="margin-top: 24px; text-align: center;">
                    <a href="{settings.APP_URL}/foods" style="display: inline-block; background: #22c55e; color: white; padding: 10px 20px; border-radius: 10px; font-size: 13px; font-weight: 700; text-decoration: none;">Open Pantry Inventory</a>
                </div>
            </div>
        </div>
    </body>
    </html>
    """

# ==============================================================================
# 2. Email Provider Implementations (SMTP / Resend / Brevo)
# ==============================================================================

async def send_via_smtp(to_email: str, subject: str, html_body: str) -> None:
    if not (settings.SMTP_USER and settings.SMTP_PASSWORD):
        logger.info(f"[EMAIL SIMULATED - SMTP] To: {to_email} | Subject: {subject}")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.SMTP_USER}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    def _sync_smtp_send():
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_USER, [to_email], msg.as_string())

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _sync_smtp_send)
    logger.info(f"Email sent successfully via SMTP to {to_email}")


async def send_via_resend(to_email: str, subject: str, html_body: str) -> None:
    if not settings.RESEND_API_KEY:
        logger.info(f"[EMAIL SIMULATED - Resend] To: {to_email} | Subject: {subject}")
        return

    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "from": f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>",
        "to": [to_email],
        "subject": subject,
        "html": html_body
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code not in [200, 201]:
            raise Exception(f"Resend API error {resp.status_code}: {resp.text}")
    logger.info(f"Email sent successfully via Resend to {to_email}")


async def send_via_brevo(to_email: str, subject: str, html_body: str) -> None:
    if not settings.BREVO_API_KEY:
        logger.info(f"[EMAIL SIMULATED - Brevo] To: {to_email} | Subject: {subject}")
        return

    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "api-key": settings.BREVO_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "sender": {"name": settings.EMAILS_FROM_NAME, "email": settings.EMAILS_FROM_EMAIL},
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html_body
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code not in [200, 201]:
            raise Exception(f"Brevo API error {resp.status_code}: {resp.text}")
    logger.info(f"Email sent successfully via Brevo to {to_email}")


async def dispatch_email(to_email: str, subject: str, html_body: str) -> str:
    provider = settings.EMAIL_PROVIDER.lower()
    if provider == "resend":
        await send_via_resend(to_email, subject, html_body)
        return "resend"
    elif provider == "brevo":
        await send_via_brevo(to_email, subject, html_body)
        return "brevo"
    else:
        await send_via_smtp(to_email, subject, html_body)
        return "smtp"

# ==============================================================================
# 3. Web Push Provider (VAPID / pywebpush)
# ==============================================================================

async def dispatch_web_push(subscription_json: str, title: str, message: str, metadata: Optional[Dict[str, Any]] = None) -> str:
    if not subscription_json:
        logger.info(f"[WEB PUSH SIMULATED] No subscription registered. Title: {title}")
        return "vapid_simulated"

    try:
        sub_info = json.loads(subscription_json)
    except Exception as e:
        raise ValueError(f"Invalid subscription JSON: {e}")

    payload = json.dumps({
        "title": title,
        "body": message,
        "icon": "/pwa-192x192.png",
        "badge": "/favicon.svg",
        "data": {
            "url": metadata.get("action_url", "/") if metadata else "/"
        }
    })

    def _sync_webpush():
        from pywebpush import webpush, WebPushException
        try:
            webpush(
                subscription_info=sub_info,
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": f"mailto:{settings.VAPID_CLAIM_EMAIL}"},
                ttl=3600
            )
        except WebPushException as ex:
            logger.warning(f"Web Push delivery warning: {ex}")
            raise ex

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _sync_webpush)
    logger.info("Web push dispatched successfully via VAPID")
    return "vapid"

# ==============================================================================
# 4. SMS Provider Implementations (Twilio / Fast2SMS)
# ==============================================================================

async def dispatch_sms(to_number: str, message: str) -> str:
    # Truncate to 160 characters for SMS compliance
    short_msg = (message[:157] + "...") if len(message) > 160 else message

    provider = settings.SMS_PROVIDER.lower()
    if provider == "fast2sms":
        if not settings.FAST2SMS_API_KEY:
            logger.info(f"[SMS SIMULATED - Fast2SMS] To: {to_number} | Message: {short_msg}")
            return "fast2sms_simulated"

        url = "https://www.fast2sms.com/dev/bulkV2"
        headers = {"authorization": settings.FAST2SMS_API_KEY}
        data = {
            "route": "q",
            "message": short_msg,
            "numbers": to_number.replace("+", "").replace("-", "").replace(" ", "")
        }
        if settings.FAST2SMS_DLT_TE_ID:
            data["route"] = "dlt"
            data["dlt_te_id"] = settings.FAST2SMS_DLT_TE_ID

        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(url, data=data, headers=headers)
            if resp.status_code != 200:
                raise Exception(f"Fast2SMS error {resp.status_code}: {resp.text}")
        return "fast2sms"

    else: # Twilio
        if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER and to_number):
            logger.info(f"[SMS SIMULATED - Twilio] To: {to_number} | Message: {short_msg}")
            return "twilio_simulated"

        url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
        auth = (settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        data = {
            "From": settings.TWILIO_FROM_NUMBER,
            "To": to_number,
            "Body": short_msg
        }
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(url, data=data, auth=auth)
            if resp.status_code not in [200, 201]:
                raise Exception(f"Twilio error {resp.status_code}: {resp.text}")
        return "twilio"

# ==============================================================================
# 5. Pluggable Service with Common Interface, Retries & Logging
# ==============================================================================

async def send_with_retries(delivery_fn, max_retries: int = 3):
    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            provider_used = await delivery_fn()
            return True, provider_used, None, attempt
        except Exception as e:
            last_err = str(e)
            logger.warning(f"Notification attempt {attempt}/{max_retries} failed: {e}")
            if attempt < max_retries:
                await asyncio.sleep(2 ** (attempt - 1))
    return False, "unknown", last_err, max_retries


async def send(
    user: User,
    title: str,
    message: str,
    channel: str = "all",  # 'email', 'web_push', 'sms', 'all'
    metadata: Optional[Dict[str, Any]] = None,
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Common notification interface:
    Dispatches to Email (Primary), Web Push, and optional SMS according to user settings and channel.
    Logs each send attempt into notifications_log with retries up to 3 times.
    """
    results = {}
    metadata = metadata or {}

    # 1. EMAIL CHANNEL
    should_send_email = (channel in ["email", "all"]) and user.email_notifications_enabled
    if should_send_email and user.email:
        html_content = render_alert_email_html(title, message, metadata)

        async def _do_email():
            return await dispatch_email(user.email, title, html_content)

        success, provider, err, attempts = await send_with_retries(_do_email, max_retries=3)
        results["email"] = {"success": success, "provider": provider, "attempts": attempts, "error": err}

        if db:
            log_entry = NotificationLog(
                user_id=user.id,
                channel="email",
                provider=provider,
                recipient=user.email,
                title=title,
                message=message,
                status="sent" if success else "failed",
                error_message=err,
                attempts=attempts,
                metadata_json=json.dumps(metadata),
                sent_at=datetime.utcnow() if success else None
            )
            db.add(log_entry)
            db.commit()

    # 2. WEB PUSH CHANNEL
    should_send_push = (channel in ["web_push", "all"]) and user.push_notifications_enabled and settings.WEB_PUSH_ENABLED
    if should_send_push and user.push_subscription:
        async def _do_push():
            return await dispatch_web_push(user.push_subscription, title, message, metadata)

        success, provider, err, attempts = await send_with_retries(_do_push, max_retries=3)
        results["web_push"] = {"success": success, "provider": provider, "attempts": attempts, "error": err}

        if db:
            log_entry = NotificationLog(
                user_id=user.id,
                channel="web_push",
                provider=provider,
                recipient=user.push_subscription[:100],
                title=title,
                message=message,
                status="sent" if success else "failed",
                error_message=err,
                attempts=attempts,
                metadata_json=json.dumps(metadata),
                sent_at=datetime.utcnow() if success else None
            )
            db.add(log_entry)
            db.commit()

    # 3. SMS CHANNEL
    should_send_sms = (channel in ["sms", "all"]) and user.sms_notifications_enabled and settings.SMS_ENABLED
    if should_send_sms and user.phone_number:
        async def _do_sms():
            return await dispatch_sms(user.phone_number, f"{title}: {message}")

        success, provider, err, attempts = await send_with_retries(_do_sms, max_retries=3)
        results["sms"] = {"success": success, "provider": provider, "attempts": attempts, "error": err}

        if db:
            log_entry = NotificationLog(
                user_id=user.id,
                channel="sms",
                provider=provider,
                recipient=user.phone_number,
                title=title,
                message=message,
                status="sent" if success else "failed",
                error_message=err,
                attempts=attempts,
                metadata_json=json.dumps(metadata),
                sent_at=datetime.utcnow() if success else None
            )
            db.add(log_entry)
            db.commit()

    return results


async def send_daily_digest(user: User, items: List[Dict[str, Any]], db: Optional[Session] = None) -> Dict[str, Any]:
    """
    Sends the 8:00 AM daily digest email listing expiring foods.
    """
    if not (user.email and user.email_daily_digest and user.email_notifications_enabled):
        return {"status": "skipped"}

    subject = f"Smart Fridge Digest: {len(items)} item(s) need attention today"
    html_body = render_daily_digest_html(items)

    async def _do_digest():
        return await dispatch_email(user.email, subject, html_body)

    success, provider, err, attempts = await send_with_retries(_do_digest, max_retries=3)

    if db:
        db.add(NotificationLog(
            user_id=user.id,
            channel="email",
            provider=provider,
            recipient=user.email,
            title=subject,
            message=f"Daily digest with {len(items)} expiring items",
            status="sent" if success else "failed",
            error_message=err,
            attempts=attempts,
            sent_at=datetime.utcnow() if success else None
        ))
        db.commit()

    return {"success": success, "provider": provider}
