# Dinely SaaS — Performance & Scalability Audit
**Audit Date:** 2026-11-24  
**Audit Standard:** Cloud Latency Benchmarking & Multi-Tenant Capacity Modeling  
**Auditor:** Principal Backend & Performance Architect  

---

## 1. Live Production Latency Benchmarks

Measured directly against live AWS EC2 production deployment (`https://the-start.dinely.food`):

| Endpoint / Operation | HTTP Status | Connect Time | TTFB (Start Transfer) | Total Latency | Evaluation |
|---|---|---|---|---|---|
| `GET /api/v1/health` | 200 OK | 124 ms | 255 ms | **255 ms** | Excellent |
| `GET /api/v1/restaurants/the-start/tables` | 200 OK | 64 ms | 300 ms | **300 ms** | Fast (Fixed from 500 crash) |
| `GET /api/v1/restaurants/the-start/menu` (Uncached) | 200 OK | 54 ms | 1,501 ms | **1,962 ms** | **BOTTLENECK (2.26 MB payload)** |
| `GET /api/v1/restaurants/the-start/menu` (Cached) | 200 OK | 52 ms | 243 ms | **651 ms** | Good TTFB, payload transfer bottleneck |
| `GET /` (Public Landing Page) | 200 OK | 53 ms | 207 ms | **207 ms** | Excellent |
| `GET /api/v1/platform/stats` (Unauthorized) | 404/401 | 61 ms | 202 ms | **202 ms** | Fast rejection |

---

## 2. Bottleneck Analysis & Root Causes

### 1. Menu Payload Bloat (2.26 MB)
- **Problem:** `curl https://the-start.dinely.food/api/v1/restaurants/the-start/menu` returns **2,266,081 bytes** (2.26 MB) uncompressed and **1.70 MB** gzipped.
- **Root Cause:** Dish items contain raw Base64 image representations stored directly in the `image_url` database column instead of lightweight HTTPS CDN URLs (e.g. S3 or Cloudinary).
- **Customer Impact:** On typical 3G/4G cellular connections in a restaurant dining room, downloading a 2.26 MB JSON payload takes 1.5 to 3 seconds before the menu displays.
- **Remediation:** 
  1. Offload image binary data to S3 / Cloudinary.
  2. Implement pagination or lightweight category-first menu fetching (`fields=id,name,price,category_id,is_available`).

### 2. Database Session Concurrency Safety
- In `tables/router.py`, previous attempts to run concurrent queries on the same `AsyncSession` (`asyncio.gather(db.execute(q1), db.execute(q2))`) triggered `IllegalStateChangeError`.
- Sequential execution resolved the error, maintaining floorplan load time at 300ms.

---

## 3. Capacity Modeling (100 to 5,000 Restaurants)

### Tier 1: 100 Active Restaurants (~1,500 Tables, 50,000 Daily Orders)
- **EC2 Compute:** Current single `t3.medium` or `t4g.small` (2 vCPU, 4GB RAM) handles this load provided static assets and menus are cached.
- **Neon Postgres:** 0.5 to 1 CU (Compute Unit) autoscaling handles the transaction volume easily with `pool_size=15`.

### Tier 2: 500 Active Restaurants (~7,500 Tables, 250,000 Daily Orders)
- **EC2 Compute:** Move to an AWS Auto Scaling Group (ASG) behind an Application Load Balancer (ALB) with 2x `t4g.medium` instances.
- **Neon Postgres:** Set autoscaling to 2 - 4 CUs. Enable Redis / ElastiCache cluster for in-memory session and menu caching to offload Neon read queries.

### Tier 3: 1,000 to 5,000 Restaurants (Multi-Tenant Enterprise Scale)
- **Architecture Requirements:**
  1. **Read Replicas:** Route all read queries (customer menu browsing, waiter terminal table views) to read replicas, reserving primary DB instance for transactional write operations (orders, billing, settlements).
  2. **WebSocket Fleet:** Decouple WebSocket real-time connections into a dedicated FastAPI or Go WebSocket microservice using Redis Pub/Sub for room event broadcasts.
  3. **CloudFront CDN:** Cache all restaurant menus with a 60-second TTL at edge locations, invalidated via webhooks on menu mutations.
