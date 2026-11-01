import uuid
from decimal import Decimal
from zoneinfo import ZoneInfo
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator
from django.utils import timezone
from places.models import Place

IST_ZONE = ZoneInfo("Asia/Kolkata")


class TripTrackingSession(models.Model):
    STATUS_CHOICES = [
        ("upcoming", "Upcoming"),
        ("active", "Active"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    COMPLETION_CHOICES = [
        ("auto_date_elapsed", "Auto Completed (End Date Elapsed)"),
        ("manual_user", "Manually Completed by User"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="trip_sessions",
    )
    place = models.ForeignKey(
        Place,
        on_delete=models.CASCADE,
        related_name="expense_sessions",
    )
    start_date = models.DateField(help_text="First day of trip in local timezone (IST).")
    end_date = models.DateField(help_text="Last day of trip in local timezone (IST).")
    travellers = models.PositiveIntegerField(default=1)

    expected_budget = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    estimated_food = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    estimated_stay = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    estimated_transport = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    estimated_activities = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="active",
        db_index=True,
    )
    completion_reason = models.CharField(
        max_length=50,
        choices=COMPLETION_CHOICES,
        blank=True,
    )
    completed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["place", "status"]),
        ]

    def __str__(self):
        return f"{self.user.username}'s trip to {self.place.name} ({self.start_date} to {self.end_date})"

    @property
    def total_days(self):
        if self.start_date and self.end_date:
            return max((self.end_date - self.start_date).days + 1, 1)
        return 1

    @property
    def local_today(self):
        return timezone.now().astimezone(IST_ZONE).date()

    @property
    def is_locked(self):
        return self.status in ["completed", "cancelled"]

    def refresh_status(self):
        """
        Dynamically refreshes the session status based on Asia/Kolkata date.
        If today > end_date and session is active/upcoming, auto-transitions to completed.
        """
        if self.status in ["completed", "cancelled"]:
            return self.status

        today = self.local_today
        if today > self.end_date:
            self.status = "completed"
            self.completion_reason = "auto_date_elapsed"
            if not self.completed_at:
                self.completed_at = timezone.now()
            self.save(update_fields=["status", "completion_reason", "completed_at", "updated_at"])
        elif today < self.start_date:
            if self.status != "upcoming":
                self.status = "upcoming"
                self.save(update_fields=["status", "updated_at"])
        else:
            if self.status != "active":
                self.status = "active"
                self.save(update_fields=["status", "updated_at"])
        return self.status

    @property
    def total_actual_expenses(self):
        from django.db.models import Sum
        val = self.expenses.aggregate(total=Sum("amount"))["total"]
        return val or Decimal("0.00")

    @property
    def remaining_budget(self):
        return self.expected_budget - self.total_actual_expenses

    @property
    def average_daily_spending(self):
        days_count = self.total_days
        if days_count <= 0:
            return Decimal("0.00")
        return round(self.total_actual_expenses / Decimal(str(days_count)), 2)

    @property
    def budget_consumed_percentage(self):
        if self.expected_budget <= 0:
            return 0
        return round(float(self.total_actual_expenses / self.expected_budget) * 100, 1)


class ExpenseTransaction(models.Model):
    CATEGORY_CHOICES = [
        ("food", "Food & Restaurants"),
        ("bus_local", "Bus & Local Transportation"),
        ("train", "Train"),
        ("taxi_auto", "Taxi & Auto"),
        ("hotel", "Hotel & Accommodation"),
        ("sightseeing", "Sightseeing & Entry Tickets"),
        ("shopping", "Shopping"),
        ("activities", "Activities & Entertainment"),
        ("parking_tolls", "Parking & Tolls"),
        ("other", "Other Expenses"),
        ("custom", "Custom Category"),
    ]

    PAYMENT_CHOICES = [
        ("upi", "UPI / Google Pay / PhonePe"),
        ("cash", "Cash"),
        ("card", "Credit / Debit Card"),
        ("netbanking", "Net Banking"),
        ("other", "Other Payment Method"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        TripTrackingSession,
        on_delete=models.CASCADE,
        related_name="expenses",
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="expenses",
    )
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
        help_text="Amount in INR (₹). Negative or zero amounts are forbidden.",
    )
    category = models.CharField(
        max_length=30,
        choices=CATEGORY_CHOICES,
        default="food",
        db_index=True,
    )
    custom_category_name = models.CharField(
        max_length=100,
        blank=True,
        help_text="Label if Custom Category is chosen.",
    )
    description = models.CharField(
        max_length=255,
        help_text="Short explanation of what this payment was for.",
    )
    expense_date = models.DateField(
        help_text="Calendar date when the expenditure was made.",
    )
    expense_time = models.TimeField(
        default=timezone.now,
        help_text="Time of transaction.",
    )
    location = models.CharField(
        max_length=200,
        blank=True,
        help_text="Name of town, stop, restaurant or landmark.",
    )
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_CHOICES,
        default="upi",
    )
    notes = models.TextField(
        blank=True,
        help_text="Optional remarks, receipt references, or notes.",
    )
    is_late_entry = models.BooleanField(
        default=False,
        help_text="True if recorded after trip completion under audit authorization.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-expense_date", "-expense_time", "-created_at"]
        indexes = [
            models.Index(fields=["session", "expense_date"]),
            models.Index(fields=["session", "category"]),
        ]

    def __str__(self):
        cat = self.display_category
        return f"₹{self.amount} for {cat} ({self.description})"

    @property
    def display_category(self):
        if self.category == "custom" and self.custom_category_name:
            return self.custom_category_name
        return dict(self.CATEGORY_CHOICES).get(self.category, self.category)

    @property
    def day_number(self):
        """Returns 1-based day number relative to session start_date."""
        if self.expense_date and self.session and self.session.start_date:
            delta = (self.expense_date - self.session.start_date).days + 1
            return max(delta, 1)
        return 1


class ExpenseAuditLog(models.Model):
    ACTION_CHOICES = [
        ("created_late", "Late Entry Added"),
        ("edited", "Entry Edited"),
        ("deleted", "Entry Deleted"),
        ("completed_early", "Trip Completed Early"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        TripTrackingSession,
        on_delete=models.CASCADE,
        related_name="audit_logs",
    )
    transaction = models.ForeignKey(
        ExpenseTransaction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
    )
    action = models.CharField(
        max_length=50,
        choices=ACTION_CHOICES,
    )
    reason = models.TextField(
        help_text="Justification provided by user for late or modified entry.",
    )
    amount_snapshot = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.user.username} {self.action} on {self.timestamp.strftime('%Y-%m-%d %H:%M')}"
