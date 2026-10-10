import {NextResponse} from 'next/server';import {createHash} from 'node:crypto';import {requireUser} from '@/lib/auth';import {db} from '@/lib/db';import {hasRole} from '@/lib/roles';import {tierFor} from '@/lib/verification';
export async function POST(req:Request){
  try{
    const recruiter=await requireUser();if(!await hasRole(recruiter,'recruiter'))return NextResponse.json({error:'Recruiter role required.'},{status:403});
    const body=await req.json();if(!Array.isArray(body.tokens)||body.tokens.length<2||body.tokens.length>5||body.tokens.some((token:unknown)=>typeof token!=='string'||token.length>100))return NextResponse.json({error:'Provide two to five valid passport share tokens.'},{status:400});
    const role=typeof body.targetRole==='string'&&body.targetRole.length<=100?body.targetRole:null,results=[];
    for(const token of body.tokens){
      const hash=createHash('sha256').update(token).digest('hex'),p=await db.query('SELECT id,user_id,fields FROM passports WHERE token_hash=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())',[hash]);
      if(!p.rowCount){results.push({available:false,reason:'Passport is unavailable or revoked.'});continue}
      const user=p.rows[0].user_id,fields=new Set<string>(p.rows[0].fields??[]);
      let metrics:unknown[]|undefined,coverage:number|null=null;
      if(fields.has('claims')||fields.has('tiers')||fields.has('sources')){
        const claims=await db.query('SELECT id,concept,target_role,importance_weight FROM claims WHERE user_id=$1 AND ($2::text IS NULL OR target_role=$2)',[user,role]);metrics=[];let sum=0,eligible=0;
        for(const claim of claims.rows){const evidence=await db.query('SELECT kind,confidence,observed_at,source_ref FROM evidence WHERE claim_id=$1 AND withdrawn_at IS NULL',[claim.id]);const normalized=evidence.rows.map(row=>({kind:row.kind,confidence:Number(row.confidence),createdAt:row.observed_at.toISOString(),passed:row.kind==='assessment'&&Number(row.confidence)>=1,ref:row.source_ref}));const tier=tierFor(normalized),weight=Number(claim.importance_weight);eligible+=weight;if(tier!=='below_threshold')sum+=weight;const item:any={};if(fields.has('claims')){item.concept=claim.concept;item.targetRole=claim.target_role}if(fields.has('tiers')){item.tier=tier;item.importanceWeight=weight}if(fields.has('sources'))item.sources=normalized.map(source=>({kind:source.kind,sourceRef:source.ref}));(metrics as unknown[]).push(item)}
        if(fields.has('claims')&&fields.has('tiers'))coverage=eligible?Math.round(sum/eligible*10000)/100:null;
      }
      let assessments:unknown[]|undefined;if(fields.has('assessments')){const rows=await db.query("SELECT a.challenge_id,a.challenge_version,a.status,a.score AS automated_score,a.submitted_at,a.rubric,a.outcomes,r.decision AS human_decision,r.adjusted_score FROM assessments a LEFT JOIN LATERAL(SELECT decision,adjusted_score FROM reviews WHERE assessment_id=a.id AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1) r ON true WHERE a.user_id=$1 AND a.status='complete' ORDER BY a.submitted_at DESC",[user]);assessments=rows.rows}
      results.push({available:true,targetRole:role??'all disclosed roles',...(metrics?{claims:metrics}:{}),...(coverage!==null?{evidenceCoverage:coverage}:{}),...(assessments?{assessments}:{}),...(fields.has('limitations')?{limitations:['Coverage reflects only disclosed claims and evidence.','Repository signals do not establish authorship or understanding.','Comparison is not a ranking of candidate value.']}:{}),reassessmentAllowed:fields.has('reassessment')});
    }
    await db.query('INSERT INTO audit_log(user_id,action,object_type,details) VALUES($1,$2,$3,$4)',[recruiter,'passport.compared','passport',{candidateCount:results.length,targetRole:role}]);
    return NextResponse.json({results,comparisonPolicy:'Only candidate-selected passport fields are used; comparison is role-specific when selected and produces no overall rank.'});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to compare passports.'},{status:error instanceof Error&&error.message==='UNAUTHENTICATED'?401:500})}
}
