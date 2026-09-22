# engine/services/validator.py
from .estimator import estimate_trip_cost


def validate_budget(city, days, travellers, budget):
    """
    Check whether the given budget covers the estimated cost of the trip.
    """
    estimate = estimate_trip_cost(city, days, travellers)
    total_estimated = estimate["total_estimated"]

    base_response = {
        "city_tier": estimate["city_tier"],
        "rates_used": estimate["rates_used"],
        "nights_charged": estimate["nights_charged"],
        "estimated_total": total_estimated,
        "entered_budget": budget,
    }

    if budget < total_estimated:
        shortfall = round(total_estimated - budget, 2)
        return {
            **base_response,
            "valid": False,
            "message": f"Your budget is too low for {travellers} traveller(s) over {days} day(s).",
            "shortfall": shortfall,
        }

    return {
        **base_response,
        "valid": True,
        "message": "Your budget comfortably covers this trip.",
        "surplus": round(budget - total_estimated, 2),
    }