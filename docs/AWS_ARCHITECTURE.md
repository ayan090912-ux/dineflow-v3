# Target AWS Architecture: DineFlow / Dinely v3

**System:** DineFlow Multi-Tenant Cloud OS  
**Target AWS Region:** `ap-south-1` (Asia Pacific - Mumbai)  
**Primary VPC:** `vpc-0259561b2f176fdce` (`172.31.0.0/16`)  

---

## 1. Architectural Topology

```mermaid
flowchart TD
    Client[Web Browser / Mobile Guest / Staff POS] -->|HTTPS :443| Edge[Cloudflare Edge DNS / CDN Proxy]
    Edge -->|HTTP :80| Host[AWS EC2 Instance: dinely-production\nType: t3.small | IP: 3.7.195.143]
    
    subgraph Host[EC2 Host i-0997b0b381dfb3fd0]
        Nginx[dinely_web container\nNginx Alpine :80]
        Backend[dinely_backend container\nFastAPI + Uvicorn :8080]
        
        Nginx -->|Static Assets & SPA Routing| ReactSPA[Vite / React 19 Bundle]
        Nginx -->|/api/* & /healthz| Backend
        Nginx -->|/api/v1/ws (WebSocket)| Backend
        Nginx -->|/__/ (Auth Proxy)| FirebaseAuth[Firebase Auth Helper\ndinely-cd6cd.firebaseapp.com]
    end

    subgraph AWS_Managed_Services[AWS Cloud Managed Infrastructure - ap-south-1]
        Backend -->|Async SSL Pool :5432| RDS[(Amazon RDS PostgreSQL 16.9\ndinely-db-mumbai\nPrivate VPC Subnet)]
        Backend -->|Boto3 API| S3[(Amazon S3 Storage\ndinely-storage-ap-south-1\nEncrypted AES256)]
        Host -->|SSM Agent| SSM[AWS Systems Manager]
        Host -->|CloudWatch Metrics & Alarms| CloudWatch[CloudWatch Monitoring & Alarms]
    end
```

---

## 2. Infrastructure Component Evaluation

### 2.1 Compute: Single-Instance EC2 Container Host
- **Instance Type:** `t3.small` (2 vCPU, 2 GB RAM, EBS gp3).
- **Rationale:**
  - Provides a single, unified origin capable of hosting both the lightweight Nginx frontend and FastAPI backend via Docker bridge networking.
  - Predictable, low cost without the multi-component overhead of ECS/Fargate + Application Load Balancer ($16-20/month for ALB alone).
  - Native Docker Compose deployment with zero network hop between Nginx and FastAPI.
  - Fully manageable via AWS Systems Manager (SSM) without needing public SSH keys or open port 22.

### 2.2 Database: Amazon RDS for PostgreSQL
- **Instance Type:** `db.t4g.micro` (PostgreSQL 16.9).
- **Networking:** Strictly private within `vpc-0259561b2f176fdce`.
- **Security:** Ingress restricted to security group `sg-0861a810cec2dd7f4`. `PubliclyAccessible: False`.
- **Automated Backups:** Automated point-in-time snapshots enabled with 7-day retention window, plus daily S3 export of full SQL dumps.
- **Connection Management:** Async connection pooling managed via `asyncpg` (`pool_size=20`, `max_overflow=10`, `pool_pre_ping=True`).

### 2.3 Object Storage: Amazon S3
- **Bucket:** `dinely-storage-ap-south-1` (Mumbai).
- **Encryption:** Server-side encryption with AWS KMS/AES256.
- **Integrity:** S3 object versioning enabled to prevent accidental overwrites or deletes.
- **CORS:** Configured for cross-origin font/image delivery to `dinely.food` and `*.dinely.food`.
- **Tenant Directory Scheme:** `restaurants/{restaurant_id}/menus/{menu_id}/items/{item_id}/{filename}` ensuring clean tenant data boundaries.

### 2.4 Monitoring, Alarms & Cost Control
- **CloudWatch Log Group:** `/aws/dinely/production` (30-day retention).
- **Alarms:**
  - `dinely-ec2-status-check-failed` (Triggers if hardware or instance status check fails for 2 consecutive minutes).
  - `dinely-ec2-high-cpu` (Triggers if average CPU utilization exceeds 85% for 15 minutes).
- **Cost Alert:** AWS Budget `DineFlow-Monthly-Control` capped at $30.00 USD/month.

---

## 3. Financial & Cost Projection

| Service | Tier / Spec | Estimated Monthly Cost |
| :--- | :--- | :--- |
| **AWS EC2** | `t3.small` (ap-south-1) | ~$14.60 |
| **AWS EBS Storage** | 30 GB gp3 | ~$2.40 |
| **AWS RDS PostgreSQL** | `db.t4g.micro` (Single-AZ, 20 GB gp3) | ~$13.50 |
| **AWS S3 Storage** | ~5 GB standard storage + requests | ~$0.15 |
| **AWS CloudWatch** | Basic metrics + 1 log group (30d) | ~$0.50 |
| **AWS Data Transfer** | ~10 GB egress | ~$0.90 |
| **Total Estimated Cost** | | **~$31.00 – $34.00 / month** |

---

## 4. Operational Trade-Offs

1. **EC2 vs. ECS Fargate:**
   - *Fargate + ALB:* Higher redundancy, auto-scaling, but requires Application Load Balancer ($16.20/mo minimum fixed fee regardless of traffic) + Fargate vCPU/GB charges, bringing baseline cost to >$65/mo.
   - *EC2 Container Host:* Extremely cost-effective (~$17/mo total compute/storage), simple deployment via Docker Compose and SSM, with 1-3 second rolling container updates. Ideal for current workload and stage.

2. **Cloudflare Free Worker vs. Direct Nginx Reverse Proxy:**
   - *Cloudflare Worker:* Subject to rigid 100k requests/day free tier quota. Exceeding this quota throws Error 1027, taking down the entire application.
   - *Direct Nginx Reverse Proxy:* Runs directly on EC2 with zero external quota limits, easily handling millions of requests per day at zero incremental cost.
