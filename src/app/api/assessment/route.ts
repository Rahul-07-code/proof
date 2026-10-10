import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { challenges, runChallenge } from '@/lib/assessment';
import { RULE_VERSION } from '@/lib/verification';

export async function GET() {
  try {
    const rows = await db.query('SELECT id,version,quality_status FROM challenges');
    return NextResponse.json(challenges.map(({id,version,prompt,starter,rubric}) => ({ id, version, prompt, starter, rubric, qualityStatus: rows.rows.find(row => row.id === id && row.version === version)?.quality_status ?? 'unavailable' })));
  } catch { return NextResponse.json({error:'Challenge records are unavailable until the database migration is applied.'},{status:503}); }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    if (typeof body.code !== 'string' || typeof body.challengeId !== 'string') return NextResponse.json({error:'challengeId and code are required.'},{status:400});
    const challenge = challenges.find(item => item.id === body.challengeId);
    if (!challenge) return NextResponse.json({error:'Unknown challenge.'},{status:404});
    const validated = await db.query("SELECT quality_status FROM challenges WHERE id=$1 AND version=$2",[challenge.id,challenge.version]);
    if (validated.rows[0]?.quality_status !== 'validated') return NextResponse.json({error:'This challenge is unavailable until reference and weak solutions pass the quality-control suite.'},{status:423});
    if(body.requestId){const request=await db.query("SELECT id FROM reassessment_requests WHERE id=$1 AND candidate_id=$2 AND challenge_id=$3 AND challenge_version=$4 AND status='accepted'",[body.requestId,user,challenge.id,challenge.version]);if(!request.rowCount)return NextResponse.json({error:'An accepted reassessment request for this challenge is required.'},{status:403})}
    const row = await db.query("INSERT INTO assessments(user_id,challenge_id,challenge_version,rubric,status) VALUES($1,$2,$3,$4,'running') RETURNING id",[user,challenge.id,challenge.version,challenge.rubric]);
    try {
      const outcome = await runChallenge(body.code,challenge);
      const score = Math.round(100 * outcome.passed / outcome.total);
      await db.query("UPDATE assessments SET status='complete',score=$1,outcomes=$2,completed_at=now() WHERE id=$3",[score,{...outcome,ruleVersion:RULE_VERSION},row.rows[0].id]);
      const existing = await db.query("SELECT id FROM claims WHERE user_id=$1 AND concept='Python' AND source='assessment' LIMIT 1",[user]);
      const claim = existing.rowCount ? existing : await db.query("INSERT INTO claims(user_id,concept,source,source_ref,target_role,importance_weight) VALUES($1,'Python','assessment',$2,'software-developer',1) RETURNING id",[user,`assessment:${row.rows[0].id}`]);
      const evidence = await db.query("INSERT INTO evidence(user_id,claim_id,kind,source_ref,confidence,provenance) VALUES($1,$2,'assessment',$3,$4,$5) RETURNING id",[user,claim.rows[0].id,`assessment:${row.rows[0].id}`,score/100,{challengeId:challenge.id,challengeVersion:challenge.version,rubric:challenge.rubric,outcome}]);
      const passed = outcome.passed === outcome.total;
      await db.query('INSERT INTO verdicts(user_id,claim_id,tier,rule_id,reason,evidence_refs) VALUES($1,$2,$3,$4,$5,$6)',[user,claim.rows[0].id,passed?'recently_reassessed':'below_threshold',RULE_VERSION,`Assessment ${challenge.id} v${challenge.version}: ${outcome.passed}/${outcome.total} tests passed; rubric score ${score}.`,[evidence.rows[0].id]]);
      if(body.requestId)await db.query("UPDATE reassessment_requests SET status='completed',assessment_id=$1 WHERE id=$2 AND candidate_id=$3 AND status='accepted'",[row.rows[0].id,body.requestId,user]);
      return NextResponse.json({id:row.rows[0].id,score,outcome:{passed:outcome.passed,total:outcome.total},challengeVersion:challenge.version});
    } catch (error) {
      await db.query("UPDATE assessments SET status='blocked',outcomes=$1,completed_at=now() WHERE id=$2",[{error:error instanceof Error?error.message:'Runner error.'},row.rows[0].id]);
      return NextResponse.json({id:row.rows[0].id,error:error instanceof Error?error.message:'Secure runner unavailable; no result was fabricated.'},{status:503});
    }
  } catch (error) { return NextResponse.json({error:error instanceof Error?error.message:'Assessment failed.'},{status:error instanceof Error&&error.message==='UNAUTHENTICATED'?401:500}); }
}
