from django.urls import path
from users.views import places_by_district

urlpatterns = [
    path("<str:district_name>/", places_by_district, name="places_by_district"),
]
