import uuid
from datetime import date, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo
from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.urls import reverse
from django.utils import timezone

from places.models import District, Place
from expenses.models import TripTrackingSession, ExpenseTransaction, ExpenseAuditLog, IST_ZONE
from expenses.services.tracker_service import build_tracker_context, compute_destination_community_insights
from expenses.services.feedback_engine import generate_trip_feedback


class ExpenseTrackingSystemTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username="traveller_ajay",
            email="ajay@example.com",
            password="SecurePassword123!",
        )
        self.other_user = User.objects.create_user(
            username="other_person",
            email="other@example.com",
            password="SecurePassword123!",
        )

        self.district = District.objects.create(name="Vijayanagara")
        self.place = Place.objects.create(
            district=self.district,
            name="Hampi Heritage Site",
            slug="hampi-heritage-site",
            category="historical",
            speciality="UNESCO World Heritage ruins",
            description="Ancient monuments and temples of the Vijayanagara Empire.",
        )

        self.today = timezone.now().astimezone(IST_ZONE).date()

    def test_01_start_new_tracking_session(self):
        """Scenario 1: Starting a new trip tracking session with prefilled destination and budget."""
        self.client.login(username="traveller_ajay", password="SecurePassword123!")
        url = reverse("expenses:start_session", kwargs={"slug": self.place.slug})
        response = self.client.post(url, {
            "budget": "5000",
            "days": "3",
            "travellers": "2",
            "start_date": self.today.strftime("%Y-%m-%d"),
        })

        self.assertEqual(response.status_code, 302)
        session = TripTrackingSession.objects.filter(user=self.user, place=self.place).first()
        self.assertIsNotNone(session)
        self.assertEqual(session.expected_budget, Decimal("5000.00"))
        self.assertEqual(session.total_days, 3)
        self.assertEqual(session.travellers, 2)
        self.assertEqual(session.status, "active")

    def test_02_multiple_expenses_same_day(self):
        """Scenario 2: Recording multiple expenses on the same day."""
        session = TripTrackingSession.objects.create(
            user=self.user,
            place=self.place,
            start_date=self.today,
            end_date=self.today + timedelta(days=2),
            travellers=1,
            expected_budget=Decimal("5000.00"),
            status="active",
        )

        self.client.login(username="traveller_ajay", password="SecurePassword123!")
        add_url = reverse("expenses:add_expense", kwargs={"session_id": session.id})

        items = [
            ("food", "100.00", "Breakfast idli & tea"),
            ("bus_local", "50.00", "Local shuttle to bazaar"),
            ("food", "150.00", "Lunch thali"),
            ("sightseeing", "200.00", "Temple complex entry ticket"),
        ]

        for cat, amt, desc in items:
            res = self.client.post(add_url, {
                "amount": amt,
                "category": cat,
                "description": desc,
                "expense_date": self.today.strftime("%Y-%m-%d"),
                "payment_method": "upi",
            })
            self.assertEqual(res.status_code, 302)

        self.assertEqual(session.expenses.count(), 4)
        self.assertEqual(session.total_actual_expenses, Decimal("500.00"))

    def test_03_expenses_across_three_days(self):
        """Scenario 3: Recording expenses across three separate trip days."""
        d1 = self.today
        d2 = self.today + timedelta(days=1)
        d3 = self.today + timedelta(days=2)

        session = TripTrackingSession.objects.create(
            user=self.user,
            place=self.place,
            start_date=d1,
            end_date=d3,
            travellers=1,
            expected_budget=Decimal("5000.00"),
            status="active",
        )

        # Day 1 entries: total 500
        ExpenseTransaction.objects.create(session=session, user=self.user, amount=Decimal("100"), category="food", description="Breakfast", expense_date=d1)
        ExpenseTransaction.objects.create(session=session, user=self.user, amount=Decimal("50"), category="bus_local", description="Bus", expense_date=d1)
        ExpenseTransaction.objects.create(session=session, user=self.user, amount=Decimal("150"), category="food", description="Lunch", expense_date=d1)
        ExpenseTransaction.objects.create(session=session, user=self.user, amount=Decimal("200"), category="sightseeing", description="Sightseeing", expense_date=d1)

        # Day 2 entries: total 1500
        ExpenseTransaction.objects.create(session=session, user=self.user, amount=Decimal("100"), category="food", description="Breakfast", expense_date=d2)
        ExpenseTransaction.objects.create(session=session, user=self.user, amount=Decimal("1000"), category="hotel", description="Hotel Stay", expense_date=d2)
        ExpenseTransaction.objects.create(session=session, user=self.user, amount=Decimal("100"), category="bus_local", description="Local transport", expense_date=d2)
        ExpenseTransaction.objects.create(session=session, user=self.user, amount=Decimal("300"), category="shopping", description="Shopping souvenirs", expense_date=d2)

        # Day 3 entries: total 550
        ExpenseTransaction.objects.create(session=session, user=self.user, amount=Decimal("250"), category="food", description="Food", expense_date=d3)
        ExpenseTransaction.objects.create(session=session, user=self.user, amount=Decimal("200"), category="train", description="Return Train Ticket", expense_date=d3)
        ExpenseTransaction.objects.create(session=session, user=self.user, amount=Decimal("100"), category="other", description="Misc snacks", expense_date=d3)

        ctx = build_tracker_context(session)

        # Verify Day-wise totals
        day1_ctx = next(d for d in ctx["trip_days"] if d["date"] == d1)
        day2_ctx = next(d for d in ctx["trip_days"] if d["date"] == d2)
        day3_ctx = next(d for d in ctx["trip_days"] if d["date"] == d3)

        self.assertEqual(day1_ctx["total"], Decimal("500.00"))
        self.assertEqual(day2_ctx["total"], Decimal("1500.00"))
        self.assertEqual(day3_ctx["total"], Decimal("550.00"))

        # Verify Overall Total
        self.assertEqual(ctx["total_actual"], Decimal("2550.00"))
        # Verify Remaining Budget (5000 - 2550 = 2450)
        self.assertEqual(ctx["remaining_budget"], Decimal("2450.00"))
        # Verify Average Daily Spending (2550 / 3 = 850)
        self.assertEqual(ctx["avg_daily_spending"], Decimal("850.00"))

    def test_04_edit_expense(self):
        """Scenario 4: Editing an existing expense entry."""
        session = TripTrackingSession.objects.create(
            user=self.user,
            place=self.place,
            start_date=self.today,
            end_date=self.today + timedelta(days=2),
            expected_budget=Decimal("3000.00"),
        )
        expense = ExpenseTransaction.objects.create(
            session=session,
            user=self.user,
            amount=Decimal("100.00"),
            category="food",
            description="Cafe coffee",
            expense_date=self.today,
        )

        self.client.login(username="traveller_ajay", password="SecurePassword123!")
        edit_url = reverse("expenses:edit_expense", kwargs={"session_id": session.id, "expense_id": expense.id})
        response = self.client.post(edit_url, {
            "amount": "140.00",
            "category": "food",
            "description": "Cafe coffee & cookies",
            "expense_date": self.today.strftime("%Y-%m-%d"),
            "payment_method": "upi",
            "location": "Hampi Market",
            "notes": "Bill updated",
        })

        self.assertEqual(response.status_code, 302)
        expense.refresh_from_db()
        self.assertEqual(expense.amount, Decimal("140.00"))
        self.assertEqual(expense.description, "Cafe coffee & cookies")

    def test_05_delete_expense(self):
        """Scenario 5: Deleting an expense with confirmation."""
        session = TripTrackingSession.objects.create(
            user=self.user,
            place=self.place,
            start_date=self.today,
            end_date=self.today + timedelta(days=1),
            expected_budget=Decimal("2000.00"),
        )
        expense = ExpenseTransaction.objects.create(
            session=session,
            user=self.user,
            amount=Decimal("350.00"),
            category="shopping",
            description="Duplicate souvenir entry",
            expense_date=self.today,
        )

        self.client.login(username="traveller_ajay", password="SecurePassword123!")
        delete_url = reverse("expenses:delete_expense", kwargs={"session_id": session.id, "expense_id": expense.id})
        res = self.client.post(delete_url)
        self.assertEqual(res.status_code, 302)
        self.assertFalse(ExpenseTransaction.objects.filter(id=expense.id).exists())

    def test_06_budget_comparison_and_overspending(self):
        """Scenario 8: Comparing expected and actual budgets when spending exceeds budget."""
        session = TripTrackingSession.objects.create(
            user=self.user,
            place=self.place,
            start_date=self.today,
            end_date=self.today + timedelta(days=1),
            expected_budget=Decimal("1000.00"),
        )
        ExpenseTransaction.objects.create(
            session=session,
            user=self.user,
            amount=Decimal("1450.00"),
            category="hotel",
            description="Resort stay",
            expense_date=self.today,
        )

        ctx = build_tracker_context(session)
        self.assertTrue(ctx["is_overbudget"])
        self.assertEqual(ctx["overbudget_amount"], Decimal("450.00"))

    def test_07_automatic_completion_on_end_date(self):
        """Scenario 9: Completing tracking automatically on the trip end date."""
        past_start = self.today - timedelta(days=5)
        past_end = self.today - timedelta(days=1)

        session = TripTrackingSession.objects.create(
            user=self.user,
            place=self.place,
            start_date=past_start,
            end_date=past_end,
            expected_budget=Decimal("4000.00"),
            status="active",
        )

        session.refresh_status()
        self.assertEqual(session.status, "completed")
        self.assertEqual(session.completion_reason, "auto_date_elapsed")
        self.assertIsNotNone(session.completed_at)

    def test_08_manual_completion(self):
        """Scenario 10: Completing tracking manually."""
        session = TripTrackingSession.objects.create(
            user=self.user,
            place=self.place,
            start_date=self.today,
            end_date=self.today + timedelta(days=3),
            expected_budget=Decimal("5000.00"),
            status="active",
        )

        self.client.login(username="traveller_ajay", password="SecurePassword123!")
        complete_url = reverse("expenses:complete_session", kwargs={"session_id": session.id})
        res = self.client.post(complete_url)

        self.assertEqual(res.status_code, 302)
        session.refresh_from_db()
        self.assertEqual(session.status, "completed")
        self.assertEqual(session.completion_reason, "manual_user")

    def test_09_unauthorized_access_protection(self):
        """Scenario 11: Preventing unauthorized expense access."""
        session = TripTrackingSession.objects.create(
            user=self.user,
            place=self.place,
            start_date=self.today,
            end_date=self.today + timedelta(days=2),
            expected_budget=Decimal("3000.00"),
        )

        # Login as other_user and attempt to view traveller_ajay's tracker
        self.client.login(username="other_person", password="SecurePassword123!")
        url = reverse("expenses:tracker_dashboard", kwargs={"session_id": session.id})
        res = self.client.get(url)
        self.assertEqual(res.status_code, 403)

    def test_10_late_entry_with_audit_trail(self):
        """Scenario 13: Handling late entries on completed trips with mandatory audit trail."""
        session = TripTrackingSession.objects.create(
            user=self.user,
            place=self.place,
            start_date=self.today - timedelta(days=4),
            end_date=self.today - timedelta(days=1),
            expected_budget=Decimal("3000.00"),
            status="completed",
        )

        self.client.login(username="traveller_ajay", password="SecurePassword123!")
        late_url = reverse("expenses:add_late_entry", kwargs={"session_id": session.id})
        res = self.client.post(late_url, {
            "amount": "120.00",
            "category": "parking_tolls",
            "description": "Forgot toll receipt from highway",
            "reason": "Found physical toll receipt in wallet after returning",
        })

        self.assertEqual(res.status_code, 302)
        tx = ExpenseTransaction.objects.filter(session=session, is_late_entry=True).first()
        self.assertIsNotNone(tx)
        self.assertEqual(tx.amount, Decimal("120.00"))

        audit = ExpenseAuditLog.objects.filter(session=session, transaction=tx).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.action, "created_late")
        self.assertIn("Found physical toll receipt", audit.reason)

    def test_11_intelligent_feedback_generation(self):
        """Scenario 14: Displaying the final feedback report correctly with real calculations."""
        session = TripTrackingSession.objects.create(
            user=self.user,
            place=self.place,
            start_date=self.today,
            end_date=self.today + timedelta(days=2),
            expected_budget=Decimal("5000.00"),
            estimated_transport=Decimal("300.00"),
            status="completed",
        )
        # Add real expenses: food 2000, bus 350
        ExpenseTransaction.objects.create(session=session, user=self.user, amount=Decimal("2000"), category="food", description="Food dining", expense_date=self.today)
        ExpenseTransaction.objects.create(session=session, user=self.user, amount=Decimal("350"), category="bus_local", description="KSRTC bus", expense_date=self.today)

        feedback = generate_trip_feedback(session)
        self.assertTrue(feedback["is_savings"])
        self.assertEqual(feedback["delta_amount"], Decimal("2650.00"))
        self.assertIn("Hampi Heritage Site", feedback["summary_narrative"])
        self.assertIn("Food & Restaurants was your largest expense category", feedback["summary_narrative"])
        self.assertTrue(feedback["transport"]["is_higher"])
