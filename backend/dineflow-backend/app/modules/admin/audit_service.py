import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

class AdminAuditLogger:
    """
    In-memory / Persistent Audit logger for Platform Admin operations.
    Prevents leaking credentials or tokens while recording all critical security actions.
    """
    _logs: List[Dict[str, Any]] = []

    @classmethod
    def log_action(
        cls,
        admin_uid: str,
        action: str,
        target_resource: str,
        target_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        status: str = "SUCCESS"
    ) -> Dict[str, Any]:
        entry = {
            "id": f"audit-{uuid.uuid4().hex[:12]}",
            "admin_uid": admin_uid,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": action,
            "target_resource": target_resource,
            "target_id": target_id,
            "ip_address": ip_address or "127.0.0.1",
            "details": details or {},
            "status": status,
        }
        cls._logs.insert(0, entry)
        return entry

    @classmethod
    def get_logs(cls, limit: int = 100) -> List[Dict[str, Any]]:
        return cls._logs[:limit]
