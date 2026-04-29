# DOK-HR Commercial Expansion Plan
**Multi-Company Internal Deployment for 7 Companies**
**Version:** 1.0 | **Date:** 2026-04-24 | **Status:** Planning

---

## 1. Executive Summary

DOK-HR is currently a single-tenant site-based workforce management system (React + Express + Oracle). This plan outlines the full roadmap to transform it into a **multi-tenant, per-company customizable platform** that serves 7 internal companies under a single hosted deployment.

The core strategy is **Oracle Schema-per-Tenant** — each company gets an isolated Oracle schema, sharing one database server but with full data separation. A new **Platform (Super-Admin)** layer sits above all companies to manage onboarding, configuration, and cross-company reporting.

---

## 2. Current System Assessment

| Dimension | Current State | Gap |
|---|---|---|
| Multi-tenancy | Site-based only (no company layer) | Need company/tenant isolation |
| Database | Single Oracle schema, all sites mixed | Need per-company schema |
| Auth roles | admin / supervisor / staff / system_admin | Need company_admin + platform_admin |
| Branding | None | Need per-company name, logo, colors |
| Config | Single `.env` file | Need per-company config (OT rules, rates) |
| Invoice | Single invoice format | Need per-company invoice template |
| Deployment | Single instance | Need routing by company |

---

## 3. Architecture Decision: Database Strategy

### Recommended: Oracle Schema-per-Tenant

Each of the 7 companies gets a dedicated Oracle schema (user) within the same Oracle XE/SE instance.

```
Oracle Instance (XEPDB1)
├── PLATFORM_ADMIN      ← global: companies, plans, users registry
├── DOK_COMPANY_A       ← Company A: all 12 tables
├── DOK_COMPANY_B       ← Company B: all 12 tables
├── DOK_COMPANY_C       ← Company C: all 12 tables
├── DOK_COMPANY_D       ← Company D: all 12 tables
├── DOK_COMPANY_E       ← Company E: all 12 tables
├── DOK_COMPANY_F       ← Company F: all 12 tables
└── DOK_COMPANY_G       ← Company G: all 12 tables
```

### Why Schema-per-Tenant (vs alternatives)

| Approach | Pros | Cons | Decision |
|---|---|---|---|
| **Schema per tenant** | Strong isolation, easy backup per company, no schema changes to existing tables, Oracle-native | Slightly more connection pool complexity | **CHOSEN** |
| Row-level (company_id column) | Simple, one schema | Risky data leaks, requires altering all 12 tables, complex queries | Rejected |
| Database per tenant | Maximum isolation | Too heavy for 7 internal companies, high resource cost | Rejected |

### Connection Pool Strategy

```
Backend
├── Platform Pool   → PLATFORM_ADMIN schema
├── Company A Pool  → DOK_COMPANY_A schema
├── Company B Pool  → DOK_COMPANY_B schema
...
└── Company G Pool  → DOK_COMPANY_G schema
```

Each pool: `poolMin: 1, poolMax: 5` (vs current single pool of 10).
Total max connections: `1 + (7 × 5) = 36` — well within Oracle XE limits (20 concurrent for XE; use Oracle SE2 for production).

**Recommendation: Upgrade to Oracle Standard Edition 2 (SE2)** for production to support 7 company pools reliably.

---

## 4. New System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   NGINX / Reverse Proxy                 │
│   company-a.dok-hr.internal  →  /api/tenant/company-a   │
│   company-b.dok-hr.internal  →  /api/tenant/company-b   │
│   platform.dok-hr.internal   →  /api/platform           │
└───────────────┬─────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────┐
│                   Express Backend                        │
│  ┌──────────────────┐   ┌──────────────────────────┐   │
│  │  Platform Router  │   │   Tenant Router          │   │
│  │  /api/platform/*  │   │  /api/tenant/:company/*  │   │
│  │  - company CRUD   │   │  - all existing routes   │   │
│  │  - cross-reports  │   │  - scoped to schema      │   │
│  └──────────────────┘   └──────────────────────────┘   │
│                                                          │
│  Tenant Middleware: resolves company → schema → pool    │
└───────────────┬─────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────┐
│                   Oracle Database                        │
│   PLATFORM_ADMIN | COMPANY_A | COMPANY_B | ... G        │
└─────────────────────────────────────────────────────────┘
```

---

## 5. New Roles & Access Hierarchy

```
Platform Admin          (global: manages all 7 companies)
  └── Company Admin     (per-company: manages one company's sites + users)
        └── Supervisor  (per-site: existing role, unchanged)
              └── Staff (per-site: existing role, unchanged)
```

| Role | Scope | New Capabilities |
|---|---|---|
| **Platform Admin** | All companies | Create/suspend companies, cross-company reports, billing, schema provisioning |
| **Company Admin** | One company | Manage sites, set OT rules, branding, invoice templates, create supervisors |
| **Supervisor** | Assigned sites | Unchanged from current system |
| **Staff** | Assigned site | Unchanged from current system |

---

## 6. Platform Admin Schema (PLATFORM_ADMIN)

New tables in the global schema:

```sql
-- Company registry
CREATE TABLE companies (
    id           NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_code VARCHAR2(20) UNIQUE NOT NULL,   -- e.g. 'COMPANY_A'
    company_name VARCHAR2(200) NOT NULL,
    schema_name  VARCHAR2(30) NOT NULL,           -- Oracle schema name
    subdomain    VARCHAR2(100),                   -- e.g. 'abans'
    status       VARCHAR2(20) DEFAULT 'active',   -- active / suspended
    created_at   DATE DEFAULT SYSDATE,
    logo_url     VARCHAR2(500),
    primary_color VARCHAR2(10)                    -- hex color for branding
);

-- Platform-level users (Platform Admin only)
CREATE TABLE platform_users (
    id           NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    epf_number   VARCHAR2(50) UNIQUE NOT NULL,
    password_hash VARCHAR2(200) NOT NULL,
    name         VARCHAR2(200),
    role         VARCHAR2(30) DEFAULT 'platform_admin'
);

-- Per-company configuration overrides
CREATE TABLE company_config (
    id           NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id   NUMBER REFERENCES companies(id),
    config_key   VARCHAR2(100) NOT NULL,
    config_value VARCHAR2(500) NOT NULL
    -- e.g. DAYS_IN_PERIOD=22, EXTRA_UNIT_RATE=0.5, CURRENCY=LKR
);

-- Audit log (cross-company)
CREATE TABLE platform_audit_log (
    id           NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id   NUMBER,
    actor_epf    VARCHAR2(50),
    action       VARCHAR2(200),
    details      CLOB,
    logged_at    TIMESTAMP DEFAULT SYSTIMESTAMP
);
```

---

## 7. Per-Company Schema Changes

Each company schema (`DOK_COMPANY_X`) uses the **existing 12 tables unchanged** plus these additions:

```sql
-- Company branding & settings (replaces .env per-company config)
CREATE TABLE company_settings (
    setting_key   VARCHAR2(100) PRIMARY KEY,
    setting_value VARCHAR2(1000)
    -- keys: COMPANY_NAME, INVOICE_PREFIX, CURRENCY,
    --       DAYS_IN_PERIOD, EXTRA_UNIT_RATE, WORKING_HOURS
);

-- Invoice template customization
CREATE TABLE invoice_templates (
    id            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    template_name VARCHAR2(100),
    header_html   CLOB,
    footer_html   CLOB,
    is_default    NUMBER(1) DEFAULT 0
);

-- Existing 12 tables: users, sites, site_task_types, tasks,
-- attendance, custom_ot_records, payroll_saved_records,
-- cost_varient, profit_amount, poya_days, temporary_assignments
-- (NO structural changes — just deployed per schema)
```

---

## 8. Backend Changes Required

### 8.1 Tenant Resolution Middleware (New)

```
Request → Extract company from JWT or subdomain
       → Look up schema name in PLATFORM_ADMIN.companies
       → Attach correct connection pool to req.db
       → Forward to existing controller (unchanged)
```

All existing controllers only need `req.db` injected — no other changes needed to the 12 existing controllers.

### 8.2 New Platform Controller

| Endpoint | Function |
|---|---|
| `POST /api/platform/companies` | Provision new company (create schema, run migrations) |
| `GET /api/platform/companies` | List all 7 companies with status |
| `PUT /api/platform/companies/:id` | Update branding, config, status |
| `GET /api/platform/reports/cross-company` | Aggregated analytics across all companies |
| `POST /api/platform/companies/:id/admin` | Create company admin user |
| `GET /api/platform/audit-log` | View cross-company audit trail |

### 8.3 Auth Changes

- JWT payload adds: `{ userId, role, companyCode, schema }`
- Login flow: user enters EPF + password + **company code** (or auto-resolved by subdomain)
- Platform admin: logs in at `platform.dok-hr.internal`, no company scope
- Company admin: new role, can manage sites/users but cannot access platform routes

### 8.4 Company Provisioning Script

Automated script that:
1. Creates Oracle schema/user with correct grants
2. Runs `schema.sql` inside the new schema
3. Seeds `company_settings` with defaults
4. Inserts company record into `PLATFORM_ADMIN.companies`
5. Creates the first Company Admin user

---

## 9. Frontend Changes Required

### 9.1 Login Page

- Add company selector (dropdown of 7 companies) **or** auto-detect from subdomain
- Platform admin login is a separate URL (`/platform/login`)

### 9.2 Company Branding System

- Fetch `company_settings` on app load (name, logo, primary color)
- Apply CSS variables for primary color across Tailwind components
- Show company logo in sidebar/header

### 9.3 New: Platform Admin UI (`/platform/*`)

| Page | Purpose |
|---|---|
| `/platform/companies` | List all 7 companies, status, quick stats |
| `/platform/companies/:id` | Edit branding, config, suspend/activate |
| `/platform/companies/:id/admin` | Create/reset company admin |
| `/platform/reports` | Cross-company KPI dashboard |
| `/platform/audit` | Audit log viewer |

### 9.4 New: Company Admin UI (`/company-admin/*`)

| Page | Purpose |
|---|---|
| `/company-admin/settings` | Edit company name, invoice prefix, currency, OT defaults |
| `/company-admin/invoice-template` | Customize invoice header/footer |
| `/company-admin/users` | Manage all staff (currently admin-only) |
| `/company-admin/sites` | Manage all sites |

### 9.5 Existing Pages

All 13 existing pages remain unchanged in behavior. They are automatically scoped to the logged-in user's company via the JWT + tenant middleware.

---

## 10. Customization Per Company

Each company can independently configure:

| Setting | Example Values |
|---|---|
| Company name & logo | "ABANS PLC", "DOK Security" |
| Primary brand color | `#1E40AF`, `#DC2626` |
| Invoice prefix | `INV-ABN-`, `INV-DOK-` |
| Currency symbol | LKR, USD |
| Working days per month | 22, 24, 26 |
| Extra unit rate | 0.5, 1.0 |
| OT calculation type | time_based / target_based / staff_outsource |
| Public holidays (poya days) | Per-company calendar |
| Daily target per site | Per-site, already in `sites` table |

---

## 11. Data Migration Plan (Existing Data)

The current system's data belongs to one company (presumed Company A or the primary company).

**Migration Steps:**

1. **Identify** which company the existing data belongs to
2. **Create** the target schema (e.g., `DOK_COMPANY_A`) via provisioning script
3. **Export** all 12 tables from the current schema using Oracle Data Pump (`expdp`)
4. **Import** into the new company schema (`impdp REMAP_SCHEMA=current:DOK_COMPANY_A`)
5. **Validate** record counts and spot-check invoices, payroll records
6. **Cut over** — update `.env` / config to point to new schema, test login
7. **Drop** old public schema or archive it

Estimated migration time: **2–4 hours** per company (data volume dependent).

---

## 12. Infrastructure & Deployment

### Recommended Stack

| Component | Recommendation | Reason |
|---|---|---|
| **Database** | Oracle SE2 (Standard Edition 2) | Supports 7 pools, no user limit like XE |
| **App Server** | Single Node.js instance with PM2 | 7 companies, low concurrent load |
| **Reverse Proxy** | NGINX | Subdomain routing per company |
| **OS** | Ubuntu 22.04 LTS | Oracle SE2 supported, stable |
| **Backup** | Oracle RMAN per schema, nightly | Easy per-company restore |
| **SSL** | Wildcard cert (`*.dok-hr.internal`) | Covers all 7 subdomains |

### Subdomain Routing (NGINX)

```nginx
server {
    server_name ~^(?<company>[a-z0-9-]+)\.dok-hr\.internal$;
    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header X-Company-Code $company;
    }
}
```

### Environment Configuration (New Structure)

```env
# Platform DB (global registry)
PLATFORM_DB_USER=platform_admin
PLATFORM_DB_PASSWORD=...
PLATFORM_DB_CONNECT=localhost:1521/XEPDB1

# Company schemas (auto-discovered from PLATFORM_ADMIN.companies table)
# No hardcoded per-company env vars needed

# JWT
JWT_SECRET=...

# Defaults (overridable per company via company_settings)
DEFAULT_DAYS_IN_PERIOD=22
DEFAULT_EXTRA_UNIT_RATE=0.5
```

---

## 13. Security Considerations

| Area | Requirement |
|---|---|
| Schema isolation | Each company schema user has grants ONLY to their own schema |
| JWT scoping | Token includes `companyCode`; middleware rejects cross-company requests |
| Platform admin | Separate auth flow, no company JWT issued |
| Audit logging | All admin actions logged to `PLATFORM_ADMIN.platform_audit_log` |
| Password policy | Enforce min length + complexity for company admins |
| Data backup | Per-schema RMAN backup so one company's backup doesn't expose others |
| HTTPS | Mandatory for all subdomains (internal CA or Let's Encrypt) |

---

## 14. Development Phases & Timeline

### Phase 1 — Foundation (Weeks 1–3)
- [ ] Upgrade Oracle XE → Oracle SE2 (or provision SE2 server)
- [ ] Create `PLATFORM_ADMIN` schema and 4 global tables
- [ ] Write company provisioning script (schema creation + migration runner)
- [ ] Implement tenant resolution middleware in Express
- [ ] Update JWT to include `companyCode` + `schema`
- [ ] Update all controllers to use `req.db` (injected pool)
- [ ] Migrate existing data to first company schema
- [ ] Deploy first company — verify existing functionality unchanged

### Phase 2 — Platform Admin (Weeks 4–5)
- [ ] Build Platform Admin backend routes (`/api/platform/*`)
- [ ] Build Platform Admin frontend (`/platform/*` pages)
- [ ] Company provisioning UI (create + configure new company)
- [ ] Cross-company KPI report (aggregate all 7 companies)

### Phase 3 — Company Customization (Weeks 6–7)
- [ ] Company branding system (logo, color, name from `company_settings`)
- [ ] Apply branding to frontend via CSS variables
- [ ] Company Admin role + UI (`/company-admin/*`)
- [ ] Per-company invoice template customization
- [ ] Login page with company selector / subdomain auto-detect

### Phase 4 — Remaining 6 Companies (Weeks 8–9)
- [ ] Provision schemas for companies B through G
- [ ] Onboard each company: create admin user, configure settings, seed sites/users
- [ ] NGINX subdomain routing setup
- [ ] SSL wildcard certificate
- [ ] Per-company smoke testing

### Phase 5 — Hardening & Handover (Week 10)
- [ ] Security audit (schema isolation, JWT scoping, audit log)
- [ ] RMAN backup strategy per schema
- [ ] Runbook documentation for platform admin
- [ ] Platform admin training (onboarding new companies, troubleshooting)
- [ ] Performance testing with 7 concurrent company pools

---

## 15. Effort Estimate

| Phase | Backend | Frontend | DB/Infra | Total |
|---|---|---|---|---|
| Phase 1 — Foundation | 5 days | 1 day | 2 days | **8 days** |
| Phase 2 — Platform Admin | 3 days | 4 days | 0 | **7 days** |
| Phase 3 — Customization | 2 days | 5 days | 0 | **7 days** |
| Phase 4 — 6 Companies | 1 day | 0 | 3 days | **4 days** |
| Phase 5 — Hardening | 2 days | 0 | 2 days | **4 days** |
| **Total** | **13 days** | **10 days** | **7 days** | **~30 working days** |

---

## 16. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Oracle XE connection limit hit | High | High | Upgrade to SE2 before Phase 1 |
| Existing data migration errors | Medium | High | Full backup before migration, row count validation |
| Controller breaks after pool injection | Low | Medium | Phase 1 deploys one company first, run all tests |
| Company data leakage via wrong schema | Low | Critical | Middleware unit tests for schema resolution, schema user grants restricted |
| Performance with 7 pools | Low | Medium | Load test in Phase 5, tune poolMin/poolMax |

---

## 17. What Does NOT Change

These parts of the existing codebase require **zero changes**:

- All 12 Oracle table schemas (structure preserved per company)
- All 13 frontend pages (behavior unchanged, company-scoped automatically)
- All 12 existing Express controllers (only `req.db` injection changes)
- JWT authentication flow (extended, not replaced)
- Payroll, invoice, analytics calculation logic
- Swagger API documentation structure

---

## 18. Summary of Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Multi-tenancy model | Oracle Schema-per-Tenant | Strong isolation, fits Oracle strengths, no table changes |
| Database edition | Oracle SE2 (upgrade from XE) | 7 connection pools exceed XE session limits |
| Company routing | Subdomain per company | Clean separation, familiar URL pattern |
| Branding | CSS variables from `company_settings` | Runtime theming without rebuild |
| Existing code changes | Minimal (pool injection only) | Reduce regression risk |
| Migration approach | Oracle Data Pump per schema | Native, reliable, reversible |
| Phase order | One company first, then 6 | Validate changes before full rollout |
