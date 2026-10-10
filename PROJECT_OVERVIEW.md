# Proof-of-Skill project overview

Proof-of-Skill is an evidence-backed developer assessment platform for students, recruiters, and colleges. It connects claims to inspectable sources, records real practical-assessment outcomes, tracks evidence over time, and gives candidates control over what a passport discloses. Evidence coverage is not job readiness; repository attribution, code originality, and understanding remain distinct questions.

## Product journeys and features

- **Student:** GitHub consent and OAuth; repository selection and analysis; PDF resume extraction and claim review; evidence tiers and source links; Python assessment when a challenge has passed quality validation; role-weighted progress and freshness; gap plans; adaptive follow-up; review requests; passport field selection, optional expiry, sharing and revocation; optional reassessment requests and response.
- **Recruiter:** inspect only active passport fields; compare up to five shared records for a target role; request a reassessment only when the passport permits it. A student must accept before starting the assessment.
- **College:** create invite cohorts or join with an invite; view aggregate member and skill-gap counts. Individual evidence and identities are not exposed in aggregates.
- **Reviewer:** validate a challenge using reference and deliberately weak submissions in the isolated runner; inspect quality reports; adjudicate human-review requests and record agreement samples.

Some journeys have application code but are not operationally verified yet; see [PROJECT_STATUS.md](./PROJECT_STATUS.md). LeetCode support is limited to public profile lookup and does not establish account ownership. Cheating telemetry is explicitly deferred by the specification.

## Technology and repository structure

- Next.js 15 App Router, React 19 and TypeScript for pages and same-origin API handlers.
- PostgreSQL via `pg`, with numbered SQL migrations in `migrations/`.
- Octokit for GitHub REST access and OAuth; AES-256-GCM token encryption.
- `pdf-parse` for in-memory resume extraction; `jose` for signed HTTP-only sessions.
- Docker-based Python assessment runner with networking disabled, resource limits, read-only source mount, non-root execution and per-case containers.
- Vitest unit tests. ESLint, TypeScript and Next production build provide static/build checks.

`src/app/` contains pages and API routes. `src/lib/` contains auth, database, integration, verification and assessment logic. `migrations/` contains schema and role/provenance additions. `scripts/` contains migration and challenge validation tasks. `tests/` contains unit tests. The original [Project_Spec.md](./Project_Spec.md) is preserved.

## Data model and data flow

Browser screens call API handlers. Handlers validate input, authenticate the session, enforce ownership/role checks and persist through PostgreSQL. OAuth stores the encrypted GitHub token, consent record, user role and audit event. Repository analysis stores claims/evidence with source URLs, blob/commit references, confidence, timestamps and uncertainty notes. Resume text is parsed in memory; bounded extracted claims and evidence are persisted, not the uploaded file. Verdict history stores tier, deterministic rule identifier, reason, evidence references and time. Assessment records store challenge version, rubric, outcomes and score. Passport tokens are random secrets shown once; only a SHA-256 token hash, fields, expiry and revocation state are stored.

The schema includes users, roles, consents, integrations, repositories, provenance signals, claims, evidence, rules, verdicts, challenges, assessments, reviews (including separate human-adjusted scores), quality samples/runs, follow-ups, learning plans, passports, cohorts/memberships, reassessment requests and audit log. Migrations are `001_initial.sql` through `004_review_adjustments.sql`.

## Evidence, verification and scoring

Rule `evidence-v1.0.0` applies a repository confidence threshold of 0.65 and labels practical assessment freshness independently at 90 days. The tiers distinguish below-threshold, repository-supported, practically-demonstrated, and recently-reassessed evidence. Old passes remain historical passes with a stale freshness label; missing evidence is not evidence of inability. Coverage for a target role is:

`100 × sum(importance weights for supported claims) / sum(importance weights for eligible claims)`

Evidence sources, rule identifier, reason and verdict history are persisted to support explanation and reproduction. Repository analysis inspects accessible GitHub content, commit metadata, forks, exact normalized-file fingerprints and exact cross-repository matches. These are provenance/originality signals with uncertainty, not proof of authorship, originality, or understanding. Resume claims are self-reported until corroborated. Assessment grades come from deterministic hidden tests; no LLM currently makes authoritative decisions.

## Authentication, integrations and environment

Copy `.env.example` to `.env.local` and configure:

- `DATABASE_URL`: least-privilege runtime PostgreSQL login.
- `MIGRATION_DATABASE_URL`: schema-owner/migration login; may target the same database as `DATABASE_URL`.
- `APP_DB_ROLE`: runtime role that the migration command grants table/sequence access to.
- `APP_BASE_URL`, `SESSION_SECRET` (32+ random characters), and `GITHUB_TOKEN_ENCRYPTION_KEY` (32-byte hex).
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and the exact registered `GITHUB_CALLBACK_URL`.
- `ASSESSMENT_DOCKER_IMAGE`, `ASSESSMENT_TIMEOUT_SECONDS`, `MAX_RESUME_BYTES`.
- Optional allowlists `REVIEWER_GITHUB_LOGINS`, `RECRUITER_GITHUB_LOGINS`, `COLLEGE_GITHUB_LOGINS`; optional feature settings `LLM_API_KEY` and `LEETCODE_ENABLED`.

GitHub uses the OAuth `read:user user:email repo` scopes. Private repository access is possible only after the user grants it. Minimize requested scope before production deployment. Sessions are signed and HTTP-only. Passport public output is limited to selected fields. Account deletion and GitHub disconnect routes exist. Configure TLS, backups, secret management and operational rate limiting for deployment; a persistent rate limiter and durable background queue are not currently included.

## Assessment execution and quality control

The initial challenge is a versioned Python function task. The application does not enable submissions until challenge QC validates the reference and weak solutions. Each input case runs in a fresh Docker container with restricted networking/resources and only that case's input. Expected outputs stay in the app process. Persisted results include the task version, rubric and test outcomes. Human review records a decision and notes beside the automated result; a controlled sample is needed before making validity or fairness claims.

## Setup and commands

Requirements: Node.js 20+, PostgreSQL 18 (or supported PostgreSQL 15+), GitHub OAuth app credentials. Docker Desktop Linux engine is needed to validate and execute practical assessments.

1. Run `powershell -ExecutionPolicy Bypass -File scripts/provision-local-postgres.ps1`. It asks for the local PostgreSQL admin password with hidden input, refuses to change any existing target database/role names, creates `proof_of_skill` and separate least-privilege roles when absent, generates independent role passwords, and writes credentials only to ignored `.env.local`. `scripts/generate-local-secrets.ps1` fills missing session/encryption keys without replacing existing values.
2. Create a GitHub OAuth App with homepage `http://localhost:3000` and callback `http://localhost:3000/api/auth/github/callback`; run `powershell -ExecutionPolicy Bypass -File scripts/configure-github-oauth.ps1` to enter its Client ID, hidden Client Secret, and trusted role logins into `.env.local` without echoing the secret.
3. Run `npm install` and `npm run db:migrate`.
4. Run `npm run dev`; the consent screen starts GitHub OAuth at `${APP_BASE_URL}/api/auth/github/callback`.
5. Build runner image with `docker build -f Dockerfile.runner -t proof-of-skill-python-runner:latest .`, set `ASSESSMENT_DOCKER_IMAGE`, then run `npx tsx scripts/validate-challenge.ts`. A reviewer must also run the authenticated quality-control workflow to persist validation and enable submissions.
6. Checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
7. Deploy behind HTTPS with persistent PostgreSQL and an isolated hardened assessment worker. Long analyses currently run synchronously and should move to a durable queue before scaling.

## Current limitations and decisions

The local PostgreSQL 18 database and roles are provisioned, all migrations are applied, and runtime least-privilege/persistence checks passed. Docker Desktop Linux is running; the image builds, and isolated reference/weak implementation checks pass. The quality result is not yet persisted through the reviewer API. GitHub OAuth is unconfigured, so authenticated student, recruiter, college, and reviewer journeys remain unverified. Recruiter-triggered reassessment, cohort views, public passports and review workflows have code but no authenticated end-to-end results yet. LeetCode ownership proof is unsupported by the public lookup mechanism, so no ownership evidence is created. There is no LLM extraction integration, persistent job queue, rate limiter, or consent export/revocation flow.
