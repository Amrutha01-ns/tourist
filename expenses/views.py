import json
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.http import JsonResponse, HttpResponseForbidden
from django.contrib import messages
from django.utils import timezone

from places.models import Place
from .models import TripTrackingSession, ExpenseTransaction, ExpenseAuditLog, IST_ZONE
from .services.tracker_service import build_tracker_context, compute_destination_community_insights
from .services.feedback_engine import generate_trip_feedback


@login_required(login_url="login")
def start_or_resume_session(request, slug):
    """
    Initiates or resumes a tracking session for a destination.
    Captures trip budget, duration, and travellers from the destination planner with zero retyping.
    """
    place = get_object_or_404(Place, slug=slug)
    today = timezone.now().astimezone(IST_ZONE).date()

    # Look for an active or upcoming session for this user and place
    active_session = TripTrackingSession.objects.filter(
        user=request.user,
        place=place,
        status__in=["active", "upcoming"],
    ).first()

    # If user explicitly requests a fresh session or POSTed new parameters
    if request.method == "POST" or not active_session:
        try:
            budget = Decimal(str(request.POST.get("budget") or request.GET.get("budget") or 10000))
            days = int(request.POST.get("days") or request.GET.get("days") or 3)
            travellers = int(request.POST.get("travellers") or request.GET.get("travellers") or 1)
        except (ValueError, TypeError):
            budget = Decimal("10000.00")
            days = 3
            travellers = 1

        days = max(min(days, 30), 1)
        travellers = max(min(travellers, 50), 1)
        budget = max(budget, Decimal("100.00"))

        start_date_str = request.POST.get("start_date") or request.GET.get("start_date")
        if start_date_str:
            try:
                start_date = datetime.strptime(start_date_str.strip(), "%Y-%m-%d").date()
            except ValueError:
                start_date = today
        else:
            start_date = today

        end_date = start_date + timedelta(days=days - 1)

        # Baseline cost estimates (matching explorer calculator formula)
        estimated_food = Decimal(str(travellers * days * 300))
        estimated_stay = Decimal(str(travellers * max(days - 1, 1) * 500))
        estimated_transport = Decimal(str(travellers * 200))
        estimated_activities = Decimal(str(travellers * days * 100))

        initial_status = "upcoming" if today < start_date else "active"

        session = TripTrackingSession.objects.create(
            user=request.user,
            place=place,
            start_date=start_date,
            end_date=end_date,
            travellers=travellers,
            expected_budget=budget,
            estimated_food=estimated_food,
            estimated_stay=estimated_stay,
            estimated_transport=estimated_transport,
            estimated_activities=estimated_activities,
            status=initial_status,
        )
        return redirect("expenses:tracker_dashboard", session_id=session.id)

    # If an ongoing session already exists, resume it
    return redirect("expenses:tracker_dashboard", session_id=active_session.id)


@login_required(login_url="login")
def tracker_dashboard(request, session_id):
    """
    Dedicated interactive tracking dashboard for multi-day trips.
    """
    session = get_object_or_404(
        TripTrackingSession.objects.select_related("place", "place__district"),
        id=session_id,
    )

    # Permission check: ensure user owns this session
    if session.user != request.user and not request.user.is_staff:
        return HttpResponseForbidden("You do not have permission to view this expense tracker.")

    filter_date = request.GET.get("day")
    filter_category = request.GET.get("category")

    context = build_tracker_context(
        session,
        filter_date=filter_date,
        filter_category=filter_category,
    )

    return render(request, "expenses/tracker.html", context)


@login_required(login_url="login")
@require_POST
def add_expense(request, session_id):
    """
    Records an expense transaction. Rejects invalid or negative amounts.
    """
    session = get_object_or_404(TripTrackingSession, id=session_id)
    if session.user != request.user and not request.user.is_staff:
        return HttpResponseForbidden("Permission denied.")

    session.refresh_status()
    if session.status in ["completed", "cancelled"]:
        messages.error(
            request,
            "This trip has been completed. Ordinary new entries are locked. Please use the late-entry adjustment option if needed.",
        )
        return redirect("expenses:tracker_dashboard", session_id=session.id)

    try:
        amount_raw = request.POST.get("amount", "").strip()
        amount = Decimal(amount_raw)
        if amount <= Decimal("0.00"):
            raise ValueError("Amount must be greater than zero.")
    except (ValueError, TypeError):
        messages.error(request, "Please enter a valid expense amount greater than zero.")
        return redirect("expenses:tracker_dashboard", session_id=session.id)

    category = request.POST.get("category", "food").strip()
    custom_category_name = request.POST.get("custom_category_name", "").strip()
    description = request.POST.get("description", "").strip() or f"{category.title()} expense"
    location = request.POST.get("location", "").strip() or session.place.name
    payment_method = request.POST.get("payment_method", "upi").strip()
    notes = request.POST.get("notes", "").strip()

    date_str = request.POST.get("expense_date")
    try:
        expense_date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else timezone.now().astimezone(IST_ZONE).date()
    except ValueError:
        expense_date = timezone.now().astimezone(IST_ZONE).date()

    time_str = request.POST.get("expense_time")
    try:
        expense_time = datetime.strptime(time_str, "%H:%M").time() if time_str else timezone.now().astimezone(IST_ZONE).time()
    except ValueError:
        expense_time = timezone.now().astimezone(IST_ZONE).time()

    ExpenseTransaction.objects.create(
        session=session,
        user=request.user,
        amount=amount,
        category=category,
        custom_category_name=custom_category_name,
        description=description,
        expense_date=expense_date,
        expense_time=expense_time,
        location=location,
        payment_method=payment_method,
        notes=notes,
        is_late_entry=False,
    )

    messages.success(request, f"Successfully recorded ₹{amount:,.0f} for {description}.")
    return redirect("expenses:tracker_dashboard", session_id=session.id)


@login_required(login_url="login")
@require_POST
def edit_expense(request, session_id, expense_id):
    """
    Edits an existing expense transaction.
    """
    session = get_object_or_404(TripTrackingSession, id=session_id)
    expense = get_object_or_404(ExpenseTransaction, id=expense_id, session=session)

    if session.user != request.user and not request.user.is_staff:
        return HttpResponseForbidden("Permission denied.")

    try:
        amount_raw = request.POST.get("amount", "").strip()
        new_amount = Decimal(amount_raw)
        if new_amount <= Decimal("0.00"):
            raise ValueError()
    except (ValueError, TypeError):
        messages.error(request, "Invalid amount. Must be greater than zero.")
        return redirect("expenses:tracker_dashboard", session_id=session.id)

    old_amount = expense.amount
    expense.amount = new_amount
    expense.category = request.POST.get("category", expense.category).strip()
    expense.custom_category_name = request.POST.get("custom_category_name", expense.custom_category_name).strip()
    expense.description = request.POST.get("description", expense.description).strip()
    expense.location = request.POST.get("location", expense.location).strip()
    expense.payment_method = request.POST.get("payment_method", expense.payment_method).strip()
    expense.notes = request.POST.get("notes", expense.notes).strip()

    date_str = request.POST.get("expense_date")
    if date_str:
        try:
            expense.expense_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            pass

    expense.save()

    # Log audit entry if edited during/after completion
    if session.status in ["completed", "cancelled"]:
        reason = request.POST.get("edit_reason", "Post-trip correction").strip()
        ExpenseAuditLog.objects.create(
            session=session,
            transaction=expense,
            user=request.user,
            action="edited",
            reason=reason,
            amount_snapshot=new_amount,
        )

    messages.success(request, f"Updated expense: ₹{new_amount:,.0f} ({expense.description}).")
    return redirect("expenses:tracker_dashboard", session_id=session.id)


@login_required(login_url="login")
@require_POST
def delete_expense(request, session_id, expense_id):
    """
    Deletes an expense transaction with confirmation.
    """
    session = get_object_or_404(TripTrackingSession, id=session_id)
    expense = get_object_or_404(ExpenseTransaction, id=expense_id, session=session)

    if session.user != request.user and not request.user.is_staff:
        return HttpResponseForbidden("Permission denied.")

    desc = expense.description
    amt = expense.amount

    if session.status in ["completed", "cancelled"]:
        reason = request.POST.get("delete_reason", "Removed incorrect entry").strip()
        ExpenseAuditLog.objects.create(
            session=session,
            transaction=None,
            user=request.user,
            action="deleted",
            reason=f"Deleted '{desc}' (₹{amt}). Reason: {reason}",
            amount_snapshot=amt,
        )

    expense.delete()
    messages.success(request, f"Removed expense entry ₹{amt:,.0f} for '{desc}'.")
    return redirect("expenses:tracker_dashboard", session_id=session.id)


@login_required(login_url="login")
@require_POST
def complete_session(request, session_id):
    """
    Manually finishes the trip tracking session early.
    """
    session = get_object_or_404(TripTrackingSession, id=session_id)
    if session.user != request.user and not request.user.is_staff:
        return HttpResponseForbidden("Permission denied.")

    session.status = "completed"
    session.completion_reason = "manual_user"
    session.completed_at = timezone.now()
    session.save(update_fields=["status", "completion_reason", "completed_at", "updated_at"])

    messages.success(request, f"Your trip to {session.place.name} has been marked completed! Here is your final trip report.")
    return redirect("expenses:trip_report", session_id=session.id)


@login_required(login_url="login")
def trip_report(request, session_id):
    """
    Displays the final intelligent trip feedback report and analytics.
    """
    session = get_object_or_404(
        TripTrackingSession.objects.select_related("place", "place__district"),
        id=session_id,
    )
    if session.user != request.user and not request.user.is_staff:
        return HttpResponseForbidden("Permission denied.")

    session.refresh_status()
    feedback_data = generate_trip_feedback(session)

    return render(request, "expenses/report.html", {
        "session": session,
        "place": session.place,
        **feedback_data,
    })


@login_required(login_url="login")
@require_POST
def add_late_entry(request, session_id):
    """
    Allows travellers to record legitimate forgotten expenses after trip completion with an audit trail.
    """
    session = get_object_or_404(TripTrackingSession, id=session_id)
    if session.user != request.user and not request.user.is_staff:
        return HttpResponseForbidden("Permission denied.")

    reason = request.POST.get("reason", "").strip()
    if not reason:
        messages.error(request, "A reason/justification is required when logging a late expense on a completed trip.")
        return redirect("expenses:tracker_dashboard", session_id=session.id)

    try:
        amount = Decimal(request.POST.get("amount", "").strip())
        if amount <= Decimal("0.00"):
            raise ValueError()
    except (ValueError, TypeError):
        messages.error(request, "Invalid amount.")
        return redirect("expenses:tracker_dashboard", session_id=session.id)

    category = request.POST.get("category", "food").strip()
    description = request.POST.get("description", "").strip() or "Late travel expense"
    date_str = request.POST.get("expense_date")
    try:
        expense_date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else session.end_date
    except ValueError:
        expense_date = session.end_date

    tx = ExpenseTransaction.objects.create(
        session=session,
        user=request.user,
        amount=amount,
        category=category,
        description=description,
        expense_date=expense_date,
        location=request.POST.get("location", session.place.name).strip(),
        payment_method=request.POST.get("payment_method", "cash").strip(),
        notes=request.POST.get("notes", "").strip(),
        is_late_entry=True,
    )

    ExpenseAuditLog.objects.create(
        session=session,
        transaction=tx,
        user=request.user,
        action="created_late",
        reason=reason,
        amount_snapshot=amount,
    )

    messages.success(request, f"Late expense of ₹{amount:,.0f} successfully logged with audit justification.")
    return redirect("expenses:tracker_dashboard", session_id=session.id)


def destination_insights_api(request, slug):
    """
    Public/AJAX endpoint for destination community spending averages.
    """
    place = get_object_or_404(Place, slug=slug)
    insights = compute_destination_community_insights(place)
    return JsonResponse(insights)
