# Dinely AWS Cost Protection & Abuse Mitigation Runbook

## 1. Executive Summary & Cost Philosophy
Uncontrolled cloud spending in SaaS applications typically stems from:
1. Malicious scraping or traffic floods that overwhelm application compute/database resources.
2. Unbounded customer queries or automated loops resulting in runaway database IOPS.
3. Unrestricted file uploads filling storage and network transfer quotas.
4. Over-provisioned or zombie cloud infrastructure left running unmonitored.

This runbook outlines the cost controls, budget alerts, and abuse mitigations implemented across Dinely's AWS architecture (`ap-south-1` Mumbai).

---

## 2. Infrastructure Baseline & Expected Cost Bounds

| Resource | Configuration | Purpose | Expected Monthly Cost |
| :--- | :--- | :--- | :--- |
| **AWS EC2** | `t3.medium` (2 vCPU, 4GB RAM) + 30GB gp3 | Application host (Docker Compose: FastAPI + Nginx) | ~$30.00 / month |
| **AWS RDS** | PostgreSQL 16 (`db.t4g.micro` or `db.t3.medium`) + 20GB gp3 | Multi-tenant PostgreSQL database with connection pooling | ~$18.00 - $35.00 / month |
| **AWS ALB** | Application Load Balancer (Single Internet-Facing) | SSL Termination, Route 53 target, HTTP->HTTPS redirect | ~$16.00 / month |
| **AWS ACM** | Public Wildcard Certificate (`*.dinely.food`, `dinely.food`) | Automatic TLS renewal, DNS validated | **$0.00** (Free) |
| **Route 53** | 1 Hosted Zone (`dinely.food`) + Alias queries | Apex & Wildcard tenant routing | ~$0.50 / month |
| **AWS S3** | Standard Storage with Lifecycle Rules | Tenant menu images, logos, receipts | ~$0.50 - $2.00 / month |
| **Total Baseline** | - | - | **~$65.00 - $85.00 / month** |

---

## 3. Application-Level Cost Protection Mechanisms

### A. Sliding-Window Rate Limiting (`RateLimitMiddleware`)
To prevent abuse and distributed denial of service from driving up compute and database costs:
- **Authentication (`/api/v1/auth/*`):** 10 requests / 60s per IP (stops brute-force credential stuffing).
- **Onboarding (`/api/v1/restaurants/signup`):** 5 requests / 60s per IP (stops automated tenant flooding).
- **Slug Validation (`/api/v1/restaurants/check-slug`):** 30 requests / 60s per IP.
- **Orders (`/api/v1/orders`):** 30 requests / 60s per IP (permits peak dining while throttling spam).
- **Floor Operations (`/api/v1/tables`):** 20 requests / 60s per IP.
- **Menu Retrieval (`/api/v1/menu`):** 180 requests / 60s per IP.
- **Global Fallback:** 120 requests / 60s per IP with automated sliding-window expiration.

### B. Payload Size Limits (`PayloadLimitMiddleware`)
- **JSON / Form Payloads:** Hard-capped at **1 MB** (rejects oversized JSON bodies with `HTTP 413 Payload Too Large`).
- **Multipart Uploads:** Hard-capped at **5 MB** with magic-number validation (Pillow verification) preventing decompression bombs and polyglots.

### C. Database Query Bounding & Connection Pool Capping
- **Bounded Pagination:** All listing endpoints enforce `limit: int = Query(..., le=500)`; malicious requests like `limit=999999999` are rejected at the FastAPI schema level.
- **Connection Pool Safety:**
  - `DB_POOL_SIZE = 20`
  - `DB_MAX_OVERFLOW = 10`
  - `pool_timeout = 30`
  - `pool_recycle = 60`
  - Prevents runaway concurrency from exhausting RDS connections or spiking IOPS.

### D. Frontend API & Realtime Polling Tuning
- **Adaptive Fallback Polling:** Waiter terminal checks `document.visibilityState === 'visible'` and only polls every 30s when WebSocket is healthy (8s fallback only when disconnected).
- **KDS Kitchen Sync:** Polling interval tuned to 12s, preventing unnecessary database load while maintaining real-time kitchen responsiveness.
- **Admin Control Plane:** Polling interval tuned to 20s.

---

## 4. AWS Budget & CloudWatch Billing Protection

### A. Recommended AWS Budget Configuration
Create an AWS Budget in the AWS Billing Console:
1. **Budget Type:** Cost budget
2. **Budget Name:** `Dinely-Monthly-Production-Budget`
3. **Period:** Monthly
4. **Budgeted Amount:** **$100.00 USD**
5. **Alert Thresholds:**
   - **Alert 1 (50%):** Notify admin when forecasted/actual spend reaches **$50.00**
   - **Alert 2 (80%):** Notify admin when actual spend reaches **$80.00**
   - **Alert 3 (100%):** High-priority notification when actual spend exceeds **$100.00**

### B. CloudWatch Alarms for Traffic & Resource Anomalies
Configure CloudWatch Alarms in `ap-south-1`:
- **EC2 CPUUtilization:** Alarm if Average > 80% for 15 minutes (indicates possible runaway process or traffic spike).
- **ALB RequestCount:** Alarm if Request Count > 10,000 / minute (indicates potential scraping or L7 flood).
- **RDS DatabaseConnections:** Alarm if Connection Count > 25 (indicates connection leak).
- **RDS FreeStorageSpace:** Alarm if Free Storage < 5 GB.

---

## 5. AWS WAF & Shield Evaluation

### A. AWS Shield Standard
- **Status:** **Active by default** at no extra cost on AWS Route 53 and ALB.
- **Protection:** Defends against Layer 3 and Layer 4 DDoS attacks (SYN floods, UDP reflection).

### B. AWS WAF (Web Application Firewall)
- **Recommendation:** Recommended for high-traffic production.
- **Cost:** ~$5.00 / month per WebACL + $1.00 per rule + $0.60 per million requests.
- **Recommended Managed Rules (if enabled on ALB):**
  1. `AWSManagedRulesCommonRuleSet` (Core Rule Set protecting against OWASP Top 10)
  2. `AWSManagedRulesKnownBadInputsRuleSet` (Blocks known exploit strings and SSRF payloads)
  3. `AWSManagedRulesAmazonIpReputationList` (Blocks known botnets and malicious scrapers)
  4. Rate-based rule: Limit to 2,000 requests per 5-minute window per IP.

---

## 6. Incident Response: Investigating an AWS Billing Spike

If an AWS Budget alert fires:
1. **Inspect Cost Explorer:**
   - Group by: **Service** / **Usage Type** to identify the cost driver (e.g., EC2, RDS IOPS, S3 Data Transfer).
2. **Inspect ALB & Nginx Access Logs:**
   ```bash
   docker compose -f docker-compose.prod.yml logs --tail=500 web | grep -v "/healthz"
   ```
   - Identify anomalous client IPs sending high request volumes.
3. **Inspect Database Connections:**
   ```sql
   SELECT client_addr, count(*) FROM pg_stat_activity GROUP BY client_addr;
   ```
4. **Block Offending IPs:** Add firewall drop rules via EC2 UFW or ALB security group:
   ```bash
   sudo ufw insert 1 deny from <MALICIOUS_IP> to any
   ```
