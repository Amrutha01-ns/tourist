from django.urls import path
from . import views

app_name = "expenses"

urlpatterns = [
    path("", views.expense_hub, name="hub"),
    path("start/<slug:slug>/", views.start_or_resume_session, name="start_session"),
    path("tracker/<uuid:session_id>/", views.tracker_dashboard, name="tracker_dashboard"),
    path("tracker/<uuid:session_id>/add/", views.add_expense, name="add_expense"),
    path("tracker/<uuid:session_id>/edit/<uuid:expense_id>/", views.edit_expense, name="edit_expense"),
    path("tracker/<uuid:session_id>/delete/<uuid:expense_id>/", views.delete_expense, name="delete_expense"),
    path("tracker/<uuid:session_id>/complete/", views.complete_session, name="complete_session"),
    path("tracker/<uuid:session_id>/report/", views.trip_report, name="trip_report"),
    path("tracker/<uuid:session_id>/late-entry/", views.add_late_entry, name="add_late_entry"),
    path("api/insights/<slug:slug>/", views.destination_insights_api, name="destination_insights"),
]
