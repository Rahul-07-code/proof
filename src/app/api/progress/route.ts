import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { weightedCoverage, tierFor, freshnessFor } from '@/lib/verification';

export async function GET(req: Request) {
  try {
    const user=await requireUser(),role=new URL(req.url).searchParams.get('role');
    const roles=await db.query('SELECT DISTINCT target_role FROM claims WHERE user_id=$1 ORDER BY target_role',[user]);
    const claims=await db.query('SELECT id,concept,target_role,importance_weight,created_at FROM claims WHERE user_id=$1 AND ($2::text IS NULL OR target_role=$2) ORDER BY created_at DESC',[user,role]);
    const output=[];
    for(const claim of claims.rows){
      const rows=await db.query('SELECT id,kind,source_ref,confidence,observed_at,provenance FROM evidence WHERE claim_id=$1 AND withdrawn_at IS NULL ORDER BY observed_at',[claim.id]);
      const evidence=rows.rows.map(row=>({kind:row.kind,confidence:Number(row.confidence),createdAt:row.observed_at.toISOString(),passed:row.kind==='assessment'&&Number(row.confidence)>=1,ref:row.id}));
      output.push({...claim,importance_weight:Number(claim.importance_weight),evidence:rows.rows,tier:tierFor(evidence),freshness:freshnessFor(evidence)});
    }
    const assessments=await db.query('SELECT id,challenge_id,challenge_version,status,score,outcomes,submitted_at,completed_at FROM assessments WHERE user_id=$1 ORDER BY submitted_at DESC',[user]);
    const coverage=weightedCoverage(output.map(claim=>({weight:claim.importance_weight,evidence:claim.evidence.map((item:any)=>({kind:item.kind,confidence:Number(item.confidence),createdAt:item.observed_at.toISOString(),passed:item.kind==='assessment'&&Number(item.confidence)>=1,ref:item.id}))})));
    const history=await db.query('SELECT v.id,v.claim_id,c.concept,v.tier,v.rule_id,v.reason,v.evidence_refs,v.created_at FROM verdicts v LEFT JOIN claims c ON c.id=v.claim_id WHERE v.user_id=$1 ORDER BY v.created_at DESC LIMIT 100',[user]);
    const reviews=await db.query('SELECT r.id,r.assessment_id,r.reason,r.decision,r.notes,r.adjusted_score,r.created_at,r.completed_at,a.challenge_id,a.score AS automated_score FROM reviews r JOIN assessments a ON a.id=r.assessment_id WHERE a.user_id=$1 ORDER BY r.created_at DESC',[user]);
    return NextResponse.json({selectedRole:role,roles:roles.rows.map(row=>row.target_role),claims:output,assessments:assessments.rows,history:history.rows,reviews:reviews.rows,coverage});
  } catch(error) { const message=error instanceof Error?error.message:'Unable to load progress.';return NextResponse.json({error:message},{status:message==='UNAUTHENTICATED'?401:500}); }
}
