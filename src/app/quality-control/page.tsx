'use client';

import { useCallback, useEffect, useState } from 'react';

export default function QualityControl() {
  const [output, setOutput] = useState('');
  const [reviews, setReviews] = useState<any[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [adjustedScores, setAdjustedScores] = useState<Record<string, string>>({});

  const call = useCallback(async (url: string, method = 'GET', body?: unknown) => {
    const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status}).`);
    return result;
  }, []);
  const refresh = useCallback(async () => {
    try { setReviews(await call('/api/reviews')); }
    catch (error) { setOutput(error instanceof Error ? error.message : 'Unable to load the review queue.'); }
  }, [call]);
  useEffect(() => {
    fetch('/api/me').then(response => response.json()).then(async profile => {
      const reviewer = profile.roles?.includes('reviewer') === true;
      setAllowed(reviewer);
      if (reviewer) await refresh();
    }).catch(() => setAllowed(false));
  }, [refresh]);

  const runValidation = async () => {
    setBusy(true);
    setOutput('Running restricted challenge validation…');
    try {
      const report = await call('/api/quality-control', 'POST');
      setOutput(JSON.stringify(report, null, 2));
    } catch (error) { setOutput(error instanceof Error ? error.message : 'Validation failed.'); }
    finally { setBusy(false); }
  };
  const viewReport = async () => {
    setBusy(true);
    try { setOutput(JSON.stringify(await call('/api/quality-control'), null, 2)); }
    catch (error) { setOutput(error instanceof Error ? error.message : 'Report unavailable.'); }
    finally { setBusy(false); }
  };
  const decide = async (id: string, decision: 'uphold' | 'adjust' | 'inconclusive') => {
    setBusy(true);
    try {
      const adjustedScore = adjustedScores[id] === undefined ? undefined : Number(adjustedScores[id]);
      const result = await call('/api/reviews', 'PATCH', { id, decision, notes: notes[id] ?? '', ...(decision === 'adjust' ? { adjustedScore } : {}) });
      setOutput(`Review recorded. Automated score ${result.automatedScore}; decision ${result.humanDecision}${result.adjustedScore === null ? '' : `; human-adjusted score ${result.adjustedScore}`}.`);
      await refresh();
    } catch (error) { setOutput(error instanceof Error ? error.message : 'Unable to save review.'); }
    finally { setBusy(false); }
  };

  const openReviews = reviews.filter(review => !review.completed_at);
  return <main>
    <nav><a className="brand" href="/">Proof-of-Skill</a><a className="link" href="/">Workspace</a></nav>
    <section className="workspace"><div className="eyebrow">ASSESSMENT QUALITY</div><h2>Challenge validation and human review</h2>
      {allowed === null ? <p>Checking reviewer access…</p> : !allowed ? <p role="alert">Access denied. Reviewer authorization is required.</p> : <>
        <p>Validation runs reference and deliberately weak submissions in restricted containers. Human decisions and any adjusted score are stored separately from the automated result.</p>
        <div className="actions"><button className="button" disabled={busy} onClick={() => void runValidation()}>Run challenge validation</button><button className="quiet" disabled={busy} onClick={() => void viewReport()}>View quality report</button><button className="quiet" disabled={busy} onClick={() => void refresh()}>Refresh review queue</button></div>
        <h3>Open review queue</h3>{openReviews.length === 0 ? <p>No open reviews.</p> : openReviews.map(review => <article className="card" key={review.id}>
          <b>{review.candidate ?? 'Candidate'} · {review.challenge_id}</b><span>Automated score: {review.score ?? 'pending'} · requested {new Date(review.created_at).toLocaleString()}</span><p>{review.reason}</p>
          <label>Reviewer notes (at least 5 characters)<textarea value={notes[review.id] ?? ''} minLength={5} maxLength={2000} onChange={event => setNotes({ ...notes, [review.id]: event.target.value })} /></label>
          <label>Human-adjusted score (0–100; required only for “adjust”)<input type="number" min="0" max="100" step="1" value={adjustedScores[review.id] ?? ''} onChange={event => setAdjustedScores({ ...adjustedScores, [review.id]: event.target.value })} /></label>
          <div className="actions">{(['uphold', 'adjust', 'inconclusive'] as const).map(decision => <button key={decision} className="quiet" disabled={busy || (notes[review.id] ?? '').trim().length < 5 || (decision === 'adjust' && (!(adjustedScores[review.id] ?? '').trim() || !Number.isInteger(Number(adjustedScores[review.id])) || Number(adjustedScores[review.id]) < 0 || Number(adjustedScores[review.id]) > 100))} onClick={() => void decide(review.id, decision)}>{decision}</button>)}</div>
        </article>)}
      </>}
      {output && <pre role="status" aria-live="polite" className="result">{output}</pre>}
    </section>
  </main>;
}
