'use client';

import { useEffect, useState } from 'react';

type Candidate = {
  available: boolean;
  reason?: string;
  targetRole?: string;
  evidenceCoverage?: number | null;
  claims?: Array<{ concept?: string; targetRole?: string; tier?: string; importanceWeight?: number; sources?: Array<{ kind: string; sourceRef: string }> }>;
  assessments?: Array<{ challenge_id: string; challenge_version: string; status: string; automated_score: number | null; human_decision: string | null; adjusted_score: number | null; submitted_at: string; rubric: unknown; outcomes: unknown }>;
  limitations?: string[];
  reassessmentAllowed?: boolean;
};

export default function Recruiter() {
  const [tokens, setTokens] = useState(['', '']);
  const [role, setRole] = useState('software-developer');
  const [result, setResult] = useState<Candidate[] | null>(null);
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch('/api/me').then(response => response.json()).then(profile => setAllowed(profile.roles?.includes('recruiter') === true)).catch(() => setAllowed(false)); }, []);
  const updateToken = (index: number, value: string) => setTokens(current => current.map((token, i) => i === index ? value : token));
  const request = async (path: string, body: unknown, comparison = false) => {
    setBusy(true);
    setMessage('Working…');
    if (comparison) setResult(null);
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
      if (comparison) setResult(data.results);
      setMessage(comparison ? 'Shared candidate records loaded.' : 'Reassessment request sent. The candidate must accept before starting.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Request failed.'); }
    finally { setBusy(false); }
  };

  return <main>
    <nav><a className="brand" href="/">Proof-of-Skill</a><a className="link" href="/">Workspace</a></nav>
    <section className="workspace"><div className="eyebrow">RECRUITER WORKSPACE</div><h2>Inspect disclosed evidence</h2>
      {allowed === null ? <p>Checking recruiter access…</p> : !allowed ? <p role="alert">Access denied. Sign in with an account assigned the recruiter role.</p> : <>
        <p>Compare candidates for a target role using only the fields included in their active passports. This is not a ranking or job-readiness score.</p>
        <label>Target role<input value={role} minLength={2} maxLength={100} onChange={event => setRole(event.target.value)} /></label>
        {tokens.map((token, index) => <label key={index}>Candidate passport token<input value={token} onChange={event => updateToken(index, event.target.value)} autoComplete="off" /></label>)}
        {tokens.length < 5 && <button type="button" className="quiet" onClick={() => setTokens(current => [...current, ''])}>Add candidate</button>}
        <div className="actions"><button className="button" disabled={busy || tokens.filter(Boolean).length < 2 || role.trim().length < 2} onClick={() => void request('/api/recruiter/compare', { tokens: tokens.filter(Boolean), targetRole: role }, true)}>Compare shared records</button></div>
        <h3>Request a reassessment</h3><p>A request can be sent only if the candidate enabled this passport permission. The candidate must accept first.</p>
        <label>Candidate passport token<input value={tokens[0]} onChange={event => updateToken(0, event.target.value)} autoComplete="off" /></label>
        <label>Reason (at least 10 characters)<textarea value={reason} minLength={10} maxLength={1000} onChange={event => setReason(event.target.value)} /></label>
        <button className="quiet" disabled={busy || !tokens[0] || reason.trim().length < 10} onClick={() => void request('/api/recruiter/reassessment', { token: tokens[0], challengeId: 'python-string-tools', reason })}>Send reassessment request</button>
      </>}
      {message && <p role="status" aria-live="polite">{message}</p>}
      {result && <section aria-label="Candidate comparison"><h3>Shared records</h3><div className="grid">{result.map((candidate, index) => <article className="card" key={index}>
        <h3>Candidate {index + 1}</h3>
        {!candidate.available ? <p role="status">{candidate.reason}</p> : <>
          <span>Role view: {candidate.targetRole ?? role}</span>
          {candidate.evidenceCoverage !== undefined && candidate.evidenceCoverage !== null && <span>Disclosed evidence coverage: {candidate.evidenceCoverage}%</span>}
          {candidate.claims && <section><h4>Claims and evidence</h4>{candidate.claims.length === 0 ? <p>No claims were shared for this role.</p> : candidate.claims.map((claim, claimIndex) => <article className="notice" key={`${claim.concept}-${claimIndex}`}><b>{claim.concept ?? 'Claim details withheld'}</b>{claim.targetRole && <span> · {claim.targetRole}</span>}{claim.tier && <span> · {claim.tier}</span>}{claim.importanceWeight !== undefined && <span> · weight {claim.importanceWeight}</span>}{claim.sources?.map((source, sourceIndex) => <p key={sourceIndex}><a href={source.sourceRef} target="_blank" rel="noreferrer">{source.kind} source ↗</a></p>)}</article>)}</section>}
          {candidate.assessments && <section><h4>Assessment results</h4>{candidate.assessments.length === 0 ? <p>No assessment results were shared.</p> : candidate.assessments.map((assessment, assessmentIndex) => <article className="notice" key={`${assessment.challenge_id}-${assessmentIndex}`}><b>{assessment.challenge_id} · version {assessment.challenge_version}</b><span>Automated score: {assessment.automated_score ?? 'not scored'} · {assessment.status}</span>{assessment.human_decision && <span>Human review: {assessment.human_decision}{assessment.adjusted_score === null ? '' : ` · adjusted score ${assessment.adjusted_score}`}</span>}<details><summary>Rubric and test outcomes</summary><pre className="result">{JSON.stringify({ rubric: assessment.rubric, outcomes: assessment.outcomes }, null, 2)}</pre></details></article>)}</section>}
          {candidate.limitations && <section><h4>Limitations</h4><ul>{candidate.limitations.map(item => <li key={item}>{item}</li>)}</ul></section>}
          <p>{candidate.reassessmentAllowed ? 'This passport accepts reassessment requests.' : 'Reassessment requests are not enabled for this passport.'}</p>
        </>}
      </article>)}</div></section>}
    </section>
  </main>;
}
