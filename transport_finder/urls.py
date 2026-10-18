
from django.urls import path
from .views import (
    search_routes,
    search_stops,
    transport_search,
    search_by_location,
    plan_bus_routes,
    plan_from_location,  # Add this line
)

urlpatterns = [
    path("search/", search_routes, name="search_routes"),
    path("stops/", search_stops, name="search_stops"),
    path("stop-search/", transport_search, name="transport_search"),

    path(
        "search-by-location/",
        search_by_location,
        name="search_by_location",
    ),

    # New bus route planner endpoint
    path(
        "plan/",
        plan_bus_routes,
        name="plan_bus_routes",
    ),

path(
    "plan-from-location/",
    plan_from_location,
    name="plan_from_location",
),

]
