import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const user = await requireUser();
    const claims = await db.query("SELECT c.id,c.concept,c.importance_weight,COALESCE(v.tier,'below_threshold') AS tier FROM claims c LEFT JOIN LATERAL(SELECT tier FROM verdicts WHERE claim_id=c.id ORDER BY created_at DESC LIMIT 1) v ON true WHERE c.user_id=$1 ORDER BY c.importance_weight DESC", [user]);
    let generated = 0;
    for (const claim of claims.rows) {
      if (claim.tier !== 'below_threshold') continue;
      const existing = await db.query('SELECT 1 FROM learning_plans WHERE user_id=$1 AND claim_id=$2 LIMIT 1', [user, claim.id]);
      if (existing.rowCount) continue;
      const recommendation = `Build a small, tested ${claim.concept} example and submit the related practical assessment. Evidence is currently missing; this is not a finding of inability.`;
      const saved = await db.query('INSERT INTO learning_plans(user_id,claim_id,recommendation) VALUES($1,$2,$3) RETURNING id', [user, claim.id, recommendation]);
      await db.query('INSERT INTO audit_log(user_id,action,object_type,object_id,details) VALUES($1,$2,$3,$4,$5)', [user, 'learning-plan.generated', 'claim', claim.id, { planId: saved.rows[0].id, method: 'evidence-gap-rule-v1' }]);
      generated++;
    }
    const plans = await db.query('SELECT * FROM learning_plans WHERE user_id=$1 ORDER BY created_at DESC', [user]);
    return NextResponse.json({ plans: plans.rows, generated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load gap plan.' }, { status: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const { id, status } = await req.json();
    if (typeof id !== 'string' || !['open', 'in_progress', 'complete'].includes(status)) return NextResponse.json({ error: 'Provide a plan id and a valid status.' }, { status: 400 });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query("UPDATE learning_plans SET status=$1,completed_at=CASE WHEN $1='complete' THEN now() ELSE NULL END WHERE id=$2 AND user_id=$3 RETURNING claim_id", [status, id, user]);
      if (!updated.rowCount) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Plan not found.' }, { status: 404 });
      }
      await client.query('INSERT INTO audit_log(user_id,action,object_type,object_id,details) VALUES($1,$2,$3,$4,$5)', [user, 'learning-plan.status-updated', 'claim', updated.rows[0].claim_id, { planId: id, status }]);
      await client.query('COMMIT');
      return NextResponse.json({ updated: true, status });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed.' }, { status: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 500 });
  }
}
