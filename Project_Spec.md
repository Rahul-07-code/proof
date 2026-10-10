# Instructions for the build agent

This document is the full specification for the Proof-of-Skill project. Build it phase by phase, in order. Do not start a later phase until the current phase is complete, persisted, and has error handling. Mark each task as [x] only after it is working end to end with real integrations and persisted data, not mocked. LLMs extract and interpret evidence; deterministic rules decide verdicts. Never fabricate assessment outcomes.

# Proof-of-Skill — Final consolidated project proposal

My recommendation is to consolidate everything into **one evidence-backed skill assessment platform**, rather than treating the additions as separate features.

The central idea is:

> Students should be able to substantiate their claimed skills with inspectable evidence, demonstrate their ability through practical assessments, and share credible results with recruiters—regardless of their professional network or educational background.

The strongest version of Proof-of-Skill is not a resume scorer. It is a system that connects claims to evidence, tests whether students can apply what they know, tracks new proof over time, and lets others inspect the results.

I would retain the multi-agent architecture as an implementation option, combine the six proposed additions with the earlier improvements, and add one final requirement: **assessment quality validation**. Without that, the platform can generate elaborate reports without knowing whether its verdicts are accurate.

## 1. The final product

*Visual direction: a professional evidence dashboard with clear status labels, source-linked findings, and assessment history.*

**Proof-of-Skill**

Evidence-backed developer assessment and skill development.

**For students:** Turn skill claims into demonstrable, inspectable evidence.

**For recruiters:** Inspect what a candidate has demonstrated, how it was assessed, and how recent the evidence is.

**For colleges:** Identify common skill gaps and measure assessment progress across a cohort.

### The end-to-end workflow

1. **Connect real sources:** GitHub OAuth, resume PDF, and optional verified public LeetCode profile.
2. **Extract skill claims:** Normalize technologies, concepts, and target-role requirements.
3. **Collect evidence:** Analyze code, tests, configuration, relevant history, and provenance.
4. **Apply verification rules:** Assign transparent statuses using versioned deterministic rules.
5. **Test practical ability:** Run a task with defined requirements, hidden tests, and a grading rubric.
6. **Close the skill gap:** Recommend a targeted learning task and reassess when new evidence exists.
7. **Share the result:** Generate a privacy-controlled passport that recruiters can inspect.

The whole platform revolves around a persistent evidence record. Every assessment and verdict must be traceable to its source, the rule used, and the time it was produced.

## 2. Final feature set

| Feature | Final decision | Status |
|---|---|---|
| Resume claim extractor | Build | [ ] |
| GitHub repository auditor | Build | [ ] |
| Evidence ledger with versioned rules | Build | [ ] |
| Repository originality and provenance checks | Build, with uncertainty labels | [ ] |
| Repo-specific practical challenges | Build a limited, validated version | [ ] |
| Adaptive follow-up questions | Build if time permits | [ ] |
| Delta verification and progress history | Build | [ ] |
| Evidence freshness tracking | Build; do not equate age with lost ability | [ ] |
| Shareable, revocable skill passport | Build | [ ] |
| Recruiter-triggered reassessment | Later phase | [ ] |
| LeetCode public-profile ownership verification | Optional, low-weight evidence | [ ] |
| College cohort dashboard | Later phase | [ ] |
| Process telemetry for cheating detection | Defer; do not automatically penalize students | [ ] |

One important constraint: a student's code attribution, a repository's originality, and a student's understanding are different things. The system must not treat any one of them as conclusive proof of the others.

## 3. The final scoring system

This is the most important part of the design. I would replace the ambiguous “62% verified” headline with a transparent scorecard that measures different things separately.

### A. Three cumulative evidence tiers

#### Tier 1 — Repository-supported

Relevant code, configuration, or tests support the claimed concept. Attribution and source limitations are disclosed.

#### Tier 2 — Practically demonstrated

The student has passed a relevant practical assessment under documented conditions. The result includes the rubric, test outcomes, and task version.

#### Tier 3 — Recently reassessed

The student has passed the required assessment recently, according to a published freshness policy. This indicates recent evidence, not a guarantee of future performance.

Freshness should also be stored as an independent field. If evidence becomes old, preserve the historical result and label it accordingly; do not silently rewrite a past pass into a failure.

### B. Calculate evidence coverage—not job readiness

For a particular target role, assign each claimed concept a documented importance weight \(w_i\).

For the headline score, count a concept as supported only when it meets the defined minimum evidence threshold.

$$
\text{Evidence Coverage} =
100 \times
\frac{\sum_i w_i \cdot I_i}
{\sum_i w_i}
$$

Where:

- \(w_i\) is the role-specific importance weight for concept \(i\).
- \(I_i=1\) when the claim meets the defined evidence threshold, otherwise \(I_i=0\).
- The denominator contains all eligible concepts in the selected claim set.

The threshold and concept set must be visible. Missing evidence should not be silently interpreted as lack of ability.

### C. Example scorecard

*Illustrative student profile—not a real assessment result.*

| Metric | Example result | Meaning |
|---|---:|---|
| Role-weighted evidence coverage | 62% | Claimed concepts meeting the evidence threshold |
| Practical assessment | 3 / 4 | Eligible assessment tasks passed |

#### Evidence distribution

| Evidence category | Percentage |
|---|---:|
| Tier 1 only | 40% |
| Tier 2 or Tier 3 | 22% |
| Below evidence threshold | 38% |

The numbers are intentionally separate. Evidence coverage describes the selected claims. Assessment results describe performance on completed tasks. Neither is a universal measure of a candidate's worth or job readiness.

For simplicity, this example assumes the same denominator and no overlapping weights. The actual interface should calculate weighted coverage from individual concept records.

### D. Make score changes auditable

A score should change only when a relevant event causes the evidence rules to be reevaluated, such as:

- A new relevant implementation is found.
- A required test passes or fails.
- A practical assessment is completed.
- An authorized repository is disconnected or evidence is withdrawn.
- A published freshness policy changes the current evidence label.

Every change should record the previous verdict, new verdict, reason, rule version, and evidence references.

The LLM extracts and interprets evidence; the verification service applies deterministic rules. This separation is mandatory for explainability and reproducibility.

## 4. The final addition: assessment calibration and quality control

This is the one new capability I would add beyond the features already decided.

Why? Because a system that can generate assessments and grade answers is not necessarily a system that can assess skills accurately.

Build a small **assessment quality-control layer** that checks whether your assessments are valid, consistent, and appropriate for the skill being measured.

### What it does

1. Tests each task against a known reference implementation.
2. Tests deliberately incorrect implementations to identify weak tests.
3. Checks that the task actually measures the intended concept.
4. Records task versions, test outcomes, rubric versions, and grading results.
5. Supports human review of disputed or borderline results.
6. Compares automated results against human-reviewed assessments on a controlled sample.

For example, if a task claims to measure API error handling, but all its tests pass even when error handling is removed, the task is not suitable for assessing that skill.

This feature does not guarantee fairness or validity. It creates the mechanism needed to detect and improve assessment quality.

**Why this addition matters:** Your product's long-term credibility depends less on how many agents it uses and more on whether its evidence and assessments mean what you say they mean.

## 5. Final architecture

### Student and recruiter interfaces

Dashboard · Assessment workspace · Skill passport

### Application API and authentication

Permissions · Consent · Rate limits · Job submission

### Analysis workflows

Claim extraction, code analysis, gap planning, adaptive questions.

### Verification service

Versioned rules, thresholds, scoring, verdict history.

### Assessment workers

Isolated execution, hidden tests, reference solutions.

### Quality control

Task validation, human review, assessment audit.

### PostgreSQL evidence ledger

Claims · Sources · Rules · Assessments · Verdicts · Sharing permissions · Audit history

Recommended stack:

- **Frontend:** Next.js, TypeScript.
- **Backend:** FastAPI or a structured Next.js API.
- **Database:** PostgreSQL; add `pgvector` only if semantic retrieval warrants it.
- **Workflow orchestration:** LangGraph for genuinely conditional, stateful workflows.
- **Code analysis:** Language-specific static analysis plus LLM interpretation.
- **Assessment execution:** A hardened sandbox with restricted networking, resource limits, and ephemeral environments.
- **Background jobs:** A persistent queue with retries and idempotent processing.
- **Integrations:** GitHub OAuth first, resume PDF upload second, optional public LeetCode ownership verification later.

The eight original agents can remain as logical roles, but they do not all need to be autonomous processes. The verifier and quality-control service should retain clear control over their outputs.

## 6. What to build first

The project must be a working system with real integrations and persisted results—not a mockup that simulates verification.

### Implementation checklist

#### Phase 1 — Real evidence pipeline (P0)

- [ ] GitHub OAuth and repository selection
- [ ] Resume PDF extraction
- [ ] Evidence ledger and deterministic verifier
- [ ] File-level evidence links and provenance

#### Phase 2 — Practical verification (P0)

- [ ] One supported language
- [ ] Validated challenge templates
- [ ] Sandboxed hidden-test execution
- [ ] Persistent assessment results and rubric

#### Phase 3 — Student product (P1)

- [ ] Role-specific gap planner
- [ ] New-evidence verification
- [ ] Assessment history
- [ ] Shareable, revocable skill passport

#### Phase 4 — Validation and expansion (P1)

- [ ] Assessment quality-control suite
- [ ] Human-reviewed accuracy evaluation
- [ ] Adaptive follow-up questions
- [ ] Optional LeetCode ownership verification

Do not begin by building every integration and agent simultaneously. Finish the first complete user journey, including actual persistence and error handling, before expanding the scope.

## 7. The final three-minute presentation

| Timestamp | Duration | Presentation segment |
|---|---|---|
| 0:00 | 30 seconds | **The problem:** Show a student who claims a skill but lacks credible evidence. Explain why resumes alone do not establish practical ability. |
| 0:30 | 40 seconds | **Evidence and provenance:** Connect a real repository, inspect a skill claim, and show the actual files, tests, and limitations supporting the verdict. |
| 1:10 | 60 seconds | **Practical assessment:** Run a real challenge, show test results, and explain how the rubric evaluates the targeted skill. |
| 2:10 | 25 seconds | **Verification and improvement:** Show the saved assessment result, updated evidence status, and a targeted next step. Do not award points merely for a commit. |
| 2:35 | 25 seconds | **Recruiter passport:** Open the real shareable report and inspect the assessment date, evidence, rubric, and limitations. |

Use prepared accounts and a prepared repository to keep the presentation within three minutes, but ensure the important analysis and assessment results are genuine. A prepared starting state is fine; fabricated outcomes are not.

## 8. Final scorecard

These are subjective estimates of the consolidated proposal, not actual test results.

| Criterion | Final target |
|---|---:|
| Problem significance | 9/10 |
| Technical depth | 9/10 |
| Differentiation | 8.5/10 |
| Verification credibility | 9/10 |
| Real-world utility | 9/10 |
| Feasibility of the scoped MVP | 8/10 |
| Security and privacy design | 8.5/10 |
| Business potential | 7.5/10 |

### Overall proposal rating

**8.6 / 10**

The rounded arithmetic mean of the eight ratings above is 8.6/10.

**Potential after successful implementation and validation: 9/10.**

That higher rating is conditional on working integrations, secure assessment execution, credible assessment results, and evidence that users find the product useful. It is not guaranteed by the feature list.

## Final decision

Build Proof-of-Skill around four pillars:

1. **Evidence:** Every claim links to inspectable, traceable sources.
2. **Assessment:** Students demonstrate skills through practical work, not repository activity alone.
3. **Progress:** New evidence updates the student's record under transparent rules.
4. **Trust:** Recruiters can inspect the evidence, assessment conditions, and limitations.

The assessment quality-control layer is the final addition I would insist on. It makes the rest of the system more credible.

The key is not to claim that Proof-of-Skill can prove everything. It is to make a narrower claim—and substantiate it: **the platform provides transparent, inspectable evidence of what a student has demonstrated, under specified assessment conditions.**

That is a meaningful product, a technically defensible project, and a stronger foundation for real-world use than a multi-agent resume scoring dashboard.