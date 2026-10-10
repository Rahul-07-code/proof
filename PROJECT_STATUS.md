# Project status

Last updated: 2026-10-09

## Current phase

Phase 4 remains IN PROGRESS. PostgreSQL is provisioned and verified; the Docker runner builds and standalone reference/weak checks pass. The project is NOT COMPLETE. GitHub OAuth and authenticated user journeys await local OAuth app configuration and trusted role allowlists. The challenge remains disabled until reviewer quality control is persisted through the authenticated app.

## Specification checklist

| Requirement | Status | Current evidence / remaining work |
|---|---|---|
| GitHub OAuth and repository selection | IN PROGRESS | Consent, OAuth, encrypted-token callback, repo selection and analysis code exist. OAuth app credentials are missing; callback and real API remain unverified. |
| Resume PDF extraction and claims | IN PROGRESS | PDF parser and upload/claim UI/API exist. No actual PDF has been uploaded or persisted. |
| Evidence ledger and source provenance | IN PROGRESS | Schema and APIs exist; database is working. Need authenticated repository analysis to verify source-backed evidence. |
| Deterministic versioned verification/scoring | IN PROGRESS | Rule and weighted-coverage unit tests pass; real verdict reproducibility awaits user evidence. |
| Originality and attribution | IN PROGRESS | Commit author, fork metadata and exact normalized-file match signals carry uncertainty labels. They do not prove originality/authorship; live GitHub flow is unverified. |
| Practical coding assessment | IN PROGRESS | Python runner image builds; standalone reference/weak checks pass. No candidate submission has run. |
| Validated tasks, hidden tests and secure execution | IN PROGRESS | Docker runner tested. App QC is reviewer-only and not persisted. Database task remains unvalidated, so submissions are disabled. |
| Persistent assessment results and rubric | IN PROGRESS | Schema/API implemented; no candidate result has been persisted. |
| Role-weighted gap planner | IN PROGRESS | Routes, UI and formula exist; authenticated workflow remains unverified. |
| Progress, freshness and delta history | IN PROGRESS | Routes/schema/formula exist; no real evidence history yet. |
| Scoped, expiring/revocable passport | IN PROGRESS | Field choices, expiry, hash-only token and revocation are implemented; authenticated lifecycle remains unverified. |
| Recruiter inspection/comparison/reassessment | IN PROGRESS | Role-gated APIs/UI and candidate accept/decline flow exist; real account workflow remains unverified. |
| College cohorts and aggregate dashboard | IN PROGRESS | Role-gated cohort create/invite/join and aggregate UI/API exist; real account workflow remains unverified. |
| Assessment QC and human review/calibration | IN PROGRESS | Standalone task checks pass. Reviewer queue loads on entry; uphold/adjust/inconclusive decisions, separate adjusted score, audit and calibration sample are transactionally persisted. Need reviewer login, app QC persistence and human sample. |
| Adaptive follow-up questions | IN PROGRESS | Rule-generated questions and persistence/UI code exist; authenticated DB workflow remains unverified. |
| LeetCode public ownership verification | BLOCKED | Public lookup cannot prove ownership; no ownership evidence is created and no supported ownership protocol is available. |
| Cheating process telemetry | NOT STARTED - explicitly deferred by spec | No process telemetry is collected. |
| Consent, roles, permissions, audit and privacy | IN PROGRESS | Code paths exist; auth-dependent checks need real GitHub accounts. |
| Responsive accessible frontend | IN PROGRESS | Student/recruiter/college/reviewer pages and responsive/focus styles exist. Browser checks cover consent and assessment gating; broader interaction/accessibility tests remain. |

## Verified completed work

- DONE - verified: Provisioned absent `proof_of_skill`, `proof_migrator`, and `proof_app`. Generated role passwords are only in ignored `.env.local`; admin password was entered at a hidden prompt and not echoed.
- DONE - verified: Applied `001_initial.sql` through `004_review_adjustments.sql`; migration reruns are idempotent.
- DONE - verified: `npx tsx scripts/verify-database.ts` confirmed four migrations, runtime identity, actual app-table insert/read across fresh connection pools, and denial of migration bookkeeping and DDL access to `proof_app`. Temporary probe row was deleted.
- DONE - verified: Docker 29.1.2 Linux engine; runner image built. `npx tsx scripts/validate-challenge.ts` ran reference and deliberately weak implementations in restricted containers; reference passed and weak implementation was rejected.
- DONE - verified: Production app read the seeded challenge from PostgreSQL (`GET /api/assessment` 200); unauthenticated `/api/progress` returned 401.
- DONE - verified: Browser consent flow redirected using GET and reached the expected OAuth-not-configured 503. Browser test found and fixed a 405 redirect issue.
- DONE - verified: Browser assessment page showed DB status `unvalidated` and kept submission disabled.
- DONE - verified: Browser progress page showed 401/UNAUTHENTICATED without a fabricated 0% score.
- DONE - verified: Latest browser smoke of `/recruiter` and `/quality-control` showed explicit role-gated 401 access-denied states for an unauthenticated visitor.
- DONE - verified: Latest `npm run typecheck`, `npm run lint` (no warnings), `npm test` (5/5), and `npm run build` all passed after the latest review/gap/workspace edits.
- UNVERIFIED: OAuth, live GitHub API, actual PDF, reviewer QC persistence, candidate assessment, and authenticated student/recruiter/college/reviewer journeys.

## Blockers and manual configuration

- GitHub OAuth Client ID and Client Secret are missing. Create an OAuth App with homepage `http://localhost:3000` and callback `http://localhost:3000/api/auth/github/callback`; then run `powershell -ExecutionPolicy Bypass -File scripts/configure-github-oauth.ps1` to enter the ID, hidden secret and role logins locally. Do not send the secret in chat.
- Set `REVIEWER_GITHUB_LOGINS` to a trusted GitHub login; set recruiter/college allowlists as needed.
- No actual resume PDF is present for extraction testing.
- LeetCode has no supported public ownership-verification protocol in this integration.
- Repo originality analysis is limited to exact-match/provenance heuristics. A repo-specific challenge generator is not implemented; the current challenge is generic Python.

## Database and integration state

- PostgreSQL 18 on 127.0.0.1:5432: DONE, reachable.
- Database and least-privilege roles: DONE. Migration role owns the new DB/schema; runtime role has application DML/sequence access, not DDL or migration-table access.
- Four migrations: DONE and recorded.
- Persistence: DONE. Real app-role probe survived fresh connection pools and was cleaned up; app endpoint read persisted challenge.
- Docker runner: image build and isolated reference/weak checks DONE. Reviewer API QC has not been persisted; task remains unvalidated.
- GitHub OAuth/API, PDF and authenticated product flows: UNVERIFIED, waiting on OAuth credentials/role configuration.
- LLM is not wired; deterministic verifier remains authoritative.

## Commands and observed outcomes

- `powershell -ExecutionPolicy Bypass -File scripts/provision-local-postgres.ps1` - PASS. Hidden admin prompt; checks catalog before changes; generated app/migration credentials written only to ignored `.env.local`.
- `powershell -ExecutionPolicy Bypass -File scripts/generate-local-secrets.ps1` - PASS. Generated missing session/encryption secrets locally, preserving existing values.
- `npm run db:migrate` - PASS, applied four migrations. Rerun PASS/idempotent.
- `npx tsx scripts/verify-database.ts` - PASS, migration records, runtime identity, DML/persistence, migration-table denial, DDL denial.
- `docker info` outside sandbox - PASS, Docker 29.1.2 Linux. Sandbox pipe access was denied; approved outside-sandbox check succeeded.
- `docker build -f Dockerfile.runner -t proof-of-skill-python-runner:latest .` - PASS after changing reserved UID 65534 to 10001.
- `npx tsx scripts/validate-challenge.ts` - PASS; reference passes, weak solution rejected. This standalone check does not persist app QC state.
- Browser consent - PASS to expected OAuth-missing-credential state after fixing redirect method.
- Browser assessment - PASS; DB task status loaded as unvalidated and Submit is disabled.
- Browser progress without login - PASS; API 401 and UI reports UNAUTHENTICATED.
- Browser `/recruiter` and `/quality-control` without login - PASS; both render explicit access-denied states after 401.
- `npm run typecheck` - PASS.
- `npm run lint` - PASS, no warnings after latest hook fix.
- `npm test` - PASS, 1 file / 5 tests. Initial sandbox run failed before collection with Windows `spawn EPERM`; approved outside-sandbox run passed.
- `npm run build` - PASS after latest edits, exit 0; Next.js generated application routes.
- `npm run start` and route smoke - PASS; pages returned 200, assessment API read database challenge, unauthenticated progress returned 401.
- No OAuth callback, live GitHub API, PDF, persisted reviewer QC or candidate submission executed.

## Files changed this turn

Added `scripts/provision-local-postgres.ps1`, `scripts/generate-local-secrets.ps1`, `scripts/configure-github-oauth.ps1`, `scripts/verify-database.ts`, and migration `004_review_adjustments.sql`; fixed Docker runner UID and consent redirect; loaded `.env.local` in challenge validation; updated workspace/home/gap/progress/recruiter/reviewer/passport flows, review and gap APIs, and handoff docs. `.env.local` is ignored. `Project_Spec.md` is intact. No existing DB data was overwritten.

## Git state

Branch `master`; no commits. Project files remain untracked from initial setup; preserve them. `.env.local` is ignored. No secrets are committed.

## Exact next action and acceptance criteria

Configure the GitHub OAuth App and role allowlists locally, then complete browser consent -> OAuth callback -> repository selection/analysis. Acceptance: real user, encrypted token, consent/role/audit rows, repository selection and source-linked evidence persist, and pages show the real results. Then use the configured reviewer account to persist QC and verify the challenge becomes validated before submitting a candidate solution.

## Remaining work

Configure OAuth; run authenticated E2E flows; upload a real PDF; persist reviewer QC; submit/grade an actual candidate solution; verify history, gaps, passport expiry/revocation, recruiter comparison/reassessment, cohorts, reviewer calibration and authorization errors; assess repo-specific challenges and broader originality analysis; document LeetCode ownership limitation honestly; perform accessibility/security checks. Build, lint, typecheck, and unit tests currently pass. Full completion has not been achieved.
