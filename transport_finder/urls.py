from .views import (
    search_routes,
    search_stops,
    transport_search,
    search_by_location,   # add this
)
from django.urls import path

urlpatterns = [

    path("search/", search_routes, name="search_routes"),
    path("stops/", search_stops, name="search_stops"),
    path("stop-search/", transport_search, name="transport_search"),

    path(
        "search-by-location/",
        search_by_location,
        name="search_by_location",
    ),
]