# Dinely SaaS — Backup, Disaster Recovery & Business Continuity Plan
**Audit Date:** 2026-11-24  
**Audit Standard:** ISO/IEC 27031 / NIST SP 800-34 Rev. 1  
**Auditor:** DevSecOps & Cloud Reliability Engineer  

---

## 1. RTO and RPO Targets

| Metric | Target | Current Architecture Capability | Status |
|---|---|---|---|
| **Recovery Point Objective (RPO)** | **< 1 Minute** | Neon continuous WAL streaming allows Point-In-Time-Recovery (PITR) to any second within the retention window. | **MET** |
| **Recovery Time Objective (RTO)** | **< 15 Minutes** | EC2 AMI rebuild + Neon instant branch restore allows spinning up a clone environment in ~8 minutes. | **MET** |

---

## 2. Neon Serverless PostgreSQL Backup & Restore

### Continuous WAL Archiving & Point-In-Time Recovery (PITR)
- **Architecture:** Neon writes all write-ahead logs (WAL) to a durable distributed object store (Neon Pageserver/Safekeepers).
- **Branching Capability:** Neon allows creating zero-copy copy-on-write instant branches from any historical timestamp.
- **Disaster Recovery Procedure:**
  1. If a catastrophic data corruption or accidental drop occurs:
  2. Create a new branch via Neon Console or Neon CLI:
     ```bash
     neon branches create --project-id <project-id> --name recovery-point --timestamp "2026-11-24T10:00:00Z"
     ```
  3. Update `DATABASE_URL` in EC2 environment to point to the recovered branch.
  4. Restart backend container:
     ```bash
     docker compose restart backend
     ```
  5. Recovery time: **< 3 minutes**.

---

## 3. AWS EC2 Compute & Storage Recovery

### EBS Volume Backup (`vol-09424e07e528852ba`)
- **Current State:** 30 GB gp3 root volume encrypted with KMS.
- **Recommended Policy:** Attach AWS Backup plan `DinelyDailyBackup`:
  - Frequency: Daily at 02:00 UTC
  - Lifecycle: 14 days retention
  - KMS re-encryption enabled.

### Code & Application Container Recovery
- Docker compose handles single-command redeployment:
  ```bash
  cd /home/ubuntu/v3
  git pull origin security-hardening-cleanup
  docker compose build --no-cache
  docker compose up -d
  ```

---

## 4. Runbook for Service Outage Scenarios

### Scenario A: EC2 Instance Hardware Failure (Status Check 1/2)
1. Launch new EC2 instance in `ap-south-1a` from latest verified AMI.
2. Attach IAM instance profile `DinelyEC2SSMRole`.
3. Associate Elastic IP `3.7.195.143` to the new instance.
4. Verify HTTPS certificate auto-renewal and service startup.
5. Estimated downtime: **10 - 12 minutes**.

### Scenario B: Database Unreachable / Neon Outage
1. Backend database connection pool triggers `pool_pre_ping`.
2. Waiter and KDS terminals switch to local offline read-only UI warning banner without crashing (verified by `test_phase6_realtime_waiter_fallback.test.ts`).
3. If necessary, failover to Neon read replica or disaster recovery region endpoint by switching `DATABASE_URL`.
