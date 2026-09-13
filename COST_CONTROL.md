# Dinely — Cost Control & Denial-of-Wallet Defense Guide

## Executive Summary
This document defines Dinely's financial defense model, cost-capping infrastructure configurations, Google Cloud budget alerts, and edge traffic mitigation strategies to prevent unexpected billing spikes or "Denial of Wallet" attacks.

---

## 1. Critical Cost Governance Principles

> [!IMPORTANT]
> **Cost Realism: What Protects What**
> 
> - **`max-instances = 3`**: **Scaling Protection**. Caps the maximum number of concurrent container instances that Google Cloud Run will spin up, bounding active CPU/RAM consumption during traffic spikes.
> - **Budget Alert ($5/mo)**: **Cost Warning Mechanism**. Triggers automated email and webhook notifications at 50%, 75%, 90%, and 100% of the target threshold. **A budget is NOT a hard spending cap** — Google Cloud does NOT automatically terminate services when a budget is exceeded.
> - **Cloudflare Edge WAF & Rate Limiting**: **Traffic Abuse Protection**. Absorbs scrapers, bot attacks, and DDoS volume at the edge before requests reach billable Cloud Run compute resources.
> 
> **NONE OF THESE CONTROLS ALONE IS A GUARANTEED TOTAL BILL CAP.** Defense-in-depth across all three layers is strictly required.

---

## 2. Cloud Run Service Sizing & Scaling Parameters

The Dinely backend Cloud Run service (`dinely-backend`) is deployed with conservative, cost-optimized bounds:

| Configuration Parameter | Target Value | Cost Rationale |
| :--- | :--- | :--- |
| **Minimum Instances** | `0` | Allows Cloud Run to scale to zero during inactive periods (night hours, low traffic), incurring zero compute cost when idle. |
| **Maximum Instances** | `3` | Hard ceiling on horizontal container scaling. Prevents accidental runaway container spawning during bursts, bot scans, or denial-of-wallet attempts. |
| **Concurrency** | `80` | Each container handles up to 80 concurrent HTTP/WebSocket connections before Cloud Run considers spinning up a new instance. |
| **CPU Allocation** | `1 vCPU` | Sufficient for async FastAPI I/O event loops without paying for multi-core idle capacity. |
| **Memory Allocation** | `512 MiB` (or `1 GiB`) | Compact memory footprint keeping idle and active consumption minimal. |
| **Request Timeout** | `3600 seconds` | Accommodates long-lived WebSocket connections without dropping operational terminals. |
| **Session Affinity** | `Enabled` | Routes sticky WebSocket traffic from a client to the same container instance, maximizing container reuse. |

### Enforced Deployment Command:
```bash
gcloud run deploy dinely-backend \
  --image=gcr.io/dinely-cd6cd/dinely-backend:latest \
  --region=asia-south1 \
  --project=dinely-cd6cd \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=3 \
  --concurrency=80 \
  --timeout=3600 \
  --session-affinity \
  --memory=512Mi \
  --cpu=1
```

---

## 3. Google Cloud Billing Budget & Threshold Notifications

### 3.1 Budget Specification
- **Project Scope**: `dinely-cd6cd` (Project Number: `99267644103`).
- **Initial Target Amount**: `$5.00 USD / month`.
- **Alert Cadence**: 100% spend period (monthly calendar cycle).

### 3.2 Notification Thresholds
| Threshold | Trigger Spend | Action / Notification |
| :--- | :--- | :--- |
| **50%** | `$2.50` | Early notification email to administrators (`ayan090912@gmail.com`). |
| **75%** | `$3.75` | Heightened warning notification. Review active metrics and Cloud Run logs. |
| **90%** | `$4.50` | Critical cost warning. Investigate traffic origin, Cloudflare caching, and container counts. |
| **100%** | `$5.00` | Budget exceeded alert. Immediate incident triage per [ABUSE_INCIDENT_RUNBOOK.md](file:///c:/dineflow%20v3/v3/ABUSE_INCIDENT_RUNBOOK.md). |

---

## 4. Edge Layer Absorption (Cloudflare)

Traffic that reaches Cloud Run incurs compute and request costs. Therefore, Cloudflare edge controls serve as the primary cost-defense barrier:

1. **Cloudflare Bot Fight Mode**:
   - Automatically challenges known bots, automated scrapers, and malicious scripts before they reach origin servers.
2. **Edge Rate Limiting**:
   - `POST /api/v1/auth/*`: Max 20 requests per 10 seconds per IP → Block for 5 minutes.
   - `POST /api/v1/orders`: Max 30 requests per minute per IP → Block for 5 minutes.
3. **Edge Caching for Read-Heavy Endpoints**:
   - `GET /api/v1/restaurants/public/resolve`: Cache-Control `public, max-age=30, s-maxage=60, stale-while-revalidate=120`. Absorbs customer restaurant lookups at the edge for 60 seconds with zero origin compute cost.
   - `GET /api/v1/restaurants/{id}/menu`: Cache-Control `public, max-age=30, s-maxage=60`.

---

## 5. Application Rate Limiting Layer (FastAPI)

For traffic passing through the edge, FastAPI sliding-window rate limiting prevents database and server overload:
- Auth/PIN endpoints: 10 requests / minute / IP.
- Restaurant creation: 5 requests / minute / IP.
- Customer orders: 20 requests / minute / IP.
- Customer waiter requests: 15 requests / minute / IP.
- Public resolution: 60 requests / minute / IP.
- Default limit: 120 requests / minute / IP.
- Oversized payload rejection: 1MB JSON, 5MB Multipart (413 Payload Too Large).

---

## 6. Neon PostgreSQL Database Cost & Resource Protection

- **Connection Limits**:
  - Pool size = 10, max overflow = 20 per container.
  - With `max-instances = 3`, peak total connections = 90.
  - Keeps connection concurrency safely within Neon serverless pooling allowances.
- **Statement Timeout**:
  - `command_timeout = 30s` prevents slow/stuck queries from occupying worker threads and consuming compute hours.
- **Transaction Pooler**:
  - Direct async connection uses Neon AWS ap-southeast-1 transaction pooler with `statement_cache_size = 0` to enable efficient connection multiplexing.

---

## 7. Expected Early-Stage Cost Drivers

| Service / Resource | Expected Monthly Cost | Primary Driver | Control Mechanism |
| :--- | :--- | :--- | :--- |
| **Cloud Run Compute** | $0.00 – $3.00 | CPU / Memory seconds during active customer sessions | `min-instances=0`, `max-instances=3`, `concurrency=80` |
| **Cloud Run Requests** | $0.00 – $0.50 | 2M free requests/month tier | Edge caching & rate limiting |
| **Artifact Registry** | $0.10 – $0.50 | Storage of Docker container image layers | Prune old image tags; retain last 3 revisions |
| **Cloud Build** | $0.00 | Free tier includes 120 build-minutes/day | Deterministic multi-stage build caching |
| **Egress Bandwidth** | $0.00 – $1.00 | Outbound response data | Compact JSON responses, Gzip compression, edge caching |
| **Neon PostgreSQL** | Existing plan | Serverless compute and storage | Preserved without modifications |
| **Firebase Auth** | $0.00 | Free tier up to 50,000 monthly active users | Standard identity verification |
