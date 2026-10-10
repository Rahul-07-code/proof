import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { isReviewer } from '@/lib/roles';
import { challenges, runChallenge } from '@/lib/assessment';

export async function GET() {
  try {
    const user = await requireUser();
    if (!await isReviewer(user)) return NextResponse.json({ error: 'Reviewer authorization required.' }, { status: 403 });
    const runs = await db.query('SELECT * FROM challenge_quality_runs ORDER BY created_at DESC');
    const calibration = await db.query('SELECT count(*)::int AS samples,count(*) FILTER(WHERE matches_automated)::int AS matches FROM assessment_quality_samples');
    return NextResponse.json({ runs: runs.rows, calibration: calibration.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Quality report unavailable.' }, { status: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 500 });
  }
}

export async function POST() {
  try {
    const user = await requireUser();
    if (!await isReviewer(user)) return NextResponse.json({ error: 'Reviewer authorization required.' }, { status: 403 });
    const challenge = challenges[0];
    const reference = 'import re\ndef normalize_words(text):\n return [re.sub(r"[^a-z0-9]", "", w) for w in text.lower().split() if re.sub(r"[^a-z0-9]", "", w)]\n';
    const weak = 'def normalize_words(text):\n return text.lower().split()\n';
    const good = await runChallenge(reference, challenge);
    const bad = await runChallenge(weak, challenge);
    const referencePassed = good.total > 0 && good.passed === good.total;
    const weakRejected = bad.passed < bad.total;
    if (!referencePassed || !weakRejected) return NextResponse.json({ error: 'Quality controls failed; task stays unvalidated.', reference: good, weak: bad }, { status: 422 });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO challenge_quality_runs(challenge_id,challenge_version,reference_passed,weak_rejected,details,run_by) VALUES($1,$2,$3,$4,$5,$6)', [challenge.id, challenge.version, true, true, { reference: good, weak: bad }, user]);
      const updated = await client.query("UPDATE challenges SET quality_status='validated' WHERE id=$1 AND version=$2 RETURNING id", [challenge.id, challenge.version]);
      if (!updated.rowCount) throw new Error('Challenge version was not found; quality result was not recorded.');
      await client.query('INSERT INTO audit_log(user_id,action,object_type,object_id,details) VALUES($1,$2,$3,$4,$5)', [user, 'challenge.quality-validated', 'challenge', challenge.id, { version: challenge.version, referenceTests: good.total, weakTests: bad.total }]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    return NextResponse.json({ quality: 'validated', reference: good, weak: bad, boundary: 'Known reference and deliberately weak implementation tested; this does not establish psychometric validity.' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Secure quality runner unavailable.' }, { status: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 503 });
  }
}
