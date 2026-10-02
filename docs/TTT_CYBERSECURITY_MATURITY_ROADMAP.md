# TTT Cybersecurity Maturity Roadmap

Baseline date: 2026-10-02  
Owner: Thompson Transportation Technologies  
Internal standard: TTT Cybersecurity & Information Assurance Standard (TTT-CSIA-001)

## Purpose

TTT uses three cybersecurity maturity levels:

- **Level 1 — Essential:** minimum operating baseline before materially scaling live customer data.
- **Level 2 — Protected:** mature small-business security guardrails and normal operating target.
- **Level 3 — Assured:** enterprise-grade, auditable security aligned to ISO/IEC 27001 and selected advanced safeguards.

TTT will use CIS Controls IG1 as the Level 1 technical baseline, NIST CSF 2.0 as the management structure, and ISO/IEC 27001 as the long-term assurance model.

## Current observed technical baseline

Observed on 2026-10-02:

- Supabase public-schema application tables: RLS enabled across the current public table inventory.
- Supabase Storage: all current application buckets are private.
- TTT-OS: login activity, session review/revocation and Security Center are implemented.
- TTT-OS MFA capability exists, but none of the three current TTT-OS users has enrolled a verified MFA factor.
- Supabase Security Advisor reports leaked-password protection disabled.
- Supabase Security Advisor reports public.next_ttt_document_number as a SECURITY DEFINER function executable by authenticated users.
- TTT public web/API edge endpoints were reviewed: public functions are rate limited and bounded by named RPC actions; the admin security function requires JWT and owner_admin.
- Browser Supabase configuration contains a publishable key, not a service-role key.
- GitHub repository currently reports no repository rulesets on main.

## Level 1 — Essential checklist

### L1-M1 Governance & inventory — Week 1

- [ ] TTT-GOV-001 Assign cybersecurity owner and backup owner.
- [ ] TTT-GOV-002 Approve Information Security Policy.
- [ ] TTT-AST-001 Create controlled asset/system inventory.
- [ ] TTT-DAT-001 Create data inventory and classify Public / Internal / Confidential / Restricted.
- [ ] Identify every system that stores or processes customer information.
- [ ] Identify every critical vendor and data processor.
- [ ] Define legal/compliance register owner and annual review date.

**Exit:** named accountability, approved baseline policy, complete system/data inventory.

### L1-M2 Identity & application hardening — Weeks 1–2

- [x] TTT-IAM-001 Unique TTT-OS accounts exist.
- [ ] TTT-IAM-002 Enroll MFA for all TTT-OS users; target 100%.
- [ ] TTT-IAM-003 Enable compromised/leaked-password protection in Supabase Auth.
- [ ] TTT-IAM-004 Document joiner/mover/leaver procedure and same-day offboarding.
- [x] TTT-APP-001 RLS enabled on exposed application tables.
- [x] TTT-APP-002 Current Supabase Storage buckets are private.
- [ ] TTT-APP-003 Remediate or formally justify the authenticated SECURITY DEFINER RPC.
- [x] TTT-APP-004 Review public edge functions and keep rate limiting/bounded actions.
- [x] TTT-SEC-001 Keep service-role/secret keys out of browser code.
- [ ] Confirm least-privilege roles for owner_admin, manager and future technician/sales roles.
- [ ] Confirm session timeout/revocation rules.

**Exit:** 100% MFA, no unexplained privileged RPC exposure, RLS/storage green, access model documented.

### L1-M3 Payments, logging & change control — Week 2

- [ ] TTT-PAY-001 Confirm TTT-OS never stores full PAN/card number or CVV; use tokenized processor references only.
- [ ] Record PCI merchant/processor responsibilities and annual validation owner.
- [x] TTT-LOG-001 Authentication activity is logged.
- [ ] Define retention period for security logs.
- [ ] TTT-DEV-001 Protect main branch with required review/status checks; add controlled production change process.
- [ ] Add dependency and secret scanning appropriate to the repository.
- [ ] Confirm production deploy permissions are limited.

**Exit:** payment scope minimized, logs retained, main branch protected, production changes auditable.

### L1-M4 Resilience & operating procedures — Weeks 2–4

- [ ] TTT-BCK-001 Document automated backup coverage for Supabase, critical files and configuration.
- [ ] TTT-BCK-002 Perform one recorded restore test.
- [ ] TTT-INC-001 Approve incident-response and Texas breach-response playbook.
- [ ] Define incident severity levels and contact/escalation tree.
- [ ] TTT-TRN-001 Complete baseline security training for all personnel.
- [ ] TTT-END-001 Verify supported OS, automatic patching, screen lock and full-disk encryption on company devices.
- [ ] TTT-NET-001 Separate business and guest Wi-Fi when shop network is deployed.
- [ ] TTT-RET-001 Approve retention/deletion schedule and secure disposal procedure.
- [ ] TTT-VEN-001 Complete critical vendor register and annual review cadence.
- [ ] Record evidence for every manual control.

**Level 1 gate:** no FAIL controls; every REVIEW control has evidence and management sign-off.

## Level 2 — Protected roadmap

### L2-M1 — Months 2–4
- [ ] Phishing-resistant MFA/passkeys where supported.
- [ ] Quarterly access and privilege reviews.
- [ ] Managed device fleet using MDM.
- [ ] Managed endpoint detection/response.
- [ ] Vulnerability, dependency and secret scanning in CI.
- [ ] Severity-based patch SLAs.

### L2-M2 — Months 4–6
- [ ] Central security alerting/monitoring.
- [ ] Restricted-data vault for GPS, tracking and vehicle-security information.
- [ ] Audit sensitive record access and exports.
- [ ] 3-2-1-style backup resilience with one protected/immutable copy where practical.
- [ ] Annual incident-response tabletop.
- [ ] Defined RTO/RPO and disaster-recovery exercise.

### L2-M3 — Months 6–9
- [ ] Tiered vendor security assessments and contract clauses.
- [ ] Customer privacy access/delete/export workflow.
- [ ] Independent penetration test.
- [ ] Phishing simulations and role-specific training.
- [ ] Security risk register, KPI/KRI dashboard and quarterly review.
- [ ] Cyber-insurance control mapping.

**Level 2 gate:** no unresolved critical/high findings, external testing completed, annual response/recovery exercise evidenced.

## Level 3 — Assured roadmap

### L3-M1 — Months 9–12
- [ ] Establish ISO/IEC 27001-aligned ISMS scope and governance.
- [ ] Formal risk assessment methodology and risk treatment plan.
- [ ] Draft Statement of Applicability.
- [ ] Formal secure SDLC and threat modeling for sensitive features.

### L3-M2 — Months 12–18
- [ ] Privileged Access Management.
- [ ] Data Loss Prevention for Restricted information.
- [ ] SIEM and TTT-specific detection engineering.
- [ ] Managed encryption-key lifecycle/rotation.

### L3-M3 — Months 18–24
- [ ] Software Bill of Materials and software supply-chain governance.
- [ ] Continuous control monitoring.
- [ ] Periodic advanced adversary/red-purple exercises where justified.
- [ ] Formal supplier assurance program.

### L3-M4 — 24+ months
- [ ] Independent ISO/IEC 27001 readiness assessment.
- [ ] Internal audit and management review cadence.
- [ ] Corrective-action tracking and continual improvement.
- [ ] Decide on ISO/IEC 27001 certification and/or SOC 2 based on commercial need.

## Evidence rules

A control is not PASS merely because a policy says it exists. TTT should retain evidence such as configuration screenshots/exports, audit records, training completion, restore-test records, review minutes, scan reports, vendor attestations, incident/tabletop records and change logs.

## Framework mapping

TTT-CSIA-001 should map each control outward to:
- CIS Critical Security Controls v8.1
- NIST Cybersecurity Framework 2.0
- ISO/IEC 27001:2022
- applicable Texas privacy/security obligations
- PCI DSS where card-payment responsibilities apply

The internal TTT control remains the operational source of truth; external frameworks are mappings, not separate duplicate programs.
