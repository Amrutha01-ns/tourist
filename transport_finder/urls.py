from django.urls import path
from .views import search_routes,search_stops

urlpatterns = [
    path("search/", search_routes, name="search_routes"),
    path("stops/", search_stops),
]