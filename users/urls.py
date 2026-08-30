from django.urls import path
from . import views

urlpatterns = [
    path("register/", views.register, name="register"),
    path("login/",views.user_login,name="login"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("places/<str:district_name>/", views.places_by_district, name="places_by_district"),
    path("logout/", views.logout_view, name="logout"),
]