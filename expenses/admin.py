from django.contrib import admin
from .models import TripTrackingSession, ExpenseTransaction, ExpenseAuditLog


class ExpenseTransactionInline(admin.TabularInline):
    model = ExpenseTransaction
    extra = 0
    fields = ("expense_date", "category", "amount", "description", "payment_method", "is_late_entry")
    ordering = ("-expense_date", "-expense_time")


@admin.register(TripTrackingSession)
class TripTrackingSessionAdmin(admin.ModelAdmin):
    list_display = ("place", "user", "start_date", "end_date", "expected_budget", "status", "created_at")
    list_filter = ("status", "start_date", "place__district")
    search_fields = ("place__name", "user__username")
    inlines = [ExpenseTransactionInline]


@admin.register(ExpenseTransaction)
class ExpenseTransactionAdmin(admin.ModelAdmin):
    list_display = ("description", "session", "user", "amount", "category", "expense_date", "payment_method", "is_late_entry")
    list_filter = ("category", "payment_method", "is_late_entry", "expense_date")
    search_fields = ("description", "location", "session__place__name", "user__username")


@admin.register(ExpenseAuditLog)
class ExpenseAuditLogAdmin(admin.ModelAdmin):
    list_display = ("session", "user", "action", "amount_snapshot", "timestamp")
    list_filter = ("action", "timestamp")
    search_fields = ("reason", "user__username", "session__place__name")
