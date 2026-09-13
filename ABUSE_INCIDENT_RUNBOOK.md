# Dinely — Abuse & Cost Incident Response Runbook

## Overview
This runbook establishes standard operating procedures for detecting, containing, investigating, and remediating security, abuse, and cost-anomaly incidents affecting Dinely.

Every incident must strictly follow the 7-phase response lifecycle:
1. **IDENTIFY** — Detect and categorize the anomaly.
2. **BLOCK** — Immediately contain the threat and stop cost/resource bleed.
3. **INVESTIGATE** — Determine root cause, origin, and scope.
4. **ROTATE** — Invalidate and rotate compromised credentials if applicable.
5. **RESTORE** — Safely bring services back to normal operational parameters.
6. **VERIFY** — Confirm production functionality across all terminals.
7. **DOCUMENT** — Record post-incident analysis and update preventative controls.

---

## Scenario 1: Traffic Spike & Runaway Cloud Run Scaling

### 1. Identify
- **Triggers**: Cloud Run instance count alert (instances >= 3), sudden spike in request volume (> 500 req/min), or latency surge.
- **Diagnostics**:
  ```bash
  python scripts/gcloud_exec.py logging read "resource.type=cloud_run_revision AND severity>=WARNING" --limit=20
  ```

### 2. Block
- **Immediate Scaling Cap**: Verify or re-assert the service ceiling to prevent further instance growth:
  ```bash
  python scripts/gcloud_exec.py run services update dinely-backend --max-instances=3 --region=asia-south1 --project=dinely-cd6cd
  ```
- **Cloudflare Under Attack Mode**: Enable "Under Attack Mode" on Cloudflare dashboard for `dinely.food` to force JS challenges on suspicious traffic.

### 3. Investigate
- Check top requesting IP addresses in Cloudflare Analytics or Cloud Run request logs.
- Identify targeted paths (e.g., `/api/v1/auth/*`, `/api/v1/orders`, or public resolve endpoints).

### 4. Rotate (If needed)
- If spike involves valid API keys or JWT tokens, proceed to credential rotation.

### 5. Restore
- Once malicious IPs are blocked via Cloudflare WAF or rate limits, step down "Under Attack Mode".

### 6. Verify
- Run `curl -I https://dinely.food/healthz` and verify customer menu loads in browser.

### 7. Document
- Record incident timeline, total requests, peak instance count, and cost delta in post-mortem log.

---

## Scenario 2: Credential & Auth PIN Brute-Force Abuse

### 1. Identify
- **Triggers**: High volume of `401 Unauthorized` or `429 Too Many Requests` on `/api/v1/auth/terminal-login` or `/api/v1/auth/staff/login`.
- **Log Pattern**: Multiple failed PIN attempts from identical IP addresses or subnet blocks.

### 2. Block
- **Edge IP Firewall Rule**: Add immediate IP block rule in Cloudflare:
  - Expression: `http.request.uri.path contains "/api/v1/auth/" and ip.src eq <abusive-ip>`
  - Action: `Block`.
- **FastAPI Sliding Window**: The backend rate limiter will automatically return `429 Too Many Requests` after 10 attempts per minute.

### 3. Investigate
- Check if any requests succeeded (`200 OK`) prior to blocking.
- Audit database table `restaurant_memberships` for unauthorized logins or role escalations.

### 4. Rotate
- If any staff PIN was compromised, notify restaurant owner to update staff PIN in workspace settings.
- If Platform Admin credentials suspected, immediately revoke Firebase refresh tokens in Google Firebase Console.

### 5. Restore
- Remove temporary Cloudflare blocks once threat is neutralized.

### 6. Verify
- Test legitimate staff terminal login on Kitchen, Waiter, and Bar apps.

### 7. Document
- Update rate-limit thresholds if attacker bypassed limits using distributed proxies.

---

## Scenario 3: Database Connection Pool Exhaustion

### 1. Identify
- **Triggers**: `500 Internal Server Error` responses, `/readyz` returning degraded, or log entries containing `Too many connections for role` or `connection pool timeout`.

### 2. Block
- Temporarily throttle non-essential traffic at Cloudflare Edge:
  - Enforce Cloudflare rate limiting on `/api/v1/restaurants/public/resolve` and `/api/v1/orders`.
- If necessary, restart Cloud Run revision to terminate orphaned pool connections:
  ```bash
  python scripts/gcloud_exec.py run services update dinely-backend --update-env-vars="FORCE_RECYCLE=$(date +%s)" --region=asia-south1 --project=dinely-cd6cd
  ```

### 3. Investigate
- Check active connections on Neon Console (`ep-dry-frog-a1puvn2s-pooler.ap-southeast-1.aws.neon.tech`).
- Verify whether transactions remained open due to slow clients or network latency.

### 4. Rotate
- Not applicable unless connection string was leaked.

### 5. Restore
- Ensure `pool_pre_ping=True` and `command_timeout=30` remain active in backend settings.

### 6. Verify
- Probe `GET /readyz` until response is `{"status": "ready", "database": "connected"}`.

### 7. Document
- Assess whether database pool sizing (`DB_POOL_SIZE`, `DB_MAX_OVERFLOW`) requires retuning.

---

## Scenario 4: Compromised Secret or Credential Leak

### 1. Identify
- **Triggers**: Secret scanner alert (GitGuardian, GitHub Secret Scanning), unauthorized admin API action in audit logs, or credential found in public repository.

### 2. Block
- **Immediate Invalidation**:
  - If `JWT_ACCESS_SECRET_KEY` or `JWT_REFRESH_SECRET_KEY` is exposed: Change the secret value immediately in environment variables. This instantly invalidates all active staff and user JWT sessions.
  - If Neon database password leaked: Generate new password in Neon Console and update `DATABASE_URL`.
  - If Firebase Admin private key exposed: Delete the compromised service account key in GCP IAM Console.

### 3. Investigate
- Review GCP Cloud Audit Logs and Dinely `AdminAuditLogger` table for actions executed with compromised credentials.
- Audit restaurant and order records for unauthorized alterations.

### 4. Rotate
- Deploy updated environment variables with new rotated secrets:
  - Rotate `JWT_ACCESS_SECRET_KEY` (64-byte random hex string).
  - Rotate `JWT_REFRESH_SECRET_KEY`.
  - Rotate database credentials.

### 5. Restore
- Redeploy backend service with new secret values.

### 6. Verify
- Log into Platform Admin with Google OAuth (`ayan090912@gmail.com`).
- Log into restaurant owner workspace and verify database connectivity.

### 7. Document
- File security disclosure report detailing exposure window, affected credentials, and rotated keys.

---

## Emergency Escalation Directory

| Role / Contact | Designation | Notification Method |
| :--- | :--- | :--- |
| **Platform Administrator** | Primary Operator | `ayan090912@gmail.com` |
| **Google Cloud Project** | Host Platform | `dinely-cd6cd` (Project #`99267644103`) |
| **Cloudflare Zone** | Edge Proxy / DNS | `dinely.food` |
| **Neon PostgreSQL** | Production Database | `ep-dry-frog-a1puvn2s-pooler.ap-southeast-1.aws.neon.tech` |
| **Render Production Backend**| Active Fallback | `https://dineflow-v3.onrender.com` |
