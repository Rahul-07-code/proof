export const RULE_VERSION = 'evidence-v1.0.0';
export type Tier = 'below_threshold' | 'repository_supported' | 'practically_demonstrated' | 'recently_reassessed';
export type Evidence = { kind: 'repository'|'assessment'|'resume'|'leetcode'; confidence: number; createdAt: string; passed?: boolean; ref?: string };
export function tierFor(evidence: Evidence[], now = new Date()): Tier {
  const repo = evidence.some(e => e.kind === 'repository' && e.confidence >= 0.65);
  const assessment = evidence.filter(e => e.kind === 'assessment' && e.passed).sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (assessment && now.getTime() - new Date(assessment.createdAt).getTime() <= 90*86400000) return 'recently_reassessed';
  if (assessment) return 'practically_demonstrated';
  return repo ? 'repository_supported' : 'below_threshold';
}
export function freshnessFor(evidence: Evidence[], now = new Date()) {
  const assessment=evidence.filter(e=>e.kind==='assessment'&&e.passed).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  if(!assessment)return {status:'not_reassessed' as const,lastAssessmentAt:null,policyDays:90};
  const recent=now.getTime()-new Date(assessment.createdAt).getTime()<=90*86400000;
  return {status:recent?'fresh' as const:'stale' as const,lastAssessmentAt:assessment.createdAt,policyDays:90};
}
export function weightedCoverage(claims: Array<{ weight: number; evidence: Evidence[] }>) {
  const eligible = claims.filter(c => Number.isFinite(c.weight) && c.weight > 0);
  const denominator = eligible.reduce((s,c) => s+c.weight, 0);
  return denominator ? 100 * eligible.reduce((s,c) => s + (tierFor(c.evidence) !== 'below_threshold' ? c.weight : 0),0)/denominator : 0;
}
export function verdict(evidence: Evidence[]) { return { tier: tierFor(evidence), ruleVersion: RULE_VERSION, evidenceRefs: evidence.map(e=>e.ref).filter(Boolean) }; }
