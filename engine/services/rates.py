# engine/services/rates.py

# Per-person-per-day rates, in ₹, by city tier
RATE_TABLE = {
    "budget": {      # small towns, tier-3 cities
        "stay": 500,
        "food": 300,
        "activities": 200,
    },
    "mid": {         # tier-2 cities, popular but not metro
        "stay": 1000,
        "food": 500,
        "activities": 400,
    },
    "premium": {     # metros, major tourist hubs
        "stay": 2000,
        "food": 900,
        "activities": 700,
    },
}

# Simple static mapping for now — expand this list as needed
CITY_TIER_MAP = {
    "bengaluru": "premium",
    "bangalore": "premium",
    "mumbai": "premium",
    "delhi": "premium",
    "goa": "premium",
    "jaipur": "mid",
    "mysuru": "mid",
    "mysore": "mid",
    "pondicherry": "mid",
}


def get_rates_for_city(city_name: str):
    key = (city_name or "").strip().lower()
    tier = CITY_TIER_MAP.get(key, "mid")  # default to "mid" if unknown
    return tier, RATE_TABLE[tier]