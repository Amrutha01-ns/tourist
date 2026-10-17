from django.urls import path
from . import views

app_name = "explorer"

urlpatterns = [
    path("dashboard/", views.dashboard, name="dashboard"),
    path("<slug:slug>/", views.place_detail, name="place_detail"),
]