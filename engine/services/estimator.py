# engine/services/estimator.py
from .rates import get_rates_for_city


def estimate_trip_cost(city, days, travellers):
    """
    Estimate total trip cost for a given city, trip length, and traveller count.

    Day trips (days == 1) aren't charged for accommodation.
    Multi-day trips are charged for (days - 1) nights of stay.
    """
    tier, rates = get_rates_for_city(city)

    nights = max(days - 1, 0) if days > 1 else 0

    total = (rates["food"] + rates["activities"]) * days * travellers
    total += rates["stay"] * nights * travellers

    return {
        "city_tier": tier,
        "rates_used": rates,
        "nights_charged": nights,
        "total_estimated": round(total, 2),
    }