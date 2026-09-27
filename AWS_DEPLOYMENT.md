# Dinely AWS Production Deployment Runbook

## 1. Overview & Specifications
- **Product:** Dinely Multi-Tenant Restaurant SaaS Platform
- **Production Domain:** `https://dinely.food`
- **Tenant Subdomains:** `https://<restaurant-slug>.dinely.food` (e.g. `https://the-fly.dinely.food`, `https://pizza-house.dinely.food`)
- **AWS Target Region:** `ap-south-1` (Mumbai)
- **Compute:** EC2 `t3.medium` (Ubuntu 24.04 LTS, 30GB EBS gp3)
- **Database:** AWS RDS PostgreSQL 16
- **Reverse Proxy / Entry Point:** AWS Application Load Balancer (ALB) + Nginx
- **SSL/TLS:** AWS Certificate Manager (ACM) Wildcard (`dinely.food`, `*.dinely.food`)
- **DNS:** Route 53 (Alias records for Apex + Wildcard subdomain)
- **Authentication:** Firebase Authentication (Google OAuth provider)

---

## 2. AWS Network & Security Groups Topology

### A. ALB Security Group (`dinely-alb-sg`)
| Type | Protocol | Port | Source | Description |
| :--- | :--- | :--- | :--- | :--- |
| Inbound | TCP | 80 | `0.0.0.0/0` | Public HTTP (redirects to HTTPS) |
| Inbound | TCP | 443 | `0.0.0.0/0` | Public HTTPS |
| Outbound | TCP | 80 | `dinely-ec2-sg` | Route traffic to EC2 instances |

### B. EC2 Security Group (`dinely-ec2-sg`)
| Type | Protocol | Port | Source | Description |
| :--- | :--- | :--- | :--- | :--- |
| Inbound | TCP | 80 | `dinely-alb-sg` | Application traffic strictly from ALB |
| Inbound | TCP | 22 | Administrator IP | SSH administrative access |
| Outbound | All | All | `0.0.0.0/0` | Outbound internet for updates & S3 |

### C. RDS Security Group (`dinely-rds-sg`)
| Type | Protocol | Port | Source | Description |
| :--- | :--- | :--- | :--- | :--- |
| Inbound | TCP | 5432 | `dinely-ec2-sg` | PostgreSQL strictly from backend EC2 |
| Outbound | - | - | - | None (least privilege) |

---

## 3. Step-by-Step Provisioning Guide

### Step 3.1: AWS RDS PostgreSQL Database
1. Open **RDS** in `ap-south-1`.
2. Click **Create database**:
   - Engine: PostgreSQL (Version 16.x)
   - Template: Production or Dev/Test (e.g., `db.t4g.micro` or `db.t3.medium`)
   - DB instance identifier: `dinely-production-db`
   - Master username: `dinely_admin`
   - Master password: `<SECURE_PASSWORD>`
   - Public access: **No** (Strictly private)
   - VPC Security Group: Assign `dinely-rds-sg`
   - Initial database name: `dinely_production`
3. Once available, note the RDS Endpoint (e.g. `dinely-production-db.xxxxxx.ap-south-1.rds.amazonaws.com`).

### Step 3.2: AWS Certificate Manager (ACM)
1. Open **Certificate Manager (ACM)** in `ap-south-1`.
2. Click **Request Certificate** (Public):
   - Fully qualified domain names:
     - `dinely.food`
     - `*.dinely.food`
   - Validation method: **DNS validation**
3. Add the generated CNAME records to Route 53 zone for `dinely.food`.
4. Wait for Certificate Status to change to **Issued**.

### Step 3.3: EC2 Instance
1. Open **EC2** in `ap-south-1`.
2. Launch an Instance:
   - Name: `dinely-production-app`
   - AMI: Ubuntu 24.04 LTS (HVM), SSD Volume Type
   - Instance Type: `t3.medium`
   - Storage: 30 GiB gp3
   - Security Group: `dinely-ec2-sg`
   - Key pair: Select or create your admin SSH key
   - IAM Role: Attach instance profile with `AmazonS3FullAccess` (for tenant images)
3. SSH into the instance:
   ```bash
   ssh -i your-key.pem ubuntu@<EC2-PUBLIC-IP>
   ```
4. Run bootstrap script:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/.../scripts/aws_ec2_setup.sh | bash
   # or clone repository directly into /opt/dinely
   ```

### Step 3.4: Application Load Balancer (ALB)
1. Open **EC2 > Load Balancers** in `ap-south-1`.
2. Create **Application Load Balancer**:
   - Name: `dinely-prod-alb`
   - Scheme: Internet-facing, IPv4
   - VPC & Subnets: Select 2+ public subnets across availability zones
   - Security Group: `dinely-alb-sg`
3. Target Group:
   - Target type: Instances
   - Protocol: HTTP (Port 80)
   - Health check path: `/healthz`
   - Healthy threshold: 2, Unhealthy threshold: 3, Timeout: 5s, Interval: 15s
   - Register the EC2 instance on Port 80
4. Listeners & Rules:
   - **HTTP:80**: Action -> **Redirect to HTTPS :443** (301 Permanent)
   - **HTTPS:443**: Action -> **Forward to Target Group**
   - Security policy: `ELBSecurityPolicy-TLS13-1-2-2021-06`
   - Default SSL Certificate: Select the ACM wildcard certificate for `*.dinely.food`

### Step 3.5: Route 53 DNS Configuration
1. Open **Route 53 > Hosted zones > dinely.food**.
2. Create Record 1 (Apex):
   - Record name: *(empty for dinely.food)*
   - Record type: **A**
   - Alias: **Yes** -> Route traffic to **Alias to Application and Classic Load Balancer** -> Region `ap-south-1` -> Select `dinely-prod-alb`.
3. Create Record 2 (Wildcard):
   - Record name: `*` (`*.dinely.food`)
   - Record type: **A**
   - Alias: **Yes** -> Route traffic to the same `dinely-prod-alb`.

---

## 4. Database Migration & Restoration

To migrate verified production data from the backup directly to the new AWS RDS instance:
```bash
python scripts/restore_rds.py --db-url "postgresql://dinely_admin:<PASSWORD>@<RDS_ENDPOINT>:5432/dinely_production"
```
The script will:
1. Verify connectivity.
2. Execute the verified SQL backup transactionally.
3. Validate row counts across `restaurants`, `restaurant_domains`, `memberships`, `menu_items`, `tables`, and `orders`.

---

## 5. Application Deployment on EC2

1. In `/opt/dinely`, create `.env`:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Provide:
   ```ini
   DATABASE_URL=postgresql+asyncpg://dinely_admin:<PASSWORD>@<RDS_ENDPOINT>:5432/dinely_production
   DATABASE_URL_SYNC=postgresql://dinely_admin:<PASSWORD>@<RDS_ENDPOINT>:5432/dinely_production
   ENVIRONMENT=production
   DEBUG=False
   PORT=8080
   JWT_ACCESS_SECRET_KEY=<SECURE_RANDOM_32_CHAR_STRING>
   JWT_REFRESH_SECRET_KEY=<SECURE_RANDOM_32_CHAR_STRING>
   FIREBASE_PROJECT_ID=dinely-cd6cd
   AWS_REGION=ap-south-1
   AWS_S3_BUCKET=dinely-production-uploads
   ```
2. Launch Docker Compose:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
3. Verify local health check:
   ```bash
   curl -I http://localhost/healthz
   # Returns HTTP/1.1 200 OK
   ```

---

## 6. Verification & Acceptance Testing

Test all endpoints over live HTTPS:
1. **Platform Root:** `curl -I https://dinely.food` -> 200 OK
2. **Health Check:** `curl https://dinely.food/healthz` -> `{"status":"healthy"}`
3. **Database Readiness:** `curl https://dinely.food/readyz` -> `{"status":"ready","database":"connected"}`
4. **Tenant Subdomain:** `curl https://aws-test-pizza.dinely.food/customer`
5. **Unknown Subdomain:** `curl https://does-not-exist.dinely.food` -> Returns Venue Not Found page (404)
6. **Cross-Tenant Isolation:** Verify that Restaurant B orders or settings cannot be queried with Restaurant A credentials.

---

## 7. Operational Runbook

### Log Inspection (No Secrets Exposed)
```bash
docker compose -f docker-compose.prod.yml logs -f --tail=100 backend
docker compose -f docker-compose.prod.yml logs -f --tail=100 web
```

### Rollback Procedure
If a deployment fails:
```bash
docker compose -f docker-compose.prod.yml down
git checkout <PREVIOUS_STABLE_TAG>
docker compose -f docker-compose.prod.yml up -d --build
```

### Database Backup
Automated daily snapshots are configured in RDS with 7-day retention.
To take an ad-hoc manual snapshot:
```bash
aws rds create-db-snapshot \
    --db-instance-identifier dinely-production-db \
    --db-snapshot-identifier "dinely-manual-backup-$(date +%Y%m%d%H%M%S)" \
    --region ap-south-1
```
