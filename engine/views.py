# engine/views.py
import json

from django.http import JsonResponse
from django.views.decorators.http import require_POST

from .services.validator import validate_budget


@require_POST
def estimate_trip(request):
    """
    POST body (JSON): { "city": str, "days": int, "travellers": int, "budget": number }
    Returns: validate_budget()'s result dict as JSON.
    """
    try:
        data = json.loads(request.body)
        city = data.get("city", "")
        days = int(data.get("days", 1))
        travellers = int(data.get("travellers", 1))
        budget = float(data.get("budget", 0))
    except (json.JSONDecodeError, TypeError, ValueError):
        return JsonResponse({"error": "Invalid input"}, status=400)

    if not city.strip():
        return JsonResponse({"error": "City is required"}, status=400)
    if days < 1 or travellers < 1:
        return JsonResponse(
            {"error": "Days and travellers must each be at least 1"}, status=400
        )

    result = validate_budget(city, days, travellers, budget)
    return JsonResponse(result)