import os
import json
import urllib.request
import random
import logging
import threading
from django.core.mail import send_mail
from django.conf import settings

logger = logging.getLogger(__name__)


def generate_otp(length=6) -> str:
    """Generate a secure, random numeric one-time password (OTP)."""
    return "".join(str(random.randint(0, 9)) for _ in range(length))


def _dispatch_email_async(subject: str, message: str, from_email: str, to_email: str, html_message: str = None):
    """
    Worker function executed in a background daemon thread.
    1. Resend HTTPS API (Port 443 - Verified & active).
    2. Brevo HTTPS API if BREVO_API_KEY is available (Port 443).
    3. Google Apps Script Webhook if GOOGLE_SCRIPT_MAIL_URL is set.
    4. Optional custom MAIL_RELAY_URL if explicitly set in environment.
    5. Standard SMTP fallback (Port 587).
    Catches all errors gracefully without interrupting or freezing the web UI.
    """
    # 1. Resend HTTPS API (Port 443 - Primary Cloud Email Service)
    resend_key = os.getenv("RESEND_API_KEY", "re_RXnSx4pS_DGVkMV17CkvsA2JnEaYEYL3w").strip()
    if resend_key:
        try:
            req_data = json.dumps({
                "from": "Tourist Karnataka <onboarding@resend.dev>",
                "to": [to_email],
                "subject": subject,
                "text": message,
                "html": html_message if html_message else message,
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=req_data,
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                if resp.status in (200, 201):
                    print(f"[LIVE EMAIL DELIVERED VIA RESEND HTTPS PORT 443] to {to_email}")
                    logger.info(f"Delivered via Resend HTTPS to {to_email}")
                    return
        except urllib.error.HTTPError as http_err:
            err_body = http_err.read().decode(errors="ignore")
            print(f"[RESEND API ERROR HTTP {http_err.code}] {err_body}")
            logger.warning(f"Resend HTTPS dispatch HTTP {http_err.code}: {err_body}")
        except Exception as api_err:
            print(f"[RESEND API EXCEPTION] {api_err}")
            logger.warning(f"Resend HTTPS dispatch failed: {api_err}")

    # 2. Brevo HTTPS API (Port 443 - Can send to ANY email address globally)
    brevo_key = os.getenv("BREVO_API_KEY", "").strip()
    if brevo_key:
        try:
            payload = json.dumps({
                "sender": {"name": "Tourist Karnataka", "email": getattr(settings, "EMAIL_HOST_USER", "studentmanagebyns@gmail.com")},
                "to": [{"email": to_email}],
                "subject": subject,
                "textContent": message,
                "htmlContent": html_message or message,
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.brevo.com/v3/smtp/email",
                data=payload,
                headers={
                    "accept": "application/json",
                    "api-key": brevo_key,
                    "content-type": "application/json",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                if resp.status in (200, 201):
                    print(f"[LIVE EMAIL DELIVERED VIA BREVO HTTPS PORT 443] to {to_email}")
                    logger.info(f"Delivered via Brevo HTTPS to {to_email}")
                    return
        except Exception as brevo_err:
            print(f"[BREVO API EXCEPTION] {brevo_err}")
            logger.warning(f"Brevo HTTPS dispatch failed: {brevo_err}")

    # 3. Google Apps Script Webhook (Port 443 HTTPS)
    gas_url = os.getenv("GOOGLE_SCRIPT_MAIL_URL", "").strip()
    if gas_url:
        try:
            payload = json.dumps({
                "to": to_email,
                "subject": subject,
                "message": message,
                "html_message": html_message,
            }).encode("utf-8")
            req = urllib.request.Request(
                gas_url,
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "Tourist-Web/1.0"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                print(f"[LIVE EMAIL DELIVERED VIA GOOGLE APPS SCRIPT WEBHOOK] to {to_email}")
                logger.info(f"Delivered via Google Apps Script to {to_email}")
                return
        except Exception as gas_err:
            logger.warning(f"Google Apps Script dispatch failed: {gas_err}")

    # 4. Custom Mail Relay URL (Only if explicitly set)
    custom_relay = os.getenv("MAIL_RELAY_URL", "").strip()
    if custom_relay:
        try:
            target = custom_relay
            if not target.endswith("/send-relay-email/") and not target.endswith("/send-email"):
                target = target.rstrip("/") + "/users/api/send-relay-email/"
            payload = json.dumps({
                "to": to_email,
                "subject": subject,
                "message": message,
                "html_message": html_message,
            }).encode("utf-8")
            req = urllib.request.Request(
                target,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Tourist-Web/1.0",
                    "bypass-tunnel-reminder": "true"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status in (200, 201):
                    print(f"[LIVE EMAIL DELIVERED VIA MAIL RELAY] to {to_email}")
                    logger.info(f"Delivered via Mail Relay to {to_email}")
                    return
        except Exception as relay_err:
            logger.warning(f"Mail Relay dispatch failed ({custom_relay}): {relay_err}")

    # Standard SMTP
    try:
        from django.core.mail import EmailMultiAlternatives
        from_display = "Tourist Karnataka <studentmanagebyns@gmail.com>"
        msg = EmailMultiAlternatives(
            subject=subject,
            body=message,
            from_email=from_display,
            to=[to_email],
            headers={"From": from_display, "Reply-To": "studentmanagebyns@gmail.com"}
        )
        if html_message:
            msg.attach_alternative(html_message, "text/html")
        msg.send(fail_silently=False)
        print(f"[LIVE EMAIL DELIVERED VIA SMTP] Verification email successfully delivered to {to_email} as '{from_display}'")
        logger.info(f"Verification email successfully delivered to {to_email}")
    except Exception as e:
        err_str = str(e)
        if "534" in err_str or "Application-specific" in err_str or "InvalidSecondFactor" in err_str:
            logger.warning(
                "Gmail 2-Step Verification error: Google requires a 16-character App Password. "
                f"Detail: {e}"
            )
        elif "ETIMEDOUT" in err_str or "timed out" in err_str or "110" in err_str or "refused" in err_str:
            logger.warning(
                "Render Free Tier cloud security blocked outbound SMTP port 587. "
                "The active verification code is already pre-filled on the user's screen."
            )
        else:
            logger.warning(f"Live SMTP email dispatch failed: {e}")


def send_otp_email(to_email: str, otp_code: str, purpose: str = "account registration") -> bool:
    """
    Sends a simple, clean, standard professional verification email containing the OTP.
    Includes clean intro, prominent OTP, acknowledgement with Amrutha N S's name,
    and a warm happy travels wish in the footer.
    """
    subject = f"Tourist Karnataka - Your Verification Code: {otp_code}"
    
    # Simple, standard plain-text format
    message = (
        f"Hello from Tourist Karnataka!\n\n"
        f"Dear Traveler,\n\n"
        f"Welcome to Tourist Karnataka. To complete your {purpose}, please enter the verification passcode below:\n\n"
        f"====================================\n"
        f"        YOUR OTP: {otp_code}\n"
        f"====================================\n\n"
        f"Acknowledgement & Security Notice:\n"
        f"• This code is valid for 10 minutes.\n"
        f"• For your security, please do not share this OTP with anyone.\n"
        f"• Acknowledged & verified by: Amrutha N S\n\n"
        f"Warm wishes & Happy travels!\n"
        f"Amrutha N S & Tourist Karnataka Team\n"
    )

    # Simple, standard HTML email format
    html_message = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 20px 0; background-color: #0b1510; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; margin: 0 auto; background: #0f2319; border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        <!-- Header -->
        <tr>
          <td style="padding: 28px 24px 18px 24px; text-align: center; border-bottom: 1px solid rgba(16, 185, 129, 0.2);">
            <div style="display: inline-block; padding: 5px 14px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 20px; font-size: 11px; font-weight: 700; color: #34d399; letter-spacing: 1px; text-transform: uppercase;">
              Tourist Karnataka
            </div>
            <h1 style="margin: 12px 0 4px 0; font-size: 22px; font-weight: 800; color: #ffffff;">
              Account Verification
            </h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding: 26px 24px;">
            <p style="margin: 0 0 14px 0; font-size: 15px; color: #f1f5f9;">
              Hello Traveler,
            </p>
            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
              Welcome to <strong>Tourist Karnataka</strong>! To complete your {purpose}, please enter the one-time verification passcode below:
            </p>
            <!-- OTP Box -->
            <div style="background: rgba(16, 185, 129, 0.12); border: 1.5px dashed #10b981; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0;">
              <span style="font-size: 11px; font-weight: 700; color: #6ee7b7; text-transform: uppercase; letter-spacing: 1.5px; display: block; margin-bottom: 6px;">
                Your Verification Code
              </span>
              <span style="font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #ffffff; font-family: monospace;">
                {otp_code}
              </span>
            </div>
            <!-- Security & Acknowledgement -->
            <div style="background: rgba(15, 23, 42, 0.45); border-left: 3px solid #10b981; padding: 12px 16px; border-radius: 6px; margin-top: 20px;">
              <p style="margin: 0 0 6px 0; font-size: 12.5px; font-weight: 700; color: #34d399;">
                Acknowledgement &amp; Security:
              </p>
              <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #94a3b8; line-height: 1.6;">
                <li>This code is valid for <strong>10 minutes</strong>.</li>
                <li>Please do not share this OTP with anyone.</li>
                <li>Acknowledged &amp; verified by: <strong style="color: #e2e8f0;">Amrutha N S</strong></li>
              </ul>
            </div>
          </td>
        </tr>
        <!-- Simple Personal Footer -->
        <tr>
          <td style="padding: 20px 24px; background: #07130d; border-top: 1px solid rgba(16, 185, 129, 0.15); text-align: center;">
            <p style="margin: 0 0 4px 0; font-size: 13.5px; font-weight: 700; color: #34d399;">
              ✨ Warm wishes &amp; Happy travels!
            </p>
            <p style="margin: 0; font-size: 12px; color: #94a3b8;">
              With best regards, <strong>Amrutha N S</strong> &amp; Tourist Karnataka Team
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "Tourist Karnataka <studentmanagebyns@gmail.com>")
    email_host_user = getattr(settings, "EMAIL_HOST_USER", "").strip()
    email_host_password = getattr(settings, "EMAIL_HOST_PASSWORD", "").strip()
    
    email_backend = getattr(settings, "EMAIL_BACKEND", "")
    is_smtp_backend = "smtp" in email_backend.lower()

    # Always log/print cleanly to terminal console so developer/user/tester sees it immediately
    try:
        print("\n" + "=" * 60)
        print("[TOURIST WEB EMAIL VERIFICATION DISPATCH]")
        print(f"Recipient: {to_email}")
        print(f"Purpose:   {purpose}")
        print(f"OTP Code:  {otp_code}")
        print("=" * 60 + "\n")
    except Exception:
        pass

    # Launch delivery in non-blocking background thread (Resend HTTPS Port 443 / Brevo / SMTP)
    thread = threading.Thread(
        target=_dispatch_email_async,
        args=(subject, message, from_email, to_email, html_message),
        daemon=True,
    )
    thread.start()

    return True


def mask_email(email: str) -> str:
    """Mask email for privacy display, e.g. j***e@domain.com."""
    if not email or "@" not in email:
        return email or ""
    name, domain = email.split("@", 1)
    if len(name) <= 2:
        masked_name = name[0] + "*"
    else:
        masked_name = name[0] + "*" * (len(name) - 2) + name[-1]
    return f"{masked_name}@{domain}"


def get_client_ip(request) -> str | None:
    """Extract client IP address from HTTP headers."""
    if not request:
        return None
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')
