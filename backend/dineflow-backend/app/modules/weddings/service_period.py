"""
Service Period and Timezone Engine for Dinely Events & Luxury Banquets.
Authoritative calculation of start/end UTC datetimes, status transitions,
and server-side window enforcement.
"""

from datetime import datetime, date, time, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Optional, Dict, Any, Tuple
from fastapi import HTTPException, status
import math

DEFAULT_TIMEZONE = "Asia/Kolkata"

def get_safe_zoneinfo(tz_name: Optional[str]) -> Tuple[ZoneInfo, str]:
    """Resolves a ZoneInfo object, falling back safely to Asia/Kolkata."""
    clean_tz = (tz_name or "").strip()
    if not clean_tz:
        clean_tz = DEFAULT_TIMEZONE
    try:
        return ZoneInfo(clean_tz), clean_tz
    except Exception:
        return ZoneInfo(DEFAULT_TIMEZONE), DEFAULT_TIMEZONE


def parse_date_str(d_str: str) -> date:
    """Parses YYYY-MM-DD date string."""
    clean = (d_str or "").strip()
    if not clean:
        raise ValueError("Date string cannot be empty")
    return datetime.strptime(clean, "%Y-%m-%d").date()


def parse_time_str(t_str: Optional[str], default: str = "18:00") -> time:
    """Parses HH:MM or HH:MM:SS time string."""
    clean = (t_str or "").strip() or default
    parts = clean.split(":")
    h = int(parts[0])
    m = int(parts[1]) if len(parts) > 1 else 0
    s = int(parts[2]) if len(parts) > 2 else 0
    return time(hour=min(23, max(0, h)), minute=min(59, max(0, m)), second=min(59, max(0, s)))


class ServiceWindowResult(dict):
    """A dictionary that can also be unpacked as a 6-tuple: (start_dt_utc, end_dt_utc, end_date, service_days, duration_fmt, summary)."""
    def __iter__(self):
        yield self["startDatetimeUtc"]
        yield self["endDatetimeUtc"]
        yield self["endDate"]
        yield self["serviceDays"]
        yield self["durationFormatted"]
        yield self["summaryText"]


def calculate_event_service_window(
    start_date_str: str,
    start_time_str: Optional[str] = "18:00",
    end_date_str: Optional[str] = None,
    end_time_str: Optional[str] = "23:30",
    timezone_str: Optional[str] = None,
    service_days: Optional[int] = 1,
    tz_name: Optional[str] = None,
) -> ServiceWindowResult:
    """
    Computes authoritative UTC start and end timestamps and formatted duration.
    Supports single-day, multi-day, and cross-midnight events.
    """
    resolved_tz = tz_name or timezone_str or DEFAULT_TIMEZONE
    tz_obj, canonical_tz = get_safe_zoneinfo(resolved_tz)

    s_date = parse_date_str(start_date_str)
    s_time = parse_time_str(start_time_str, default="18:00")
    e_time = parse_time_str(end_time_str, default="23:30")

    days_count = max(1, int(service_days or 1))

    # Determine end date
    if end_date_str and end_date_str.strip():
        e_date = parse_date_str(end_date_str)
    elif days_count > 1:
        e_date = s_date + timedelta(days=days_count - 1)
    else:
        # Single day case: Check cross-midnight
        if e_time <= s_time:
            # End time is earlier than or equal to start time -> spans into next calendar day
            e_date = s_date + timedelta(days=1)
        else:
            e_date = s_date

    # Build local naive datetimes
    start_local = datetime.combine(s_date, s_time)
    end_local = datetime.combine(e_date, e_time)

    # Safety check: if end_local is still not after start_local, bump by 1 day
    if end_local <= start_local:
        end_local += timedelta(days=1)
        e_date = end_local.date()

    # Localize with zoneinfo and convert to UTC
    start_dt_utc = start_local.replace(tzinfo=tz_obj).astimezone(timezone.utc)
    end_dt_utc = end_local.replace(tzinfo=tz_obj).astimezone(timezone.utc)

    total_seconds = max(0.0, (end_dt_utc - start_dt_utc).total_seconds())
    total_hours = round(total_seconds / 3600.0, 2)
    computed_days = max(1, (e_date - s_date).days + 1) if (e_date - s_date).days > 0 else 1

    is_cross_midnight = (s_date != e_date)
    is_multi_day = (computed_days > 1)

    # Format human friendly duration
    h = int(total_seconds // 3600)
    m = int((total_seconds % 3600) // 60)
    if h >= 24:
        d = h // 24
        rem_h = h % 24
        duration_fmt = f"{d}d {rem_h}h" if rem_h > 0 else f"{d} days"
    elif h > 0 and m > 0:
        duration_fmt = f"{h}h {m}m"
    elif h > 0:
        duration_fmt = f"{h} hours"
    else:
        duration_fmt = f"{m} minutes"

    # Human readable summary
    s_fmt = start_local.strftime("%b %d, %Y, %H:%M")
    e_fmt = end_local.strftime("%b %d, %Y, %H:%M")
    summary = f"{s_fmt} – {e_fmt} ({canonical_tz} • {duration_fmt})"

    return ServiceWindowResult({
        "startDate": s_date.strftime("%Y-%m-%d"),
        "startTime": s_time.strftime("%H:%M"),
        "endDate": e_date.strftime("%Y-%m-%d"),
        "endTime": e_time.strftime("%H:%M"),
        "timezone": canonical_tz,
        "serviceDays": computed_days,
        "startDatetimeUtc": start_dt_utc,
        "endDatetimeUtc": end_dt_utc,
        "durationHours": total_hours,
        "durationFormatted": duration_fmt,
        "isCrossMidnight": is_cross_midnight,
        "isMultiDay": is_multi_day,
        "summaryText": summary,
    })


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Ensures datetime has UTC tzinfo, converting or attaching timezone.utc if naive."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def format_service_duration(start_dt_utc: Optional[datetime], end_dt_utc: Optional[datetime]) -> Optional[str]:
    """Formats the duration between two UTC datetimes into human readable string."""
    s_dt = _ensure_utc(start_dt_utc)
    e_dt = _ensure_utc(end_dt_utc)
    if not s_dt or not e_dt:
        return None
    total_seconds = max(0.0, (e_dt - s_dt).total_seconds())
    h = int(total_seconds // 3600)
    m = int((total_seconds % 3600) // 60)
    if h >= 24:
        d = h // 24
        rem_h = h % 24
        return f"{d}d {rem_h}h" if rem_h > 0 else f"{d} days"
    elif h > 0 and m > 0:
        return f"{h}h {m}m"
    elif h > 0:
        return f"{h} hours"
    else:
        return f"{m} minutes"


def _parse_local_datetime_to_utc(date_str: str, time_str: str, tz_name: str) -> datetime:
    """Parses local date and time in a timezone into a UTC datetime."""
    tz_obj, _ = get_safe_zoneinfo(tz_name)
    d = parse_date_str(date_str)
    t = parse_time_str(time_str)
    local_dt = datetime.combine(d, t)
    return local_dt.replace(tzinfo=tz_obj).astimezone(timezone.utc)


def get_authoritative_event_status(
    event_or_status: Any = None,
    start_dt_utc: Optional[datetime] = None,
    end_dt_utc: Optional[datetime] = None,
    is_ordering_open: bool = True,
    now_utc: Optional[datetime] = None,
    current_status: Optional[str] = None,
    auto_activate: Optional[bool] = None,
) -> str:
    """
    Computes authoritative status based on server UTC time.
    Accepts either (event, now_utc) or (status, start_dt, end_dt, is_ordering_open, now_utc).
    Statuses: DRAFT, PENDING_APPROVAL, APPROVED_SETUP_PENDING, SCHEDULED, ACTIVE, PAUSED, CLOSED, COMPLETED, CANCELLED
    """
    if hasattr(event_or_status, "status") or hasattr(event_or_status, "start_datetime_utc"):
        event = event_or_status
        c_status = (getattr(event, "status", None) or "DRAFT").strip().upper()
        s_dt = _ensure_utc(getattr(event, "start_datetime_utc", None))
        e_dt = _ensure_utc(getattr(event, "end_datetime_utc", None))
        ordering_open = getattr(event, "is_ordering_open", True)
        eval_now = _ensure_utc(start_dt_utc if isinstance(start_dt_utc, datetime) else (now_utc or datetime.now(timezone.utc)))
        is_auto = getattr(event, "auto_activate", False)
    else:
        c_status = (current_status or event_or_status or "DRAFT").strip().upper()
        s_dt = _ensure_utc(start_dt_utc)
        e_dt = _ensure_utc(end_dt_utc)
        ordering_open = is_ordering_open
        eval_now = _ensure_utc(now_utc or datetime.now(timezone.utc))
        is_auto = auto_activate if auto_activate is not None else False

    # Manual or lifecycle statuses that override automatic window checking
    if c_status in ("DRAFT", "PENDING_APPROVAL", "APPROVED_SETUP_PENDING", "COMPLETED", "CANCELLED"):
        return c_status

    # Closure enforcement: If end time is past, the event is CLOSED regardless of client clock
    if e_dt and eval_now > e_dt:
        return "CLOSED"

    # If scheduled and start time hasn't arrived, status is SCHEDULED
    if c_status == "SCHEDULED" and s_dt and eval_now < s_dt:
        return "SCHEDULED"

    # If scheduled with auto-activation and start time has arrived, auto-activate to ACTIVE
    if c_status == "SCHEDULED" and is_auto and s_dt and eval_now >= s_dt:
        return "ACTIVE" if ordering_open else "PAUSED"

    # Within active service window
    if not ordering_open or c_status == "PAUSED":
        return "PAUSED"

    return "ACTIVE"


def format_utc_for_timezone(dt_utc: Optional[datetime], timezone_str: str) -> str:
    """Formats a UTC datetime in the event's local timezone."""
    utc_dt = _ensure_utc(dt_utc)
    if not utc_dt:
        return ""
    tz_obj, _ = get_safe_zoneinfo(timezone_str)
    local_dt = utc_dt.astimezone(tz_obj)
    return local_dt.strftime("%b %d, %Y at %I:%M %p %Z")


def validate_order_within_event_window(
    event: Any,
    now_utc: Optional[datetime] = None
) -> None:
    """
    Validates that guest orders are submitted strictly within the authoritative event window.
    Raises HTTPException if rejected before opening, after closure, or if paused.
    """
    if now_utc is None:
        now_utc = datetime.now(timezone.utc)

    auth_status = get_authoritative_event_status(
        current_status=getattr(event, "status", "DRAFT"),
        start_dt_utc=getattr(event, "start_datetime_utc", None),
        end_dt_utc=getattr(event, "end_datetime_utc", None),
        is_ordering_open=getattr(event, "is_ordering_open", True),
        now_utc=now_utc,
    )

    tz_str = getattr(event, "timezone", DEFAULT_TIMEZONE)

    if auth_status == "SCHEDULED":
        start_str = format_utc_for_timezone(getattr(event, "start_datetime_utc", None), tz_str)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Event dining has not opened yet. Guest ordering will activate on {start_str}."
        )

    if auth_status in ("CLOSED", "COMPLETED", "CANCELLED"):
        end_str = format_utc_for_timezone(getattr(event, "end_datetime_utc", None), tz_str)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This event service window closed on {end_str}. New orders are no longer accepted."
        )

    if auth_status == "PAUSED" or not getattr(event, "is_ordering_open", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ordering is currently paused or closed for event '{getattr(event, 'title', '')}'. Please check with your banquet attendant."
        )

    if auth_status in ("DRAFT", "PENDING_APPROVAL", "APPROVED_SETUP_PENDING"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This event is currently in {auth_status} state and is not live for dining orders."
        )
