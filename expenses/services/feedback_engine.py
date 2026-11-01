from decimal import Decimal
from .tracker_service import build_tracker_context


def generate_trip_feedback(session):
    """
    Generates structured, intelligent travel feedback and natural-language narrative
    based strictly on real recorded expense data and baseline estimates.
    """
    ctx = build_tracker_context(session)

    place_name = session.place.name
    total_days = session.total_days
    expected_budget = session.expected_budget
    total_actual = ctx["total_actual"]
    remaining_budget = ctx["remaining_budget"]
    avg_daily = ctx["avg_daily_spending"]
    top_category = ctx["top_category"]
    highest_day = ctx["highest_day"]
    lowest_day = ctx["lowest_day"]
    transport = ctx["transport_analysis"]

    is_savings = remaining_budget >= Decimal("0.00")
    delta_amount = abs(remaining_budget)

    # Narrative sentences
    p1 = f"Your {total_days}-day {place_name} journey has concluded."
    if is_savings:
        p2 = f"Your estimated budget was ₹{expected_budget:,.0f}, while your actual spending was ₹{total_actual:,.0f}. You saved ₹{delta_amount:,.0f} compared with your planned budget."
    else:
        p2 = f"Your estimated budget was ₹{expected_budget:,.0f}, while your total spending reached ₹{total_actual:,.0f}, exceeding your planned budget by ₹{delta_amount:,.0f}."

    p3_parts = []
    if top_category:
        p3_parts.append(f"{top_category['label']} was your largest expense category (₹{top_category['total']:,.0f}, {top_category['percentage']}% of total expenses).")
    p3_parts.append(f"Your average daily expenditure was ₹{avg_daily:,.0f}.")
    p3 = " ".join(p3_parts)

    p4_parts = []
    if transport["total_transport_actual"] > 0:
        if transport["is_higher"]:
            p4_parts.append(f"Your local transportation spending (₹{transport['total_transport_actual']:,.0f}) was ₹{transport['diff_abs']:,.0f} higher than initial estimates.")
        elif transport["is_lower"]:
            p4_parts.append(f"Your transportation spending (₹{transport['total_transport_actual']:,.0f}) was ₹{transport['diff_abs']:,.0f} lower than initial estimates.")
        else:
            p4_parts.append(f"Your transportation spending perfectly matched your estimated travel budget of ₹{transport['expected_transport']:,.0f}.")
    p4 = " ".join(p4_parts)

    # Actionable suggestions
    recommendations = []
    if not is_savings:
        recommendations.append(f"To stay within budget on your next visit, set a daily ceiling of ₹{expected_budget / Decimal(str(max(total_days, 1))):,.0f} and prioritize advance bookings.")
    if top_category and top_category["code"] in ["food", "hotel"]:
        recommendations.append(f"Explore local homestays or popular regional eateries in {place_name} to moderate your {top_category['label'].lower()} costs.")
    if transport["is_higher"]:
        recommendations.append("Consider utilizing direct KSRTC/BMTC public bus schedules or shared shuttles over on-demand cabs for regional travel.")
    else:
        recommendations.append("Your transportation budgeting was highly disciplined. Replicate this route planning strategy for your next getaway.")

    summary_narrative = f"{p1}\n\n{p2}\n\n{p3}\n\n{p4}\n\n" + " ".join(recommendations)

    return {
        "context": ctx,
        "place_name": place_name,
        "total_days": total_days,
        "expected_budget": expected_budget,
        "total_actual": total_actual,
        "is_savings": is_savings,
        "delta_amount": delta_amount,
        "avg_daily": avg_daily,
        "top_category": top_category,
        "highest_day": highest_day,
        "lowest_day": lowest_day,
        "transport": transport,
        "recommendations": recommendations,
        "summary_narrative": summary_narrative.strip(),
    }
