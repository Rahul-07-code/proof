import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { isReviewer } from '@/lib/roles';

export async function GET() {
  try {
    const user = await requireUser();
    const reviewer = await isReviewer(user);
    const rows = await db.query(
      reviewer
        ? 'SELECT r.*,a.challenge_id,a.score,u.github_login AS candidate FROM reviews r JOIN assessments a ON a.id=r.assessment_id JOIN users u ON u.id=a.user_id ORDER BY r.created_at DESC'
        : 'SELECT r.*,a.challenge_id,a.score FROM reviews r JOIN assessments a ON a.id=r.assessment_id WHERE a.user_id=$1 ORDER BY r.created_at DESC',
      reviewer ? [] : [user],
    );
    return NextResponse.json(rows.rows);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load reviews.' }, { status: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { assessmentId, reason } = await req.json();
    if (typeof assessmentId !== 'string' || typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 1000) {
      return NextResponse.json({ error: 'Provide an assessment and a review reason (10–1000 characters).' }, { status: 400 });
    }
    const assessment = await db.query('SELECT id FROM assessments WHERE id=$1 AND user_id=$2', [assessmentId, user]);
    if (!assessment.rowCount) return NextResponse.json({ error: 'Assessment not found.' }, { status: 404 });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const review = await client.query('INSERT INTO reviews(assessment_id,reason) VALUES($1,$2) RETURNING id,created_at', [assessmentId, reason.trim()]);
      await client.query('INSERT INTO audit_log(user_id,action,object_type,object_id) VALUES($1,$2,$3,$4)', [user, 'assessment.review-requested', 'assessment', assessmentId]);
      await client.query('COMMIT');
      return NextResponse.json(review.rows[0], { status: 201 });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to request review.' }, { status: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    if (!await isReviewer(user)) return NextResponse.json({ error: 'Reviewer authorization required.' }, { status: 403 });
    const { id, decision, notes, adjustedScore } = await req.json();
    const isAdjust = decision === 'adjust';
    if (typeof id !== 'string' || !['uphold', 'adjust', 'inconclusive'].includes(decision) || typeof notes !== 'string' || notes.trim().length < 5 || notes.length > 2000 || (isAdjust && (!Number.isInteger(adjustedScore) || adjustedScore < 0 || adjustedScore > 100)) || (!isAdjust && adjustedScore !== undefined && adjustedScore !== null)) {
      return NextResponse.json({ error: 'Provide a review id, valid decision, notes, and an adjusted score from 0 to 100 only when adjusting.' }, { status: 400 });
    }
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const review = await client.query('UPDATE reviews SET reviewer_id=$1,decision=$2,notes=$3,adjusted_score=$4,completed_at=now() WHERE id=$5 AND completed_at IS NULL RETURNING assessment_id', [user, decision, notes.trim(), isAdjust ? adjustedScore : null, id]);
      if (!review.rowCount) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Open review not found.' }, { status: 404 });
      }
      const assessment = await client.query('SELECT score FROM assessments WHERE id=$1', [review.rows[0].assessment_id]);
      const automatedScore = Number(assessment.rows[0]?.score ?? 0);
      const agrees = decision === 'uphold';
      await client.query('INSERT INTO assessment_quality_samples(assessment_id,reviewer_id,automated_score,human_decision,matches_automated,notes) VALUES($1,$2,$3,$4,$5,$6)', [review.rows[0].assessment_id, user, automatedScore, decision, agrees, notes.trim()]);
      await client.query('INSERT INTO audit_log(user_id,action,object_type,object_id,details) VALUES($1,$2,$3,$4,$5)', [user, 'assessment.reviewed', 'assessment', review.rows[0].assessment_id, { decision, matchesAutomated: agrees, adjustedScore: isAdjust ? adjustedScore : null }]);
      await client.query('COMMIT');
      return NextResponse.json({ reviewed: true, automatedScore, humanDecision: decision, adjustedScore: isAdjust ? adjustedScore : null, matchesAutomated: agrees });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to adjudicate review.' }, { status: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 500 });
  }
}
