'use client';

import { FormEvent, useEffect, useState } from 'react';

type Repository = { id: number; name: string; private: boolean; defaultBranch: string; selected: boolean; isFork?: boolean; parentFullName?: string | null };
type Claim = { id: string; concept: string; target_role: string; importance_weight: number; tier: string; freshness: { status: string }; evidence: Array<{ id: string; kind: string; source_ref: string; confidence: number; observed_at: string; provenance: Record<string, unknown> }> };
type WorkspaceProps = { kind: 'repos' | 'resume' | 'assessment' | 'progress' | 'passport' | 'gaps'; requestId?: string };
const tierLabels: Record<string, string> = { repository_supported: 'Repository supported', practically_demonstrated: 'Practically demonstrated', recently_reassessed: 'Recently reassessed', below_threshold: 'Evidence not yet available' };
const passportChoices = [['claims', 'Skill claims'], ['tiers', 'Verification tiers'], ['sources', 'Evidence sources'], ['assessments', 'Assessment results'], ['limitations', 'Assessment limitations'], ['reassessment', 'Allow reassessment requests']];

export default function Workspace({ kind, requestId }: WorkspaceProps) {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [challengeReady, setChallengeReady] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [assessmentResult, setAssessmentResult] = useState<any>(null);
  const [code, setCode] = useState('def normalize_words(text):\n    words = text.lower().split()\n    return ["".join(ch for ch in word if ch.isalnum()) for word in words if "".join(ch for ch in word if ch.isalnum())]\n');
  const [assessmentId, setAssessmentId] = useState('');
  const [claimId, setClaimId] = useState('');
  const [reason, setReason] = useState('');
  const [followup, setFollowup] = useState<any>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [weight, setWeight] = useState<number | null>(null);
  const [targetRole, setTargetRole] = useState('');
  const [passportFields, setPassportFields] = useState(['claims', 'tiers', 'assessments', 'limitations']);
  const [expiryDays, setExpiryDays] = useState('');
  const [passportUrl, setPassportUrl] = useState('');

  const call = async (url: string, body?: any, method = 'GET') => {
    const response = await fetch(url, { method, headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status}).`);
    return result;
  };
  const refreshProgress = async (role = selectedRole) => {
    const result = await call(`/api/progress${role ? `?role=${encodeURIComponent(role)}` : ''}`);
    setData(result);
    setSelectedRole(role);
    setStatus('Evidence history loaded.');
  };
  useEffect(() => {
    let active = true;
    const url = kind === 'repos' ? '/api/github/repos' : kind === 'progress' ? '/api/progress' : kind === 'passport' ? '/api/passport' : kind === 'assessment' ? '/api/assessment' : kind === 'gaps' ? '/api/gaps' : '';
    if (!url) return;
    setLoading(true);
    call(url).then(result => {
      if (!active) return;
      setData(result);
      if (kind === 'progress') setSelectedRole(result.selectedRole ?? '');
      if (kind === 'assessment') setChallengeReady(result?.[0]?.qualityStatus === 'validated');
    }).catch(error => { if (active) setStatus(error instanceof Error ? error.message : 'Unable to load this workspace.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind]);
  const run = async (action: () => Promise<any>, success: string, refresh?: () => Promise<any>) => {
    setLoading(true);
    setStatus('Working…');
    try {
      const result = await action();
      const updated = refresh ? await refresh() : result;
      if (updated !== undefined) setData(updated);
      setStatus(success);
      return result;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Request failed.');
      return null;
    } finally { setLoading(false); }
  };
  const title: Record<WorkspaceProps['kind'], string> = { repos: 'GitHub repositories', resume: 'Resume claims', assessment: 'Practical assessment', progress: 'Evidence and assessment history', passport: 'Shareable skill passport', gaps: 'Skill gap planner' };
  const submitResume = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => call('/api/resume', form, 'POST'), 'Resume parsed; extracted claims are self-reported.'); };

  return <main>
    <nav><a className="brand" href="/">Proof-of-Skill</a><a className="link" href="/">Workspace</a></nav>
    <section className="workspace">
      <div className="eyebrow">{kind.toUpperCase()}</div><h2>{title[kind]}</h2>

      {kind === 'repos' && <>
        <p>Choose repositories you authorize us to inspect. Analysis fetches files and recent commit attribution signals; neither establishes authorship or understanding.</p>
        <button className="button" disabled={loading} onClick={() => void run(() => call('/api/github/repos'), 'Repository list refreshed.')}>Refresh repositories</button>
        {!loading && !Array.isArray(data) && <p role="status">{status || 'Connect GitHub to load your repositories.'}</p>}
        <div className="grid">{(Array.isArray(data) ? data : []).map((repo: Repository) => <label className="card" key={repo.id}>
          <span><input type="checkbox" checked={repo.selected} onChange={event => setData(data.map((item: Repository) => item.id === repo.id ? { ...item, selected: event.target.checked } : item))} /> {repo.name} {repo.private ? '(private)' : ''} {repo.isFork ? '· Fork' : ''}</span>
          {repo.parentFullName && <small>Forked from {repo.parentFullName}</small>}
        </label>)}</div>
        {Array.isArray(data) && data.length === 0 && <p>No accessible repositories found.</p>}
        <button className="button" disabled={loading || !Array.isArray(data)} onClick={() => void run(async () => {
          await call('/api/github/repos', { repositories: data.filter((repo: Repository) => repo.selected) }, 'POST');
          setAnalysisResult(await call('/api/github/analyze', {}, 'POST'));
          return call('/api/github/repos');
        }, 'Repository selection and analysis completed.')}>Save selection and analyze</button>
        {analysisResult && <article className="card"><b>Repository analysis saved</b><span>{analysisResult.repositories} repositories · {analysisResult.signals} evidence signals · {analysisResult.provenanceCommits} commits examined · {analysisResult.identicalFileMatches} exact file matches</span><p>{analysisResult.limitations}</p>{analysisResult.repoProvenance?.map((item: any) => <p key={item.repository}>{item.repository}: {item.commitsMatchingAuthenticatedLogin} commits associated with your GitHub login out of {item.commitsExamined}. {item.note}</p>)}</article>}
      </>}

      {kind === 'resume' && <>
        <form onSubmit={submitResume}><p>We parse the PDF in memory. Extracted skill terms are self-reported until corroborated. Avoid uploading sensitive personal details.</p><label>Resume PDF<input name="file" type="file" accept="application/pdf" required /></label><button className="button" disabled={loading}>Extract claims</button></form>
        {data?.claims && <section><h3>Extracted claims</h3><p>{data.limitations}</p><div className="grid">{data.claims.map((claim: any) => <article className="card" key={claim.evidenceId}><b>{claim.concept}</b><span>Self-reported · awaiting corroboration</span></article>)}</div>{data.claims.length === 0 && <p>No supported skill terms were extracted from this document.</p>}</section>}
      </>}

      {kind === 'assessment' && <>
        <p>Python challenge: normalize words. Hidden cases run one per fresh restricted container. A reviewer must validate the task before submissions become available. {requestId ? 'This submission is linked to your accepted recruiter request.' : ''}</p>
        <label>Python submission<textarea aria-label="Python assessment submission" value={code} onChange={event => setCode(event.target.value)} rows={14} spellCheck={false} /></label>
        <button className="button" disabled={loading || !challengeReady} title={!challengeReady ? 'Challenge quality validation is required first.' : undefined} onClick={() => void run(async () => { const result = await call('/api/assessment', { challengeId: 'python-string-tools', code, ...(requestId ? { requestId } : {}) }, 'POST'); setAssessmentResult(result); return result; }, 'Assessment result saved.')}>Submit assessment</button>
        {!challengeReady && <p>Unavailable: task status is {data?.[0]?.qualityStatus ?? 'loading'}; an authorized reviewer must persist quality validation first.</p>}
        {assessmentResult?.score !== undefined && <article className="card"><b>Actual result: {assessmentResult.outcome.passed}/{assessmentResult.outcome.total} hidden tests passed · score {assessmentResult.score}</b><span>Challenge version {assessmentResult.challengeVersion}. Results describe this task only.</span></article>}
      </>}

      {kind === 'passport' && <>
        <p>Choose exactly what the recipient can inspect. The secret share URL is shown once. Active passports can be revoked at any time.</p>
        <fieldset><legend>Included information</legend>{passportChoices.map(([value, label]) => <label key={value}><input type="checkbox" checked={passportFields.includes(value)} onChange={event => setPassportFields(event.target.checked ? [...passportFields, value] : passportFields.filter(item => item !== value))} /> {label}</label>)}</fieldset>
        <label>Expires after (optional, 1–365 days)<input type="number" min="1" max="365" value={expiryDays} onChange={event => setExpiryDays(event.target.value)} /></label>
        <button className="button" disabled={loading || passportFields.length === 0 || (expiryDays !== '' && (!Number.isInteger(Number(expiryDays)) || Number(expiryDays) < 1 || Number(expiryDays) > 365))} onClick={() => void run(async () => { const created = await call('/api/passport', { fields: passportFields, ...(expiryDays ? { expiresInDays: Number(expiryDays) } : {}) }, 'POST'); setPassportUrl(created.url); return call('/api/passport'); }, 'Passport created. Copy the secret URL now; it cannot be recovered later.')}>Create passport</button>
        {passportUrl && <label>New share URL — copy now<input readOnly value={passportUrl} onFocus={event => event.currentTarget.select()} /></label>}
        {Array.isArray(data) && data.length === 0 && <p>No passports created yet.</p>}
        {Array.isArray(data) && data.map((passport: any) => <article className="card" key={passport.id}><b>{passport.revoked_at ? 'Revoked' : 'Active passport'}</b><span>Created {new Date(passport.created_at).toLocaleString()} · {passport.expires_at ? `expires ${new Date(passport.expires_at).toLocaleString()}` : 'no expiry'}</span><span>Shared fields: {(passport.fields ?? []).join(', ')}</span>{!passport.revoked_at && <button className="quiet" disabled={loading} onClick={() => void run(async () => { await call('/api/passport/revoke', { id: passport.id }, 'POST'); return call('/api/passport'); }, 'Passport access revoked.')}>Revoke access</button>}</article>)}
      </>}

      {kind === 'gaps' && <>
        <p>Recommendations address missing evidence. Missing evidence is not a finding of inability.</p>
        <button className="button" disabled={loading} onClick={() => void run(() => call('/api/gaps'), 'Recommendations refreshed.')}>Update recommendations</button>
        {data?.plans?.length === 0 && <p>No learning plans are recorded for the current evidence.</p>}
        {data?.plans?.map((plan: any) => <article className="card" key={plan.id}><p>{plan.recommendation}</p><label>Progress<select value={plan.status} disabled={loading} onChange={event => void run(async () => { await call('/api/gaps', { id: plan.id, status: event.target.value }, 'PATCH'); return call('/api/gaps'); }, 'Plan status updated.')}><option value="open">Open</option><option value="in_progress">In progress</option><option value="complete">Complete</option></select></label>{plan.completed_at && <span>Completed {new Date(plan.completed_at).toLocaleDateString()}</span>}</article>)}
      </>}

      {kind === 'progress' && <>
        <label>Target role<select value={selectedRole} onChange={event => void refreshProgress(event.target.value)}><option value="">All roles</option>{data?.roles?.map((role: string) => <option key={role}>{role}</option>)}</select></label>
        {data ? <p>Weighted evidence coverage for this claim set: <b>{Number(data.coverage).toFixed(1)}%</b>. This is not job readiness. Freshness is shown separately from historical tier.</p> : <p role="status">{status || 'Loading evidence history…'}</p>}
        <button className="button" disabled={loading} onClick={() => void refreshProgress()}>Refresh history</button>
        {data?.claims?.length === 0 && <p>No claims for this role yet. Upload a resume or analyze selected repositories.</p>}
        <div className="grid">{data?.claims?.map((claim: Claim) => <article className="card" key={claim.id}>
          <b>{claim.concept}</b><span>{tierLabels[claim.tier] ?? claim.tier} · Evidence freshness: {claim.freshness.status}</span><span>Role: {claim.target_role} · Weight: {claim.importance_weight}</span>
          <details onToggle={event => { if (event.currentTarget.open) { setTargetRole(claim.target_role); setWeight(claim.importance_weight); } }}><summary>Update role and importance</summary><form onSubmit={event => { event.preventDefault(); void run(async () => { await call(`/api/claims/${claim.id}`, { targetRole: targetRole || claim.target_role, importanceWeight: weight ?? claim.importance_weight }, 'PATCH'); return call(`/api/progress${selectedRole ? `?role=${encodeURIComponent(selectedRole)}` : ''}`); }, 'Role and weight updated; a new verdict was recorded.'); }}><label>Target role<input required minLength={2} maxLength={100} value={targetRole || claim.target_role} onChange={event => setTargetRole(event.target.value)} /></label><label>Importance weight<input required type="number" min="0.01" max="100" step="0.01" value={weight ?? claim.importance_weight} onChange={event => setWeight(Number(event.target.value))} /></label><button className="quiet" disabled={loading}>Save weighting</button></form></details>
          <h3>Source evidence</h3>{claim.evidence.length === 0 ? <p>No active evidence.</p> : <ul>{claim.evidence.map(item => <li key={item.id}><a href={item.source_ref} target="_blank" rel="noreferrer">{item.kind} source ↗</a> · observed {new Date(item.observed_at).toLocaleDateString()} · confidence {Number(item.confidence).toFixed(2)}</li>)}</ul>}
        </article>)}</div>
        {data?.assessments?.length > 0 && <><h3>Request a human review</h3><label>Assessment<select value={assessmentId} onChange={event => setAssessmentId(event.target.value)}><option value="">Choose assessment</option>{data.assessments.map((item: any) => <option key={item.id} value={item.id}>{item.challenge_id} · {item.status} · score {item.score ?? 'pending'}</option>)}</select></label><label>Review reason<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={1000} /></label><button className="button" disabled={loading || !assessmentId || reason.trim().length < 10} onClick={() => void run(() => call('/api/reviews', { assessmentId, reason }, 'POST'), 'Review request submitted.', async () => undefined)}>Request review</button></>}
        {data?.claims?.length > 0 && <><h3>Adaptive follow-up questions</h3><label>Skill claim<select value={claimId} onChange={event => setClaimId(event.target.value)}><option value="">Choose a claim</option>{data.claims.map((claim: Claim) => <option key={claim.id} value={claim.id}>{claim.concept}</option>)}</select></label><button className="quiet" disabled={loading || !claimId} onClick={() => void run(async () => { const result = await call('/api/followups', { claimId }, 'POST'); setFollowup(result); setAnswers(result.questions.map(() => '')); return undefined; }, 'Follow-up questions created.')}>Generate questions</button>{followup?.questions?.map((question: string, index: number) => <label className="card" key={index}>{question}<textarea value={answers[index] ?? ''} onChange={event => setAnswers(answers.map((answer, i) => i === index ? event.target.value : answer))} /></label>)}{followup && <button className="button" disabled={loading || answers.some(answer => !answer.trim())} onClick={() => void run(() => call('/api/followups', { id: followup.id, answers }, 'PATCH'), 'Answers saved as self-reported information; evidence score is unchanged.', async () => undefined)}>Save answers</button>}</>}
        {data?.history?.length > 0 && <section><h3>Verdict history</h3><div className="grid">{data.history.map((entry: any) => <article className="card" key={entry.id}><b>{entry.concept ?? 'Claim'} · {tierLabels[entry.tier] ?? entry.tier}</b><span>{entry.rule_id} · {new Date(entry.created_at).toLocaleString()}</span><p>{entry.reason}</p><span>{(entry.evidence_refs ?? []).length} source reference(s)</span></article>)}</div></section>}
        {data?.assessments?.length > 0 && <section><h3>Assessment history</h3><div className="grid">{data.assessments.map((entry: any) => <article className="card" key={entry.id}><b>{entry.challenge_id} · v{entry.challenge_version}</b><span>{entry.status} · score {entry.score ?? 'pending'} · submitted {new Date(entry.submitted_at).toLocaleString()}</span></article>)}</div></section>}
        {data?.reviews?.length > 0 && <section><h3>Human review history</h3><div className="grid">{data.reviews.map((entry: any) => <article className="card" key={entry.id}><b>{entry.challenge_id} · {entry.decision ?? 'review pending'}</b><span>Automated score: {entry.automated_score ?? 'pending'}{entry.adjusted_score === null ? '' : ` · human-adjusted score: ${entry.adjusted_score}`}</span>{entry.notes && <p>{entry.notes}</p>}<span>{entry.completed_at ? new Date(entry.completed_at).toLocaleString() : `Requested ${new Date(entry.created_at).toLocaleString()}`}</span></article>)}</div></section>}
      </>}

      <p role="status" aria-live="polite">{status}</p>
    </section>
  </main>;
}
