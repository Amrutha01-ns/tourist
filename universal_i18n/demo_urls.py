from django.urls import path
from .views import home

urlpatterns = [
    path("", home, name="i18n_demo_home"),
]