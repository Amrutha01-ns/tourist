import math
import time
from django.http import JsonResponse
from django.db import IntegrityError
from django.contrib.auth.models import User
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from places.models import District, Place
from transport_finder.models import TransitStop, Route, TransportProvider
from .services import generate_otp, send_otp_email, mask_email


import time
import logging
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.contrib.auth.models import User
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.utils import timezone
from places.models import District, Place
from transport_finder.models import TransitStop, Route, TransportProvider
from .models import EmailOTP, UserProfile
from .services import generate_otp, send_otp_email, mask_email, get_client_ip

logger = logging.getLogger(__name__)


def register(request):
    if request.user.is_authenticated:
        return redirect("dashboard")

    # Handle cancel / reset OTP
    if request.GET.get("cancel_otp"):
        for key in ["pending_reg_username", "pending_reg_email", "pending_reg_password", "reg_otp", "reg_otp_time", "reg_otp_id"]:
            request.session.pop(key, None)
        return redirect("register")

    error = None
    success = None
    info = None

    has_pending = bool(request.session.get("pending_reg_username") and (request.session.get("reg_otp") or request.session.get("reg_otp_id")))
    step = "otp" if has_pending else "form"
    pending_email = request.session.get("pending_reg_email", "")

    if request.method == "POST":
        action = request.POST.get("action", "")

        if action == "resend_otp" or request.POST.get("resend"):
            if not has_pending or not pending_email:
                return redirect("register")

            # Rate limit check: at least 15 seconds between resend requests
            last_time = request.session.get("reg_otp_time", 0)
            if time.time() - last_time < 15:
                error = "Please wait a few seconds before requesting another verification code."
                step = "otp"
            else:
                # Atomically create new OTP in database model
                otp_obj = EmailOTP.create_otp(
                    email=pending_email,
                    purpose='register',
                    validity_minutes=10,
                    ip_address=get_client_ip(request)
                )
                request.session["reg_otp"] = otp_obj.otp_code
                request.session["reg_otp_id"] = otp_obj.id
                request.session["reg_otp_time"] = time.time()

                send_otp_email(pending_email, otp_obj.otp_code, purpose="account registration")
                success = f"A fresh verification OTP has been sent to {mask_email(pending_email)}."
                step = "otp"

        elif action == "verify_otp" or step == "otp":
            entered_otp = request.POST.get("otp", "").strip()
            saved_otp = request.session.get("reg_otp")
            otp_id = request.session.get("reg_otp_id")
            otp_time = request.session.get("reg_otp_time", 0)
            username = request.session.get("pending_reg_username")
            email = request.session.get("pending_reg_email")
            password = request.session.get("pending_reg_password")

            if not username or not email or not password:
                error = "Registration session expired. Please enter your details again."
                step = "form"
            else:
                # First check database EmailOTP model for integrity
                otp_record = None
                if otp_id:
                    otp_record = EmailOTP.objects.filter(id=otp_id).first()
                if not otp_record:
                    otp_record = EmailOTP.objects.filter(
                        email__iexact=email,
                        purpose='register',
                        is_verified=False
                    ).order_by('-created_at').first()

                is_valid_otp = False
                otp_error_msg = None

                if otp_record:
                    is_valid_otp, otp_error_msg = otp_record.verify(entered_otp)
                elif saved_otp:
                    if (time.time() - otp_time) > 600:
                        is_valid_otp = False
                        otp_error_msg = "Verification code expired (10 minutes limit). Please click Resend OTP."
                    elif entered_otp == saved_otp:
                        is_valid_otp = True
                    else:
                        is_valid_otp = False
                        otp_error_msg = "Invalid OTP code. Please enter the 6-digit code sent to your email."
                else:
                    is_valid_otp = False
                    otp_error_msg = "Registration session expired. Please enter your details again."
                    step = "form"

                if not is_valid_otp:
                    error = otp_error_msg or "Invalid OTP code. Please enter the 6-digit code sent to your email."
                    step = "otp"
                else:
                    # Valid OTP! Atomically create User and UserProfile in database
                    try:
                        with transaction.atomic():
                            if User.objects.filter(username__iexact=username).exists():
                                error = f"The username '{username}' is already taken. Please choose another username or sign in."
                                step = "form"
                            elif User.objects.filter(email__iexact=email).exists():
                                error = f"An account with email '{email}' is already registered. Please sign in."
                                step = "form"
                            else:
                                user = User.objects.create_user(
                                    username=username,
                                    email=email,
                                    password=password,
                                    is_active=True
                                )
                                # Ensure UserProfile is marked verified
                                profile, _ = UserProfile.objects.get_or_create(user=user)
                                profile.is_email_verified = True
                                profile.email_verified_at = timezone.now()
                                profile.save(update_fields=['is_email_verified', 'email_verified_at'])

                                # Link OTP model to user
                                if otp_record:
                                    otp_record.user = user
                                    otp_record.is_verified = True
                                    otp_record.save(update_fields=['user', 'is_verified'])

                                # Clear pending registration session
                                for key in ["pending_reg_username", "pending_reg_email", "pending_reg_password", "reg_otp", "reg_otp_time", "reg_otp_id"]:
                                    request.session.pop(key, None)

                                # Log the newly verified user in and navigate straight to dashboard
                                login(request, user)
                                return redirect("dashboard")
                    except IntegrityError:
                        error = f"The username '{username}' or email '{email}' already exists. Please choose another username or sign in."
                        step = "form"

        elif action == "instant_register" or request.POST.get("direct_signup") == "1":
            # Direct 1-click registration bypassing OTP hurdles
            username = (request.POST.get("reg_username") or request.POST.get("username") or "").strip()
            email = (request.POST.get("reg_email") or request.POST.get("email") or "").strip().lower()
            password = request.POST.get("reg_password") or request.POST.get("password") or ""

            if not username or not password:
                error = "Please enter both username and password."
                step = "form"
            elif User.objects.filter(username__iexact=username).exists():
                error = f"The username '{username}' is already taken. Please choose another username or sign in."
                step = "form"
            elif email and User.objects.filter(email__iexact=email).exists():
                error = f"An account with email '{email}' is already registered. Please sign in."
                step = "form"
            elif len(password) < 4:
                error = "Password must be at least 4 characters long."
                step = "form"
            else:
                try:
                    with transaction.atomic():
                        user = User.objects.create_user(
                            username=username,
                            email=email or f"{username}@tourist.local",
                            password=password,
                            is_active=True
                        )
                        profile, _ = UserProfile.objects.get_or_create(user=user)
                        profile.is_email_verified = True
                        profile.email_verified_at = timezone.now()
                        profile.save()

                    login(request, user)
                    return redirect("dashboard")
                except IntegrityError:
                    error = f"The username '{username}' already exists. Please choose another username or sign in."
                    step = "form"

        else:
            # Form submission to start registration with optional OTP verification
            username = (request.POST.get("reg_username") or request.POST.get("username") or "").strip()
            email = (request.POST.get("reg_email") or request.POST.get("email") or "").strip().lower()
            password = request.POST.get("reg_password") or request.POST.get("password") or ""
            confirm_password = request.POST.get("reg_confirm_password") or request.POST.get("confirm_password") or ""

            if not username or not email or not password:
                error = "Please fill in all required fields."
                step = "form"
            elif confirm_password and password != confirm_password:
                error = "Passwords do not match. Please ensure both password fields match."
                step = "form"
            elif User.objects.filter(username__iexact=username).exists():
                error = f"The username '{username}' is already taken. Please choose another username or sign in."
                step = "form"
            elif User.objects.filter(email__iexact=email).exists():
                error = f"An account with email '{email}' is already registered. Please sign in."
                step = "form"
            elif len(password) < 4:
                error = "Password must be at least 4 characters long."
                step = "form"
            else:
                # Generate verification OTP and persist to database model
                otp_obj = EmailOTP.create_otp(
                    email=email,
                    purpose='register',
                    validity_minutes=10,
                    ip_address=get_client_ip(request)
                )

                request.session["pending_reg_username"] = username
                request.session["pending_reg_email"] = email
                request.session["pending_reg_password"] = password
                request.session["reg_otp"] = otp_obj.otp_code
                request.session["reg_otp_id"] = otp_obj.id
                request.session["reg_otp_time"] = time.time()

                send_otp_email(email, otp_obj.otp_code, purpose="account registration")

                step = "otp"
                pending_email = email
                info = f"We have sent a 6-digit verification code to {mask_email(email)}. Enter it below to activate your account."

    return render(
        request,
        "users/register.html",
        {
            "step": step,
            "error": error,
            "success": success,
            "info": info,
            "masked_email": mask_email(pending_email),
            "pending_email": pending_email,
            "debug_otp": request.session.get("reg_otp"),
        }
    )


def user_login(request):
    if request.user.is_authenticated:
        return redirect("dashboard")

    # Handle cancel / reset OTP
    if request.GET.get("cancel_otp"):
        for key in ["pending_login_user_id", "login_otp", "login_otp_time", "pending_login_email", "login_otp_id", "login_mode"]:
            request.session.pop(key, None)
        return redirect("login")

    error = None
    success = None
    info = None

    has_pending = bool(request.session.get("pending_login_user_id") and (request.session.get("login_otp") or request.session.get("login_otp_id")))
    step = "otp" if has_pending else "credentials"
    pending_email = request.session.get("pending_login_email", "")

    if request.method == "POST":
        action = request.POST.get("action", "")

        if action == "resend_otp" or request.POST.get("resend"):
            if not has_pending or not pending_email:
                return redirect("login")

            user_id = request.session.get("pending_login_user_id")
            user = User.objects.filter(id=user_id).first()

            otp_obj = EmailOTP.create_otp(
                email=pending_email,
                purpose='login',
                user=user,
                validity_minutes=10,
                ip_address=get_client_ip(request)
            )
            request.session["login_otp"] = otp_obj.otp_code
            request.session["login_otp_id"] = otp_obj.id
            request.session["login_otp_time"] = time.time()

            send_otp_email(pending_email, otp_obj.otp_code, purpose="sign in")
            success = f"A fresh verification OTP has been sent to {mask_email(pending_email)}."
            step = "otp"

        elif action == "verify_otp" or step == "otp":
            entered_otp = request.POST.get("otp", "").strip()
            saved_otp = request.session.get("login_otp")
            otp_id = request.session.get("login_otp_id")
            user_id = request.session.get("pending_login_user_id")
            otp_time = request.session.get("login_otp_time", 0)

            user = User.objects.filter(id=user_id).first() if user_id else None

            if not user or not (saved_otp or otp_id):
                error = "Sign in session expired. Please enter your credentials again."
                step = "credentials"
            else:
                otp_record = None
                if otp_id:
                    otp_record = EmailOTP.objects.filter(id=otp_id).first()
                if not otp_record and user:
                    otp_record = EmailOTP.objects.filter(
                        email__iexact=user.email,
                        purpose='login',
                        is_verified=False
                    ).order_by('-created_at').first()

                is_valid = False
                verify_msg = None

                if otp_record:
                    is_valid, verify_msg = otp_record.verify(entered_otp)
                elif saved_otp:
                    if (time.time() - otp_time) > 600:
                        is_valid = False
                        verify_msg = "Verification code expired (10 minutes limit). Please click Resend OTP."
                    elif entered_otp == saved_otp:
                        is_valid = True
                    else:
                        is_valid = False
                        verify_msg = "Invalid OTP code. Please check your email and enter the 6-digit code."

                if not is_valid:
                    error = verify_msg or "Invalid OTP code. Please enter the 6-digit code."
                    step = "otp"
                else:
                    # Successfully verified! Activate user and UserProfile
                    with transaction.atomic():
                        if not user.is_active:
                            user.is_active = True
                            user.save(update_fields=['is_active'])
                        profile, _ = UserProfile.objects.get_or_create(user=user)
                        profile.is_email_verified = True
                        profile.email_verified_at = timezone.now()
                        profile.save(update_fields=['is_email_verified', 'email_verified_at'])

                    login(request, user)
                    for key in ["pending_login_user_id", "login_otp", "login_otp_time", "pending_login_email", "login_otp_id", "login_mode"]:
                        request.session.pop(key, None)
                    return redirect("dashboard")

        else:
            # Credentials or Instant OTP submission
            login_mode = request.POST.get("login_mode", "password")

            if login_mode == "otp_only" or action == "request_otp":
                # Instant Email OTP Login (Passwordless)
                email_input = request.POST.get("email", "").strip().lower()
                user = User.objects.filter(email__iexact=email_input).first() if email_input else None

                if not email_input:
                    error = "Please enter your registered email address."
                    step = "credentials"
                elif not user:
                    error = f"No account found with email '{email_input}'. Please check your spelling or create an account."
                    step = "credentials"
                else:
                    otp_obj = EmailOTP.create_otp(
                        email=user.email,
                        purpose='login',
                        user=user,
                        validity_minutes=10,
                        ip_address=get_client_ip(request)
                    )
                    request.session["pending_login_user_id"] = user.id
                    request.session["pending_login_email"] = user.email
                    request.session["login_otp"] = otp_obj.otp_code
                    request.session["login_otp_id"] = otp_obj.id
                    request.session["login_otp_time"] = time.time()
                    request.session["login_mode"] = "otp_only"

                    send_otp_email(user.email, otp_obj.otp_code, purpose="sign in")

                    step = "otp"
                    pending_email = user.email
                    info = f"We sent a 6-digit one-time sign-in code to {mask_email(user.email)}. Enter it below to sign in."
            else:
                # Password login
                identifier = request.POST.get("username", "").strip()
                password = request.POST.get("password", "")

                user = None
                if identifier and password:
                    user = authenticate(request, username=identifier, password=password)
                    if user is None and "@" in identifier:
                        matched_user = User.objects.filter(email__iexact=identifier).first()
                        if matched_user:
                            user = authenticate(request, username=matched_user.username, password=password)

                if user is not None:
                    user_email = user.email.strip() if user.email else ""
                    if action == "instant_login" or request.POST.get("direct_login") == "1" or not user_email:
                        # Direct password sign-in without OTP bottleneck
                        login(request, user)
                        return redirect("dashboard")

                    otp_obj = EmailOTP.create_otp(
                        email=user_email,
                        purpose='login',
                        user=user,
                        validity_minutes=10,
                        ip_address=get_client_ip(request)
                    )

                    request.session["pending_login_user_id"] = user.id
                    request.session["login_otp"] = otp_obj.otp_code
                    request.session["login_otp_id"] = otp_obj.id
                    request.session["login_otp_time"] = time.time()
                    request.session["pending_login_email"] = user_email
                    request.session["login_mode"] = "password"

                    send_otp_email(user_email, otp_obj.otp_code, purpose="sign in")

                    step = "otp"
                    pending_email = user_email
                    info = f"Security verification: We sent a 6-digit OTP to {mask_email(user_email)}. Please enter it below to sign in."
                else:
                    error = "You have entered wrong username or password. Please enter valid credentials."
                    step = "credentials"

    return render(
        request,
        "users/login.html",
        {
            "step": step,
            "error": error,
            "success": success,
            "info": info,
            "masked_email": mask_email(pending_email),
            "pending_email": pending_email,
            "debug_otp": request.session.get("login_otp"),
            "login_mode": request.session.get("login_mode", "password"),
        }
    )


KARNATAKA_DISTRICTS_DATA = [
    {
        "slug": "mysore",
        "db_name": "mysore",
        "kannada_name": "ಮೈಸೂರು",
        "english_name": "Mysore (Mysuru)",
        "kannada_subtitle": "ಭವ್ಯ ಅರಮನೆ, ಚಾಮುಂಡಿ ಬೆಟ್ಟ & ಪರಂಪರೆ",
        "english_subtitle": "Palaces, royal culture & Chamundi Hills",
        "tag_kannada": "ರಾಜ ಪರಂಪರೆ",
        "tag_english": "ROYAL HERITAGE",
        "coordinates": "12.2958° N, 76.6394° E",
        "region_kannada": "ದಕ್ಷಿಣ ಕರ್ನಾಟಕ",
        "region_english": "South Heritage Plains",
        "map_pin_x": 48,
        "map_pin_y": 105,
        "static_image": "users/images/mysore.jpg",
        "fallback_media": "/media/places/mysore-palace.jpg",
        "card_span": "large",
    },
    {
        "slug": "kodagu",
        "db_name": "kodagu",
        "kannada_name": "ಕೊಡಗು",
        "english_name": "Madikeri (Coorg)",
        "kannada_subtitle": "ಮಂಜಿನ ಬೆಟ್ಟಗಳು, ಕಾಫಿ ತೋಟ & ಅಬ್ಬಿ ಫಾಲ್ಸ್",
        "english_subtitle": "Misty hills, coffee estates & waterfalls",
        "tag_kannada": "ಕಾಫಿ ನಾಡು",
        "tag_english": "COORG MIST",
        "coordinates": "12.4244° N, 75.7382° E",
        "region_kannada": "ಪಶ್ಚಿಮ ಘಟ್ಟಗಳು",
        "region_english": "Western Ghats",
        "map_pin_x": 38,
        "map_pin_y": 102,
        "static_image": "users/images/madikeri.jpg",
        "fallback_media": "/media/places/abbey-falls.jpg",
        "card_span": "normal",
    },
    {
        "slug": "Chikkamagaluru",
        "db_name": "Chikkamagaluru",
        "kannada_name": "ಚಿಕ್ಕಮಗಳೂರು",
        "english_name": "Chikkamagaluru",
        "kannada_subtitle": "ಮುಳ್ಳಯ್ಯನಗಿರಿ, ಬಾಬಾಬುಡನ್‌ಗಿರಿ & ಶಿಖರಗಳು",
        "english_subtitle": "Mullayanagiri, coffee cradle & lush peaks",
        "tag_kannada": "ಗಿರಿಧಾಮ",
        "tag_english": "HIGHEST PEAKS",
        "coordinates": "13.3153° N, 75.7754° E",
        "region_kannada": "ಮಲೆನಾಡು",
        "region_english": "Central Malnad",
        "map_pin_x": 42,
        "map_pin_y": 80,
        "static_image": "users/images/chikmagalur.jpg",
        "fallback_media": "/media/places/mullayanagiri.jpg",
        "card_span": "normal",
    },
    {
        "slug": "Hampi",
        "db_name": "Hampi",
        "kannada_name": "ಹಂಪಿ",
        "english_name": "Hampi (Vijayanagara)",
        "kannada_subtitle": "ವಿರೂಪಾಕ್ಷ, ಕಲ್ಲಿನ ರಥ & ವಿಶ್ವ ಪರಂಪರೆ",
        "english_subtitle": "Virupaksha, stone chariot & UNESCO ruins",
        "tag_kannada": "ವಿಶ್ವ ಪರಂಪರೆ",
        "tag_english": "UNESCO HERITAGE",
        "coordinates": "15.3350° N, 76.4600° E",
        "region_kannada": "ತುಂಗಭದ್ರಾ ತೀರ",
        "region_english": "Tungabhadra Basin",
        "map_pin_x": 52,
        "map_pin_y": 42,
        "static_image": "users/images/hampi.jpg",
        "fallback_media": "/media/places/virupaksha-temple.jpg",
        "card_span": "wide",
    },
    {
        "slug": "Udupi",
        "db_name": "Udupi",
        "kannada_name": "ಉಡುಪಿ",
        "english_name": "Udupi",
        "kannada_subtitle": "ಶ್ರೀಕೃಷ್ಣ ಮಠ, ಮಲ್ಪೆ ಕಡಲತೀರ & ದ್ವೀಪ",
        "english_subtitle": "Sri Krishna Matha, St Mary's island & coast",
        "tag_kannada": "ಕರಾವಳಿ ತಾಣ",
        "tag_english": "COASTAL TEMPLE",
        "coordinates": "13.3409° N, 74.7421° E",
        "region_kannada": "ಕರಾವಳಿ",
        "region_english": "Canara Coastline",
        "map_pin_x": 26,
        "map_pin_y": 74,
        "static_image": "users/images/udupi.jpg",
        "fallback_media": "/media/places/malpe-beach.jpg",
        "card_span": "normal",
    },
    {
        "slug": "hassan",
        "db_name": "hassan",
        "kannada_name": "ಹಾಸನ",
        "english_name": "Hassan (Belur & Halebidu)",
        "kannada_subtitle": "ಹೊಯ್ಸಳ ಶಿಲ್ಪಕಲೆ, ಬೇಲೂರು-ಹಳೇಬೀಡು",
        "english_subtitle": "Hoysala temple architecture & heritage",
        "tag_kannada": "ಶಿಲ್ಪಕಲೆ",
        "tag_english": "HOYSALA ART",
        "coordinates": "13.0033° N, 76.1004° E",
        "region_kannada": "ಮಧ್ಯ ಕರ್ನಾಟಕ",
        "region_english": "South-Central Plains",
        "map_pin_x": 45,
        "map_pin_y": 92,
        "static_image": "users/images/hassan.jpg",
        "fallback_media": "/media/places/belur-temple.jpg",
        "card_span": "normal",
    },
    {
        "slug": "uttara kannada",
        "db_name": "uttara kannada",
        "kannada_name": "ಉತ್ತರ ಕನ್ನಡ",
        "english_name": "Uttara Kannada (Gokarna)",
        "kannada_subtitle": "ಗೋಕರ್ಣ ಓಂ ಬೀಚ್, ಮುರುಡೇಶ್ವರ & ಕಾಡುಗಳು",
        "english_subtitle": "Gokarna Om Beach, Murudeshwar & forests",
        "tag_kannada": "ಕಡಲತೀರ & ವನ",
        "tag_english": "BEACHES & FORESTS",
        "coordinates": "14.8136° N, 74.1298° E",
        "region_kannada": "ಉತ್ತರ ಕರಾವಳಿ",
        "region_english": "North Coastal Karavali",
        "map_pin_x": 16,
        "map_pin_y": 52,
        "static_image": "users/images/uttara-kannada.jpg",
        "fallback_media": "/media/places/om-beach.jpg",
        "card_span": "normal",
    },
    {
        "slug": "Mangaluru",
        "db_name": "Mangaluru",
        "kannada_name": "ಮಂಗಳೂರು",
        "english_name": "Mangaluru (Dakshina Kannada)",
        "kannada_subtitle": "ಬಂದರು ನಗರಿ, ಕದ್ರಿ ಮಂಜುನಾಥ & ಕಡಲತೀರಗಳು",
        "english_subtitle": "Port city, Panambur beach & sacred temples",
        "tag_kannada": "ಬಂದರು ನಗರಿ",
        "tag_english": "PORT & CULTURE",
        "coordinates": "12.9141° N, 74.8560° E",
        "region_kannada": "ದಕ್ಷಿಣ ಕರಾವಳಿ",
        "region_english": "South Coastal Canara",
        "map_pin_x": 24,
        "map_pin_y": 98,
        "static_image": "users/images/mangaluru.jpg",
        "fallback_media": "/media/places/panambur-beach.jpg",
        "card_span": "normal",
    },
    {
        "slug": "Shivamogga",
        "db_name": "Shivamogga",
        "kannada_name": "ಶಿವಮೊಗ್ಗ",
        "english_name": "Shivamogga",
        "kannada_subtitle": "ಭವ್ಯ ಜೋಗ ಜಲಪಾತ, ಆಗುಂಬೆ & ಮಲೆನಾಡು",
        "english_subtitle": "Majestic Jog Falls, Agumbe sunset & woods",
        "tag_kannada": "ಜಲಪಾತಗಳ ನಾಡು",
        "tag_english": "FALLS & MALNAD",
        "coordinates": "13.9299° N, 75.5681° E",
        "region_kannada": "ಮಲೆನಾಡು",
        "region_english": "Malnad Rainforest",
        "map_pin_x": 32,
        "map_pin_y": 66,
        "static_image": "users/images/shivamogga.jpg",
        "fallback_media": "/media/places/jog-falls.jpg",
        "card_span": "normal",
    },
    {
        "slug": "Mandya",
        "db_name": "Mandya",
        "kannada_name": "ಮಂಡ್ಯ",
        "english_name": "Mandya",
        "kannada_subtitle": "ಶ್ರೀರಂಗಪಟ್ಟಣ, ಶಿವನಸಮುದ್ರ & ರಂಗನತಿಟ್ಟು",
        "english_subtitle": "Historic Srirangapatna, Shivanasamudra & Kaveri",
        "tag_kannada": "ಸಕ್ಕರೆ ನಾಡು",
        "tag_english": "KAVERI BASIN",
        "coordinates": "12.5244° N, 76.8958° E",
        "region_kannada": "ಕಾವೇರಿ ಕಣಿವೆ",
        "region_english": "Kaveri River Valley",
        "map_pin_x": 56,
        "map_pin_y": 102,
        "static_image": "users/images/mandya.jpg",
        "fallback_media": "/media/places/shivanasamudra-falls.jpg",
        "card_span": "normal",
    },
]


# Authentic Karnataka District Map Registry with Rich Gemstone-Grade Colors
AUTHENTIC_DISTRICT_MAPS = {
    "mysore": {
        "slug": "mysore",
        "kannada": "ಮೈಸೂರು",
        "english": "MYSORE",
        "route": "mysore",
        "district_shape_path": "M 131.1,33.5 L 136.7,40.6 L 139.9,43.6 L 141.8,47.3 L 147.1,52.5 L 148.0,57.9 L 158.1,62.9 L 168.3,67.9 L 166.3,74.1 L 167.3,80.5 L 174.2,78.9 L 182.0,74.5 L 189.5,74.5 L 189.2,77.6 L 191.5,80.6 L 198.4,83.5 L 201.6,90.0 L 204.7,87.3 L 206.6,81.5 L 209.8,82.2 L 212.1,78.8 L 216.8,75.0 L 217.7,72.1 L 223.0,73.0 L 229.9,68.8 L 233.2,64.9 L 236.2,74.8 L 233.9,81.8 L 238.4,85.4 L 239.6,80.9 L 243.9,86.2 L 247.4,89.1 L 243.5,90.0 L 246.1,99.1 L 253.9,102.7 L 257.1,102.7 L 262.7,103.2 L 264.2,106.2 L 268.7,101.8 L 272.2,107.0 L 269.2,111.0 L 261.9,112.6 L 255.2,119.3 L 256.1,122.2 L 251.5,121.6 L 250.9,119.1 L 248.7,117.0 L 246.7,114.1 L 245.4,120.6 L 242.1,124.7 L 236.9,128.3 L 230.2,124.1 L 225.3,121.9 L 222.6,113.3 L 219.8,115.9 L 217.3,121.3 L 219.6,125.4 L 225.4,126.6 L 224.2,134.6 L 224.1,136.2 L 229.5,138.3 L 232.3,141.3 L 235.8,144.3 L 227.3,147.2 L 222.9,145.3 L 218.4,147.0 L 213.4,141.2 L 209.6,144.9 L 207.6,149.9 L 201.1,146.3 L 199.4,146.4 L 193.7,149.9 L 192.4,147.1 L 187.3,145.2 L 182.1,149.8 L 175.3,148.5 L 170.1,150.9 L 168.9,160.4 L 166.2,166.9 L 153.9,172.6 L 148.5,185.2 L 139.1,182.1 L 141.5,184.6 L 140.0,187.6 L 136.8,192.7 L 128.5,195.0 L 120.0,186.6 L 113.6,182.1 L 104.9,182.1 L 102.8,176.3 L 98.5,170.4 L 87.7,173.9 L 84.4,168.0 L 89.7,146.3 L 94.1,141.9 L 98.4,136.7 L 95.5,126.9 L 88.7,113.6 L 86.2,111.3 L 75.0,100.1 L 68.5,100.0 L 66.7,95.0 L 63.0,87.8 L 53.3,79.1 L 47.3,71.9 L 52.1,65.0 L 58.3,63.7 L 57.6,58.9 L 57.0,53.2 L 60.7,50.0 L 61.7,47.1 L 64.0,45.7 L 63.7,42.9 L 68.4,40.1 L 73.3,44.0 L 77.3,45.0 L 80.6,46.2 L 82.5,47.8 L 85.1,51.6 L 88.9,48.8 L 91.9,45.6 L 91.8,41.4 L 97.3,39.9 L 99.6,37.3 L 103.3,32.6 L 102.8,29.0 L 109.5,29.0 L 113.5,30.0 L 118.0,32.1 L 119.7,31.3 L 120.8,33.2 L 124.8,32.6 L 126.8,25.3 L 129.1,28.4 L 131.1,33.5 Z",
        "center_x": 145,
        "kannada_y": 105,
        "english_y": 128,
        # Cool, rich royal amber-sunset gradient fill
        "bg_start": "#6b2810",
        "bg_mid": "#9a3412",
        "bg_end": "#c2410c",
        "border_color": "#fbbf24",
        "glow_rgb": "217, 119, 6",
        "image": "/static/users/images/mysore.jpg",
    },
    "kodagu": {
        "slug": "kodagu",
        "kannada": "ಕೊಡಗು",
        "english": "MADIKERI (COORG)",
        "route": "kodagu",
        "district_shape_path": "M 184.1,28.2 L 186.7,27.6 L 188.3,27.7 L 188.7,29.7 L 196.9,30.4 L 195.1,34.9 L 193.7,37.2 L 190.4,37.9 L 189.9,43.7 L 194.5,48.1 L 194.7,51.6 L 191.2,54.5 L 192.2,56.7 L 190.3,60.5 L 190.1,63.6 L 192.0,66.2 L 190.7,67.7 L 194.0,74.1 L 196.5,73.8 L 200.1,74.6 L 201.2,72.0 L 205.5,75.2 L 201.6,76.6 L 202.1,79.0 L 199.8,79.5 L 200.9,82.4 L 198.6,83.9 L 195.3,86.3 L 194.4,90.0 L 196.6,93.6 L 196.2,97.8 L 190.2,98.6 L 187.6,101.0 L 185.2,107.8 L 186.6,109.1 L 194.3,116.9 L 200.9,122.4 L 204.4,127.4 L 204.8,132.9 L 207.0,134.5 L 213.1,134.8 L 221.4,145.2 L 226.5,145.6 L 228.5,152.4 L 234.7,162.9 L 236.9,172.0 L 234.9,176.8 L 229.9,179.1 L 225.5,184.9 L 216.1,187.9 L 209.7,192.1 L 203.2,193.4 L 197.3,194.3 L 189.5,193.6 L 184.3,192.9 L 174.4,188.7 L 169.9,184.8 L 170.0,180.1 L 167.1,177.6 L 164.5,174.5 L 164.1,171.3 L 164.0,166.7 L 155.8,166.1 L 151.3,168.6 L 148.7,167.6 L 146.1,164.9 L 143.0,161.4 L 139.0,163.5 L 136.3,160.8 L 135.5,156.7 L 134.1,154.2 L 132.3,153.4 L 128.7,152.7 L 124.8,152.7 L 121.6,149.5 L 118.3,147.5 L 116.7,144.5 L 114.8,143.8 L 115.5,140.9 L 111.9,137.3 L 110.5,133.0 L 107.3,130.8 L 105.2,126.8 L 95.4,125.7 L 93.7,125.9 L 93.9,122.7 L 92.7,120.2 L 92.9,115.1 L 90.2,110.6 L 87.9,108.5 L 84.4,106.2 L 83.9,96.8 L 86.9,95.9 L 92.4,95.2 L 94.2,92.9 L 92.3,87.2 L 94.7,84.9 L 96.0,82.2 L 102.7,88.0 L 101.4,92.8 L 104.3,93.8 L 106.8,94.4 L 106.9,91.5 L 108.7,90.1 L 113.4,88.0 L 118.7,87.4 L 122.8,83.7 L 126.5,83.0 L 130.0,85.6 L 132.8,83.7 L 137.6,79.7 L 138.9,73.6 L 136.8,64.7 L 135.8,56.3 L 144.6,49.6 L 149.7,50.3 L 155.7,54.5 L 159.4,53.9 L 164.9,50.9 L 168.2,51.8 L 173.3,55.4 L 179.1,55.4 L 181.1,51.4 L 180.4,48.8 L 174.1,45.0 L 174.4,41.2 L 175.7,39.6 L 177.6,37.4 L 177.0,33.4 L 178.6,27.0 L 179.1,25.0 L 184.1,28.2 Z",
        "center_x": 158,
        "kannada_y": 108,
        "english_y": 131,
        # Cool, rich emerald-jade rainforest gradient fill
        "bg_start": "#064e3b",
        "bg_mid": "#047857",
        "bg_end": "#0d9488",
        "border_color": "#34d399",
        "glow_rgb": "16, 185, 129",
        "image": "/static/users/images/madikeri.jpg",
    },
    "hampi": {
        "slug": "Hampi",
        "kannada": "ಹಂಪಿ",
        "english": "HAMPI",
        "route": "Hampi",
        "district_shape_path": "M 241.9,25.5 L 244.8,26.2 L 247.1,29.5 L 244.8,33.7 L 244.4,35.4 L 248.3,39.4 L 248.3,43.5 L 254.3,50.7 L 249.0,48.6 L 242.0,51.1 L 241.3,58.8 L 238.8,68.6 L 234.2,70.2 L 238.4,75.0 L 241.8,77.6 L 241.9,82.2 L 243.2,87.8 L 246.6,91.9 L 252.8,92.1 L 256.7,97.6 L 257.5,100.2 L 260.2,102.2 L 254.6,104.6 L 258.1,108.0 L 259.9,114.2 L 257.5,115.6 L 258.5,118.2 L 255.2,123.3 L 253.0,130.7 L 249.1,132.8 L 244.4,131.9 L 237.5,132.6 L 231.5,132.5 L 225.5,131.8 L 220.7,129.9 L 216.4,126.1 L 209.3,125.0 L 208.3,126.0 L 207.6,128.5 L 208.7,135.0 L 205.7,138.0 L 201.7,134.5 L 200.3,131.7 L 195.7,133.9 L 195.1,136.4 L 200.0,140.1 L 198.8,145.4 L 194.8,144.5 L 194.7,148.3 L 199.5,154.8 L 202.7,159.6 L 202.2,161.6 L 194.3,164.0 L 192.4,167.1 L 191.0,172.1 L 189.7,175.0 L 185.8,180.5 L 186.0,183.3 L 184.7,186.6 L 178.0,192.4 L 172.4,195.0 L 160.9,192.3 L 160.6,186.5 L 156.9,186.1 L 154.5,182.5 L 150.3,180.9 L 145.9,177.9 L 141.0,177.9 L 138.1,176.7 L 133.9,182.1 L 129.3,176.3 L 131.4,169.7 L 127.7,165.7 L 123.8,162.6 L 125.6,159.0 L 125.4,156.6 L 121.4,153.7 L 115.4,149.1 L 112.5,147.7 L 108.6,147.1 L 105.4,149.0 L 101.5,149.8 L 96.7,149.6 L 95.5,150.5 L 91.1,152.5 L 87.2,155.7 L 84.5,151.9 L 81.5,149.9 L 79.7,151.7 L 79.6,158.3 L 82.7,162.2 L 79.6,166.2 L 72.6,166.0 L 69.4,172.5 L 64.9,172.9 L 67.4,169.3 L 63.8,165.3 L 59.8,162.6 L 63.8,155.2 L 67.6,154.4 L 69.7,151.3 L 64.1,150.7 L 63.5,143.6 L 69.4,143.8 L 75.5,137.2 L 83.2,130.8 L 88.2,131.2 L 92.1,128.5 L 89.0,122.7 L 93.3,118.4 L 98.7,117.9 L 105.7,116.3 L 111.9,115.5 L 119.1,110.7 L 121.8,109.2 L 125.7,108.3 L 135.4,105.2 L 134.2,110.3 L 138.5,110.3 L 143.2,104.1 L 148.9,101.2 L 152.8,92.9 L 162.2,91.1 L 168.5,89.9 L 178.5,83.7 L 185.9,77.4 L 198.0,71.6 L 204.8,70.6 L 212.2,66.9 L 215.7,61.4 L 215.5,54.1 L 220.8,47.6 L 226.4,43.6 L 229.5,36.0 L 237.6,28.3 L 241.9,25.5 Z",
        "center_x": 175,
        "kannada_y": 115,
        "english_y": 138,
        # Cool, rich imperial amethyst & sunset terracotta gradient fill
        "bg_start": "#4a044e",
        "bg_mid": "#701a75",
        "bg_end": "#9a3412",
        "border_color": "#facc15",
        "glow_rgb": "168, 85, 247",
        "image": "/static/users/images/hampi.jpg",
    },
    "udupi": {
        "slug": "Udupi",
        "kannada": "ಉಡುಪಿ",
        "english": "UDUPI",
        "route": "Udupi",
        "district_shape_path": "M 128.1,30.8 L 126.8,33.2 L 129.3,34.7 L 130.8,38.2 L 135.7,36.7 L 137.4,37.4 L 140.8,36.6 L 144.0,38.2 L 145.2,37.5 L 147.9,38.2 L 152.7,40.3 L 154.8,42.7 L 156.3,46.2 L 158.0,45.8 L 159.8,44.8 L 163.3,45.9 L 164.5,47.5 L 166.3,54.6 L 167.8,57.9 L 168.2,60.8 L 169.3,62.5 L 174.0,64.3 L 177.6,66.3 L 178.4,66.7 L 178.1,69.1 L 177.2,71.2 L 181.9,73.5 L 180.8,74.4 L 182.8,77.7 L 182.8,79.2 L 181.0,79.7 L 181.5,83.0 L 182.0,84.9 L 184.0,86.8 L 184.7,87.8 L 187.5,88.2 L 188.6,89.1 L 188.7,91.6 L 187.8,92.7 L 185.6,93.2 L 184.4,94.9 L 185.6,96.6 L 186.5,97.8 L 189.1,102.4 L 189.2,103.7 L 190.5,103.3 L 192.0,108.0 L 193.4,107.9 L 195.8,108.7 L 197.4,112.2 L 198.3,114.3 L 202.2,113.6 L 204.5,115.1 L 204.5,117.5 L 204.4,118.6 L 203.2,121.2 L 202.3,123.0 L 202.4,126.3 L 200.2,126.5 L 200.0,129.6 L 195.8,130.9 L 193.9,130.8 L 192.0,133.8 L 196.3,142.1 L 198.8,144.2 L 200.4,143.6 L 201.9,143.1 L 206.7,153.4 L 206.7,157.5 L 207.0,158.4 L 208.2,158.1 L 212.1,163.0 L 209.3,165.0 L 207.0,168.0 L 205.3,169.3 L 203.4,170.7 L 201.9,169.5 L 200.0,169.8 L 195.2,176.9 L 193.9,179.0 L 192.5,180.8 L 191.9,183.1 L 191.4,184.6 L 188.9,186.7 L 186.5,188.8 L 183.4,192.7 L 181.5,193.3 L 178.9,194.9 L 176.7,194.2 L 176.2,192.1 L 177.8,191.6 L 178.3,190.2 L 177.7,189.1 L 173.3,189.5 L 172.5,190.0 L 171.1,189.2 L 169.1,191.0 L 166.7,191.3 L 167.5,189.8 L 167.4,186.9 L 166.2,186.5 L 164.9,186.3 L 163.8,186.1 L 162.8,187.6 L 162.6,188.3 L 160.9,186.0 L 158.8,184.1 L 160.1,181.6 L 159.6,180.5 L 159.9,176.1 L 157.5,176.1 L 156.9,173.4 L 155.3,170.9 L 152.7,170.4 L 150.0,170.8 L 148.4,171.2 L 146.6,172.9 L 144.4,174.0 L 143.7,175.7 L 142.5,175.8 L 143.0,174.9 L 141.2,174.5 L 140.6,175.8 L 140.8,177.0 L 140.3,177.7 L 139.7,176.9 L 135.8,160.8 L 133.9,154.2 L 131.9,145.7 L 130.4,139.0 L 128.6,134.3 L 128.3,133.6 L 130.8,139.9 L 131.7,144.3 L 132.6,143.5 L 133.5,142.4 L 132.7,142.8 L 131.4,142.3 L 131.4,140.3 L 131.2,139.4 L 129.3,134.2 L 128.9,133.8 L 126.6,132.6 L 127.2,130.3 L 126.9,123.3 L 126.4,114.5 L 124.3,98.6 L 122.4,84.0 L 121.4,82.4 L 119.1,78.5 L 116.4,64.8 L 114.9,56.4 L 113.5,51.3 L 112.4,45.5 L 112.9,47.0 L 116.1,47.4 L 113.1,46.9 L 113.4,45.6 L 112.2,44.3 L 109.5,40.7 L 107.8,34.8 L 110.1,33.4 L 111.1,31.9 L 112.3,32.3 L 115.3,32.7 L 117.2,31.4 L 118.5,32.4 L 119.8,30.8 L 120.8,26.4 L 123.3,25.8 L 125.5,28.2 L 127.4,29.7 L 128.1,30.8 Z",
        "center_x": 160,
        "kannada_y": 108,
        "english_y": 131,
        # Cool, rich arabian deep ocean & cyan coastal gradient fill
        "bg_start": "#0c4a6e",
        "bg_mid": "#0284c7",
        "bg_end": "#0d9488",
        "border_color": "#38bdf8",
        "glow_rgb": "14, 165, 233",
        "image": "/static/users/images/udupi.jpg",
    },
}


def dashboard(request):
    districts = District.objects.prefetch_related("places").all()

    def find_place(*keywords):
        for keyword in keywords:
            place = (
                Place.objects
                .filter(name__icontains=keyword)
                .exclude(image="")
                .exclude(image__isnull=True)
                .select_related("district")
                .first()
            )
            if place:
                return place
        return None

    featured_places = {
        "mysore": find_place("Mysore Palace", "Mysore"),
        "madikeri": find_place("Abbey Falls", "Madikeri"),
        "chikmagalur": find_place("Mullayanagiri", "Baba Budangiri", "Chikkamagaluru"),
        "hampi": find_place("Virupaksha Temple", "Vittala Temple", "Hampi"),
        "udupi": find_place("Sri Krishna Temple", "Malpe Beach", "St. Mary's Island", "Udupi"),
    }

    stats = {
        "destinations_count": Place.objects.count(),
        "districts_count": District.objects.count(),
        "stops_count": TransitStop.objects.count(),
        "routes_count": Route.objects.count(),
        "providers_count": TransportProvider.objects.count(),
    }

    district_map = {d.name.lower(): d for d in districts}

    karnataka_cards = []
    for meta in KARNATAKA_DISTRICTS_DATA:
        card = dict(meta)
        db_district = district_map.get(meta["db_name"].lower())
        if db_district:
            card["places_count"] = db_district.places.count()
            card["route_name"] = db_district.name
            first_place = db_district.places.exclude(image="").first()
            if first_place and first_place.image:
                card["primary_image"] = first_place.image.url
            else:
                card["primary_image"] = f"/static/{meta['static_image']}"
        else:
            card["places_count"] = 6
            card["route_name"] = meta["db_name"]
            card["primary_image"] = f"/static/{meta['static_image']}"
        karnataka_cards.append(card)

    # 1. Fetch search history from user session & cookie (Based on recent searches only)
    searched_keys = list(request.session.get("recent_searches", []))
    cookie_search = request.COOKIES.get("last_district_search")
    if cookie_search and cookie_search.lower() not in [s.lower() for s in searched_keys]:
        searched_keys.insert(0, cookie_search)
    
    # 2. De-duplicate and resolve to authentic district map keys
    ordered_keys = []
    seen = set()
    for raw in searched_keys:
        k = raw.strip().lower()
        # Aliases
        if "kodagu" in k or "coorg" in k or "madikeri" in k:
            k = "kodagu"
        elif "mysore" in k or "mysuru" in k:
            k = "mysore"
        elif "hampi" in k or "vijayanagara" in k or "hosapete" in k:
            k = "hampi"
        elif "udupi" in k or "malpe" in k:
            k = "udupi"

        if k in AUTHENTIC_DISTRICT_MAPS and k not in seen:
            seen.add(k)
            ordered_keys.append(k)

    # 3. Fill up to 4 using unique authentic Karnataka districts if user hasn't searched 4 yet
    default_order = ["mysore", "kodagu", "hampi", "udupi"]
    for k in default_order:
        if k not in seen and len(ordered_keys) < 4:
            seen.add(k)
            ordered_keys.append(k)

    # 4. Construct recent_searches list with original authentic Karnataka map shapes
    recent_searches = [AUTHENTIC_DISTRICT_MAPS[k] for k in ordered_keys[:4]]

    # 5. Fetch user active trips & personalized explorer stats (Super creative dashboard)
    user_trips = []
    user_stats = {
        "trips_count": 0,
        "total_budget": 0,
        "districts_count": 0,
        "explorer_level": "Karnataka Explorer · ಕರ್ನಾಟಕ ಯಾತ್ರಿಕ",
    }
    if request.user.is_authenticated:
        try:
            from expenses.models import TripTrackingSession
            user_trips = list(
                TripTrackingSession.objects.filter(user=request.user)
                .select_related("place", "place__district")
                .order_by("-start_date")[:4]
            )
            for s in user_trips:
                s.refresh_status()

            all_user_sessions = TripTrackingSession.objects.filter(user=request.user)
            t_count = all_user_sessions.count()
            t_budget = sum(s.expected_budget for s in all_user_sessions)
            d_count = all_user_sessions.values("place__district").distinct().count()

            user_stats["trips_count"] = t_count
            user_stats["total_budget"] = int(t_budget)
            user_stats["districts_count"] = max(d_count, min(t_count, 1))

            if t_count >= 5:
                user_stats["explorer_level"] = "Master Voyager · ಪಾರಂಗತ ಪ್ರವಾಸಿ"
            elif t_count >= 2:
                user_stats["explorer_level"] = "Heritage Trailblazer · ಪರಂಪರೆ ಯಾತ್ರಿ"
            elif t_count >= 1:
                user_stats["explorer_level"] = "Active Explorer · ಹೊಸ ಯಾತ್ರಿ"
            else:
                user_stats["explorer_level"] = "Karnataka Explorer · ಕರ್ನಾಟಕ ಯಾತ್ರಿಕ"
        except Exception:
            pass

    # Curated Thematic Karnataka Travel Trails
    thematic_trails = [
        {
            "id": "heritage",
            "title_kannada": "ರಾಜ ಪರಂಪರೆ & ಶಿಲ್ಪಕಲೆ",
            "title_english": "UNESCO Heritage & Royal Dynasties",
            "tag": "UNESCO HERITAGE",
            "tag_color": "#b45309",
            "icon": "fa-landmark-dome",
            "bg_gradient": "linear-gradient(135deg, #2a1407 0%, #5a270f 100%)",
            "description": "Marvel at the stone chariot of Vijayanagara, Hoysala soapstone carvings, and opulent Mysore palaces.",
            "duration": "4–5 Days Circuit",
            "best_bus": "🌟 1st Preference: KSRTC Heritage Rajahamsa",
            "places": [
                {"name": "Mysore Palace", "district": "Mysuru", "slug": "mysore", "image": "/static/users/images/mysore.jpg"},
                {"name": "Virupaksha Temple", "district": "Hampi", "slug": "virupaksha-temple", "image": "/static/users/images/hampi.jpg"},
                {"name": "Chennakeshava Temple", "district": "Belur", "slug": "chennakeshava-temple", "image": "/static/users/images/belur.jpg"},
                {"name": "Hoysaleswara Temple", "district": "Halebidu", "slug": "hoysaleswara-templehalebidu", "image": "/static/users/images/halebidu.jpg"},
            ],
        },
        {
            "id": "western_ghats",
            "title_kannada": "ಮಲೆನಾಡು & ಗಿರಿಧಾಮಗಳು",
            "title_english": "Misty Western Ghats & Coffee Highlands",
            "tag": "HIGHLANDS & MIST",
            "tag_color": "#047857",
            "icon": "fa-mountain-sun",
            "bg_gradient": "linear-gradient(135deg, #063e2f 0%, #065f46 100%)",
            "description": "Breathe fresh Arabica coffee blossoms and trek along Karnataka's highest cloud-kissed peaks.",
            "duration": "3–4 Days Getaway",
            "best_bus": "🌟 1st: KSRTC Sarige • Option: VRL Sleeper",
            "places": [
                {"name": "Mullayanagiri & Baba Budan", "district": "Chikkamagaluru", "slug": "baba-budangiri", "image": "/static/users/images/chikmagalur.jpg"},
                {"name": "Abbey Falls", "district": "Kodagu", "slug": "abbey-falls", "image": "/static/users/images/madikeri.jpg"},
                {"name": "Agumbe Rainforest", "district": "Shivamogga", "slug": "agumbe", "image": "/static/users/images/shivamogga.jpg"},
                {"name": "Iruppu Falls", "district": "Kodagu", "slug": "iruppu-falls", "image": "/static/users/images/madikeri.jpg"},
            ],
        },
        {
            "id": "coastal",
            "title_kannada": "ಕರಾವಳಿ ತೀರ & ಪವಿತ್ರ ಕ್ಷೇತ್ರಗಳು",
            "title_english": "Sacred Coastline & Golden Sands",
            "tag": "ARABIAN SEA TRAILS",
            "tag_color": "#0284c7",
            "icon": "fa-umbrella-beach",
            "bg_gradient": "linear-gradient(135deg, #083344 0%, #0369a1 100%)",
            "description": "Walk along pristine Om Beach, visit sacred Krishna Mutt, and cruise to volcanic basalt sea islands.",
            "duration": "3 Days Coastal Loop",
            "best_bus": "🌟 1st: NWKRTC Coastal • Option: Seabird",
            "places": [
                {"name": "Om Beach Gokarna", "district": "Uttara Kannada", "slug": "om-beach-gokarna", "image": "/static/users/images/gokarna.jpg"},
                {"name": "Sri Krishna Temple", "district": "Udupi", "slug": "sri-krishna-temple", "image": "/static/users/images/udupi.jpg"},
                {"name": "Murudeshwar Temple", "district": "Uttara Kannada", "slug": "murudeshwar-temple", "image": "/static/users/images/gokarna.jpg"},
                {"name": "Malpe Beach & St. Mary's", "district": "Udupi", "slug": "malpe-beach", "image": "/static/users/images/udupi.jpg"},
            ],
        },
        {
            "id": "waterfalls",
            "title_kannada": "ರುದ್ರರಮಣೀಯ ಜಲಪಾತಗಳು",
            "title_english": "Cascades & Kaveri River Basins",
            "tag": "WATERFALLS & RIVER",
            "tag_color": "#0f766e",
            "icon": "fa-cloud-showers-heavy",
            "bg_gradient": "linear-gradient(135deg, #0e3a38 0%, #0f766e 100%)",
            "description": "Roaring Jog Falls, twin torrents of Shivanasamudra, and Kaveri bird sanctuary wetlands.",
            "duration": "2–3 Days Weekend",
            "best_bus": "🌟 1st Preference: KSRTC Express",
            "places": [
                {"name": "Jog Falls", "district": "Shivamogga", "slug": "jog-falls", "image": "/static/users/images/shivamogga.jpg"},
                {"name": "Shivanasamudra Falls", "district": "Mandya", "slug": "shivanasamudra-falls", "image": "/static/users/images/mandya.jpg"},
                {"name": "Ranganathittu Bird Sanctuary", "district": "Mandya", "slug": "ranganathittu-bird-sanctuary", "image": "/static/users/images/mandya.jpg"},
                {"name": "Chunchanakatte Falls", "district": "Mysore", "slug": "chunchanakatte-falls", "image": "/static/users/images/mysore.jpg"},
            ],
        },
    ]

    transit_pulse = {
        "status_text": "All Karnataka Intercity Bus Corridors Fully Operational",
        "ksrtc_guarantee": "🌟 1st Preference: 8,500+ Daily KSRTC Govt Schedules • Fixed State Tariffs • Shakti Scheme Active for Women",
        "private_advisory": "Alternative Option: Verified Private Luxury Sleepers (VRL, SRS, Seabird, Durgamba, Sugama) on Major Corridors",
        "destinations_weather": [
            {"place": "Madikeri (Coorg)", "temp": "21°C", "condition": "Misty & Pleasant", "icon": "fa-cloud"},
            {"place": "Mysuru", "temp": "27°C", "condition": "Royal Sunshine", "icon": "fa-sun"},
            {"place": "Gokarna", "temp": "29°C", "condition": "Coastal Breeze", "icon": "fa-wind"},
            {"place": "Hampi", "temp": "31°C", "condition": "Warm Heritage Day", "icon": "fa-sun"},
            {"place": "Chikkamagaluru", "temp": "22°C", "condition": "Cool Coffee Breeze", "icon": "fa-cloud-sun"},
        ],
    }

    return render(
        request,
        "users/dashboard.html",
        {
            "districts": districts,
            "featured_places": featured_places,
            "karnataka_cards": karnataka_cards,
            "recent_searches": recent_searches,
            "stats": stats,
            "user_trips": user_trips,
            "user_stats": user_stats,
            "thematic_trails": thematic_trails,
            "transit_pulse": transit_pulse,
        },
    )


DISTRICT_ALIASES = {
    "chikkamagaluru": "Chikkamagaluru",
    "chikmagalur": "Chikkamagaluru",
    "chikmagaluru": "Chikkamagaluru",
    "chikamanglore": "Chikkamagaluru",
    "chikkamangalore": "Chikkamagaluru",
    "hampi": "Hampi",
    "vijayanagara": "Hampi",
    "hosapete": "Hampi",
    "hospet": "Hampi",
    "udupi": "Udupi",
    "malpe": "Udupi",
    "mangaluru": "Mangaluru",
    "mangalore": "Mangaluru",
    "dakshina kannada": "Mangaluru",
    "dakshina-kannada": "Mangaluru",
    "shivamogga": "Shivamogga",
    "shimoga": "Shivamogga",
    "mandya": "Mandya",
    "srirangapatna": "Mandya",
    "hassan": "hassan",
    "belur": "hassan",
    "halebidu": "hassan",
    "kodagu": "kodagu",
    "coorg": "kodagu",
    "madikeri": "kodagu",
    "mysore": "mysore",
    "mysuru": "mysore",
    "uttara kannada": "uttara kannada",
    "uttara-kannada": "uttara kannada",
    "karwar": "uttara kannada",
    "gokarna": "uttara kannada",
}


def places_by_district(request, district_name):
    clean_name = (district_name or "").strip().lower()

    # Track in recent searches session (pushed to front, unique)
    search_history = request.session.get("recent_searches", [])
    slug_to_record = clean_name
    if "kodagu" in clean_name or "coorg" in clean_name or "madikeri" in clean_name:
        slug_to_record = "kodagu"
    elif "mysore" in clean_name or "mysuru" in clean_name:
        slug_to_record = "mysore"
    elif "hampi" in clean_name or "vijayanagara" in clean_name:
        slug_to_record = "hampi"
    elif "udupi" in clean_name or "malpe" in clean_name:
        slug_to_record = "udupi"

    if slug_to_record in search_history:
        search_history.remove(slug_to_record)
    search_history.insert(0, slug_to_record)
    request.session["recent_searches"] = search_history[:8]
    request.session.modified = True

    district = District.objects.filter(name__iexact=clean_name).first()

    if not district:
        resolved_name = DISTRICT_ALIASES.get(clean_name, clean_name)
        district = District.objects.filter(name__iexact=resolved_name).first()

    if not district:
        district = District.objects.filter(name__icontains=clean_name).first()

    if not district:
        place = Place.objects.filter(name__icontains=clean_name).first()
        if place and getattr(place, "slug", None):
            return redirect("explorer:place_detail", slug=place.slug)

    if not district:
        district = District.objects.first()

    if not district:
        district = get_object_or_404(District, name__iexact=district_name)

    all_places = Place.objects.filter(district=district)
    places = all_places

    selected_category = request.GET.get("category", "")
    valid_categories = {key for key, _ in Place.CATEGORY_CHOICES}
    if selected_category in valid_categories:
        places = places.filter(category=selected_category)
    else:
        selected_category = ""

    background_place = all_places.exclude(image="").first()

    context = {
        "district": district,
        "places": places,
        "background_place": background_place,
        "selected_category": selected_category,
    }

    return render(request, "users/places.html", context)


def logout_view(request):
    logout(request)
    return redirect("login")


DISTRICT_COORDINATES = {
    "mysore": {"name": "Mysore (Mysuru)", "lat": 12.2958, "lng": 76.6394, "slug": "mysore"},
    "kodagu": {"name": "Kodagu (Madikeri / Coorg)", "lat": 12.4244, "lng": 75.7382, "slug": "kodagu"},
    "hassan": {"name": "Hassan (Belur / Halebidu)", "lat": 13.0033, "lng": 76.1004, "slug": "hassan"},
    "uttara kannada": {"name": "Uttara Kannada (Gokarna / Dandeli)", "lat": 14.8136, "lng": 74.1298, "slug": "uttara kannada"},
    "chikkamagaluru": {"name": "Chikkamagaluru (Mullayanagiri)", "lat": 13.3161, "lng": 75.7720, "slug": "Chikkamagaluru"},
    "hampi": {"name": "Hampi (Vijayanagara)", "lat": 15.3350, "lng": 76.4600, "slug": "Hampi"},
    "udupi": {"name": "Udupi (Krishna Temple / Malpe)", "lat": 13.3409, "lng": 74.7421, "slug": "Udupi"},
    "mangaluru": {"name": "Mangaluru (Dakshina Kannada)", "lat": 12.9141, "lng": 74.8560, "slug": "Mangaluru"},
    "shivamogga": {"name": "Shivamogga (Jog Falls)", "lat": 13.9299, "lng": 75.5681, "slug": "Shivamogga"},
    "mandya": {"name": "Mandya (Srirangapatna)", "lat": 12.5244, "lng": 76.8958, "slug": "Mandya"},
}


def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2.0) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 1)


def nearest_district_api(request):
    try:
        user_lat = float(request.GET.get("lat"))
        user_lng = float(request.GET.get("lng"))
    except (TypeError, ValueError):
        return JsonResponse({"status": "error", "message": "Valid lat and lng required."}, status=400)

    # Persist in session
    request.session["user_lat"] = user_lat
    request.session["user_lng"] = user_lng

    districts_ranked = []
    for slug, meta in DISTRICT_COORDINATES.items():
        dist = haversine_distance(user_lat, user_lng, meta["lat"], meta["lng"])
        db_district = District.objects.filter(name__iexact=slug).first()
        places_count = db_district.places.count() if db_district else 0
        sample_places = list(db_district.places.values_list("name", flat=True)[:3]) if db_district else []

        districts_ranked.append({
            "slug": meta["slug"],
            "name": meta["name"],
            "lat": meta["lat"],
            "lng": meta["lng"],
            "distance_km": dist,
            "places_count": places_count,
            "sample_places": sample_places,
            "url": f"/places/{meta['slug']}/",
            "planner_url": f"/explorer/dashboard/?from=live&district={meta['slug']}",
        })

    districts_ranked.sort(key=lambda d: d["distance_km"])
    nearest = districts_ranked[0] if districts_ranked else None

    if nearest:
        request.session["nearest_district"] = nearest["slug"]

    response = JsonResponse({
        "status": "success",
        "user_coords": {"lat": user_lat, "lng": user_lng},
        "nearest": nearest,
        "ranked_districts": districts_ranked,
    })

    # Set cookies for client-side persistence across pages
    response.set_cookie("tourist_user_lat", str(user_lat), max_age=604800, samesite="Lax")
    response.set_cookie("tourist_user_lng", str(user_lng), max_age=604800, samesite="Lax")
    if nearest:
        response.set_cookie("tourist_user_district", nearest["slug"], max_age=604800, samesite="Lax")
    return response
