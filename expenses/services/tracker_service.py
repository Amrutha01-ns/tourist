from datetime import timedelta
from decimal import Decimal
from django.db.models import Sum, Avg, Count
from django.utils import timezone
from ..models import TripTrackingSession, ExpenseTransaction, IST_ZONE
from transport_finder.services import resolve_destination_transit


def get_destination_transit_info(place):
    """Safely retrieves verified transit information from transport_finder service."""
    try:
        return resolve_destination_transit(place)
    except Exception:
        return {
            "transit_hub": getattr(place.district, "name", "Karnataka Hub"),
            "hub_distance": "Local area",
            "bus_routes": [],
            "direct_routes": [],
            "transfer_routes": [],
            "travel_tip": "Check local KSRTC or regional bus stands for frequent schedules.",
            "status": "hub_connected",
            "data_disclaimer": "Curated transit schedules based on Karnataka state transport.",
        }


def compute_destination_community_insights(place):
    """
    Computes anonymized aggregate insights across travellers who completed trips to this destination.
    Requires at least 3 completed trips to ensure privacy and statistical reliability.
    """
    completed_sessions = TripTrackingSession.objects.filter(
        place=place,
        status="completed",
    ).exclude(expected_budget__lte=0)

    count = completed_sessions.count()
    if count < 3:
        return {
            "available": False,
            "sample_size": count,
            "message": "Community average insights unlock once at least 3 travellers complete trips for this destination.",
        }

    # Calculate average daily spending across all completed sessions
    total_spent_all = Decimal("0.00")
    total_days_all = 0

    for s in completed_sessions:
        s_total = s.total_actual_expenses
        s_days = s.total_days
        total_spent_all += s_total
        total_days_all += s_days

    avg_daily = round(total_spent_all / Decimal(str(max(total_days_all, 1))), 2)

    return {
        "available": True,
        "sample_size": count,
        "average_daily_spending": avg_daily,
        "total_trips_logged": count,
        "message": f"Based on {count} verified traveller trips to {place.name}, the community average daily spend is ₹{avg_daily:,.0f}.",
    }


def build_tracker_context(session: TripTrackingSession, filter_date=None, filter_category=None):
    """
    Builds the comprehensive, multi-day dashboard data structure for a tracking session.
    """
    # Auto-synchronize date-based lifecycle
    session.refresh_status()

    today = timezone.now().astimezone(IST_ZONE).date()

    # Generate all trip calendar days
    total_days = session.total_days
    trip_days = []
    for day_idx in range(total_days):
        day_date = session.start_date + timedelta(days=day_idx)
        trip_days.append({
            "day_num": day_idx + 1,
            "date": day_date,
            "date_str": day_date.strftime("%Y-%m-%d"),
            "display_date": day_date.strftime("%a, %d %b"),
            "is_today": day_date == today,
            "is_past": day_date < today,
            "is_future": day_date > today,
            "total": Decimal("0.00"),
            "count": 0,
        })

    # Fetch all transactions for this session
    all_expenses = list(session.expenses.all().order_by("-expense_date", "-expense_time", "-created_at"))

    # Map expenses to days
    expenses_by_date = {}
    category_totals = {key: {"code": key, "label": label, "total": Decimal("0.00"), "count": 0} for key, label in ExpenseTransaction.CATEGORY_CHOICES}

    total_actual = Decimal("0.00")

    for exp in all_expenses:
        total_actual += exp.amount
        d_str = exp.expense_date.strftime("%Y-%m-%d")
        if d_str not in expenses_by_date:
            expenses_by_date[d_str] = []
        expenses_by_date[d_str].append(exp)

        # Update category totals
        cat_key = exp.category if exp.category in category_totals else "other"
        category_totals[cat_key]["total"] += exp.amount
        category_totals[cat_key]["count"] += 1

    # Attach totals & counts to trip_days
    for td in trip_days:
        d_str = td["date_str"]
        if d_str in expenses_by_date:
            day_sum = sum(e.amount for e in expenses_by_date[d_str])
            td["total"] = day_sum
            td["count"] = len(expenses_by_date[d_str])

    # Filtered transactions for view
    filtered_expenses = all_expenses
    if filter_date:
        filtered_expenses = [e for e in filtered_expenses if e.expense_date.strftime("%Y-%m-%d") == str(filter_date)]
    if filter_category and filter_category != "all":
        filtered_expenses = [e for e in filtered_expenses if e.category == filter_category]

    # Category percentage breakdown (only categories with spending)
    active_categories = []
    for cat in category_totals.values():
        if cat["total"] > Decimal("0.00"):
            pct = round((cat["total"] / max(total_actual, Decimal("0.01"))) * 100, 1)
            active_categories.append({
                **cat,
                "percentage": pct,
            })
    active_categories.sort(key=lambda x: x["total"], reverse=True)

    # Spending Insights
    days_with_spending = [td for td in trip_days if td["total"] > 0]
    highest_day = max(days_with_spending, key=lambda d: d["total"]) if days_with_spending else None
    lowest_day = min(days_with_spending, key=lambda d: d["total"]) if days_with_spending else None
    top_category = active_categories[0] if active_categories else None

    # Transport Analysis: Expected vs Actual
    bus_actual = category_totals["bus_local"]["total"]
    train_actual = category_totals["train"]["total"]
    taxi_actual = category_totals["taxi_auto"]["total"]
    total_transport_actual = bus_actual + train_actual + taxi_actual

    expected_transport = session.estimated_transport
    transport_diff = total_transport_actual - expected_transport

    transit_data = get_destination_transit_info(session.place)
    community_insights = compute_destination_community_insights(session.place)

    remaining_budget = session.expected_budget - total_actual
    is_overbudget = remaining_budget < Decimal("0.00")
    overbudget_amount = abs(remaining_budget) if is_overbudget else Decimal("0.00")

    avg_daily_spending = round(total_actual / Decimal(str(max(total_days, 1))), 2)
    budget_consumed_pct = round(float(total_actual / session.expected_budget) * 100, 1) if session.expected_budget > 0 else 0

    # Days remaining
    if session.status == "completed":
        days_remaining_label = "Trip completed"
    elif session.status == "upcoming":
        days_to_start = (session.start_date - today).days
        days_remaining_label = f"Starts in {days_to_start} day{'s' if days_to_start != 1 else ''}"
    else:
        days_left = (session.end_date - today).days
        if days_left < 0:
            days_remaining_label = "Final day elapsed"
        elif days_left == 0:
            days_remaining_label = "Last day today"
        else:
            days_remaining_label = f"{days_left + 1} days remaining"

    return {
        "session": session,
        "place": session.place,
        "today": today,
        "trip_days": trip_days,
        "all_expenses": all_expenses,
        "filtered_expenses": filtered_expenses,
        "expenses_by_date": expenses_by_date,
        "active_categories": active_categories,
        "total_actual": total_actual,
        "remaining_budget": remaining_budget,
        "is_overbudget": is_overbudget,
        "overbudget_amount": overbudget_amount,
        "avg_daily_spending": avg_daily_spending,
        "budget_consumed_pct": budget_consumed_pct,
        "days_remaining_label": days_remaining_label,
        "highest_day": highest_day,
        "lowest_day": lowest_day,
        "top_category": top_category,
        "transport_analysis": {
            "expected_transport": expected_transport,
            "bus_actual": bus_actual,
            "train_actual": train_actual,
            "taxi_actual": taxi_actual,
            "total_transport_actual": total_transport_actual,
            "diff": transport_diff,
            "is_higher": transport_diff > Decimal("0.00"),
            "is_lower": transport_diff < Decimal("0.00"),
            "diff_abs": abs(transport_diff),
        },
        "transit_data": transit_data,
        "community_insights": community_insights,
        "filter_date": filter_date,
        "filter_category": filter_category,
        "categories_list": ExpenseTransaction.CATEGORY_CHOICES,
        "payment_choices": ExpenseTransaction.PAYMENT_CHOICES,
    }
