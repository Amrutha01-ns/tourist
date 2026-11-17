import json
from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.utils.translation import (
    check_for_language,
    get_language,
    get_language_info,
)
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST


@require_GET
@ensure_csrf_cookie
def get_languages(request):
    """
    API endpoint: Returns current active language and list of supported languages.
    """
    languages_data = []
    supported_languages = getattr(settings, "LANGUAGES", [])

    for code, name in supported_languages:
        try:
            info = get_language_info(code)
            languages_data.append({
                "code": code,
                "name": info.get("name", name),
                "name_local": info.get("name_local", name),
                "bidi": info.get("bidi", False),
            })
        except Exception:
            languages_data.append({
                "code": code,
                "name": name,
                "name_local": name,
                "bidi": False,
            })

    return JsonResponse({
        "status": "success",
        "current": get_language(),
        "languages": languages_data,
    })


@require_POST
def set_language_api(request):
    """
    API endpoint: Switches the active language for the user.
    Accepts either a JSON body: {"language": "<code>"} or POST form data.
    """
    lang_code = None

    # Check for JSON payload
    if request.content_type == "application/json":
        try:
            body = json.loads(request.body.decode("utf-8") or "{}")
            lang_code = body.get("language")
        except json.JSONDecodeError:
            return JsonResponse(
                {"status": "error", "message": "Invalid JSON payload."},
                status=400,
            )
    else:
        # Fallback to standard POST form data
        lang_code = request.POST.get("language")

    if not lang_code:
        return JsonResponse(
            {"status": "error", "message": "'language' field is required."},
            status=400,
        )

    # Validate that the language is supported
    if not check_for_language(lang_code):
        return JsonResponse(
            {
                "status": "error",
                "message": f"Language code '{lang_code}' is not supported.",
            },
            status=400,
        )

    response = JsonResponse({
        "status": "success",
        "language": lang_code,
        "message": f"Language switched to '{lang_code}'.",
    })

    # Persist in cookie
    cookie_name = getattr(settings, "LANGUAGE_COOKIE_NAME", "django_language")
    response.set_cookie(
        cookie_name,
        lang_code,
        max_age=getattr(settings, "LANGUAGE_COOKIE_AGE", 365 * 24 * 60 * 60),
        path=getattr(settings, "LANGUAGE_COOKIE_PATH", "/"),
        domain=getattr(settings, "LANGUAGE_COOKIE_DOMAIN", None),
        secure=getattr(settings, "LANGUAGE_COOKIE_SECURE", False),
        httponly=getattr(settings, "LANGUAGE_COOKIE_HTTPONLY", False),
        samesite=getattr(settings, "LANGUAGE_COOKIE_SAMESITE", None),
    )

    # Persist in session if session middleware is active
    if hasattr(request, "session"):
        request.session[cookie_name] = lang_code

    return response


def home(request):
    """Demo view demonstrating both classic and API i18n usage."""
    return render(request, "universal_i18n/demo/home.html")
