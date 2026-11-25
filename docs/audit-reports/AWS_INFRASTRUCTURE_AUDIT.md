# Dinely SaaS — AWS Infrastructure & Cloud Security Audit
**Audit Date:** 2026-11-24  
**Audit Standard:** CIS AWS Foundations Benchmark v3.0 / NIST CSF  
**Cloud Provider:** Amazon Web Services (AWS)  
**Target Account:** AWS Account ID `549047258450` (Region: `ap-south-1` Mumbai)  
**Auditor:** Principal DevSecOps & Cloud Infrastructure Specialist  

---

## 1. Executive Summary

The production cloud deployment supporting Dinely was audited using the AWS CLI and live configuration inspection. The deployment adheres to modern zero-trust infrastructure guidelines, notably eliminating exposed SSH ports in favor of AWS Systems Manager (SSM) Session Manager.

---

## 2. Infrastructure Inventory & Configuration

| Resource | Identity / Name | Region | Status | Audit Rating |
|---|---|---|---|---|
| **EC2 Compute Instance** | `i-0997b0b381dfb3fd0` | `ap-south-1` | Running (`3.7.195.143`) | **COMPLIANT** |
| **Security Group** | `sg-0861a810cec2dd7f4` | `ap-south-1` | Ports 80, 443 Ingress only | **COMPLIANT** |
| **IAM Instance Profile** | `DinelyEC2SSMRole` | Global | SSM Session Manager Access | **COMPLIANT** |
| **EBS Storage Volume** | `vol-09424e07e528852ba` | `ap-south-1` | 30 GB gp3 (KMS Encrypted) | **COMPLIANT** |
| **Database Tier** | Neon Serverless Postgres | `ap-southeast-1` | TLS 1.3 / Isolated VPC | **COMPLIANT** |
| **Reverse Proxy** | Nginx 1.31.10 (Docker) | Containerized | SSL Termination & HSTS | **COMPLIANT** |

---

## 3. CIS AWS Benchmark Compliance Verification

### 3.1 Network Security Groups
- **Finding:** Inspection of `sg-0861a810cec2dd7f4`:
  ```json
  [
    { "IpProtocol": "tcp", "FromPort": 80, "ToPort": 80, "CidrIp": "0.0.0.0/0" },
    { "IpProtocol": "tcp", "FromPort": 443, "ToPort": 443, "CidrIp": "0.0.0.0/0" }
  ]
  ```
- **Port 22 (SSH):** **CLOSED TO INTERNET**. No SSH port is exposed to `0.0.0.0/0` or any CIDR block.
- **Port 5432 (Postgres):** **CLOSED TO INTERNET**. No direct database port exposure.
- **Result:** Fully compliant with CIS EC2 Security Group standards.

### 3.2 IAM Roles & Instance Profiles
- The EC2 instance is attached to IAM Instance Profile `DinelyEC2SSMRole` (`AROAX7VOEJVJE776PYD2D`).
- Eliminates the need for static SSH `.pem` key pairs stored on developer laptops. Access is authenticated via IAM credentials and audited via AWS CloudTrail.

### 3.3 Storage Encryption at Rest
- Root EBS Volume `vol-09424e07e528852ba` (30 GB gp3):
  - `Encrypted: true`
  - KMS Key ARN: `arn:aws:kms:ap-south-1:549047258450:key/1c36c545-fa1f-426a-bb18-77780a9c082a`
- **Result:** Meets OWASP and CIS data-at-rest encryption requirements.

### 3.4 Transport Layer Security (TLS/SSL) & Headers
- Live probe against `https://the-start.dinely.food`:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Permissions-Policy: geolocation=(), camera=(), microphone=()`
  - `Content-Security-Policy: frame-ancestors 'self' https://dinely.food https://*.dinely.food;`

---

## 4. Recommendations for Infrastructure Hardening

1. **Automated AMI Backups:** Configure AWS Backup to take daily snapshots of EBS volume `vol-09424e07e528852ba` with a 14-day retention policy.
2. **CloudWatch Alarm:** Add an alarm on EC2 CPUUtilization > 80% and StatusCheckFailed_System.
3. **AWS WAF (Web Application Firewall):** Attach AWS WAF (or Cloudflare proxy) in front of EC2 to protect against volumetric DDoS, HTTP flood attacks, and malicious bot scanners.
