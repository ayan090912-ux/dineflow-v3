# DINELY RECOVERY PROTOCOL & OPERATING RULES
**Status:** MANDATORY & ENFORCED  
**Scope:** All Subsystems (Frontend, Backend, Database, Auth, Edge, Terminals)  

---

## 1. Absolute Directives

1. **STOP ALL FEATURE DEVELOPMENT:**
   - No new modules, no new feature flags, no UI redesigns, no speculative additions.
2. **FREEZE INFRASTRUCTURE MIGRATIONS:**
   - Do NOT migrate Render to Cloud Run during recovery phases.
   - Do NOT migrate Neon database.
   - Do NOT delete or modify production data.
   - Do NOT modify Cloudflare production routing or DNS records.
3. **PRESERVE ALL FALLBACKS:**
   - Render = Active backend fallback.
   - Neon = Active database of record.
   - Firebase = Active authentication authority.
   - Cloudflare = Active edge and DNS proxy.

---

## 2. Mandatory Operating Rules

### Rule 1: One Subsystem at a Time
- Work strictly in isolated, bounded phases.
- Never touch multiple subsystems simultaneously (e.g., do not modify billing while diagnosing kitchen orders).
- Complete, verify, and lock down one subsystem before moving to the next.

### Rule 2: No Speculative Rewrites
- Do not rewrite existing modules or abstractions on assumption.
- Identify the exact line, contract, or query causing a defect.
- Make the minimal, atomic, surgical change required to resolve root causes.

### Rule 3: No Destructive Production Changes
- Never execute unbacked `DROP`, `TRUNCATE`, or blind bulk `DELETE` queries on PostgreSQL.
- Always perform a pre-flight inspection and manifest backup before executing any data maintenance.
- Keep manual database interventions strictly to zero in favor of application-level correctness.

### Rule 4: Every Fix Gets a Regression Test
- Every defect fixed must have a matching automated test added to the regression suite.
- Tests must reproduce the failure before the fix and pass deterministically after the fix.
- Full regression suite must run clean with 100% pass rate before committing.

### Rule 5: Every Fix Gets Browser Verification
- Do not declare a fix complete solely because an API returns HTTP 200.
- Verify end-to-end behavior in Chrome / real browser environment.
- Confirm UI rendering, terminal responsiveness, and real-time state synchronization.

### Rule 6: Every Production Change Gets Rollback Instructions
- Every change touching production configuration, build artifacts, or deployment manifests must be accompanied by explicit rollback commands.
- If an unexpected error occurs, rollback is executed immediately to the verified baseline commit (`d998049`).

---

## 3. Pre-Change Verification Checklist
Before writing code in any phase, the following 7 baseline items must be checked and documented:
1. `git status`
2. Current commit SHA
3. Production URL (`https://dinely.food`)
4. Active backend URL (`https://dineflow-v3.onrender.com/api/v1`)
5. Database environment (Neon PostgreSQL / local fallback)
6. Firebase project (`dinely-cd6cd`)
7. Cloudflare Worker version (`dinely-tenant-router`)
