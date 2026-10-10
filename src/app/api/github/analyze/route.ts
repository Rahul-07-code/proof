import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { githubClient, inspectFiles } from '@/lib/github';
import { verdict, RULE_VERSION } from '@/lib/verification';

export async function POST() {
  try {
    const userId = await requireUser();
    const integration = await db.query("SELECT token_ciphertext FROM integrations WHERE user_id=$1 AND provider='github' AND revoked_at IS NULL", [userId]);
    if (!integration.rowCount) return NextResponse.json({ error: 'GitHub account is not connected.' }, { status: 404 });
    const repos = await db.query('SELECT * FROM repositories WHERE user_id=$1 AND selected=true', [userId]);
    const github = githubClient(decrypt(integration.rows[0].token_ciphertext));
    const identity=await github.users.getAuthenticated();
    let saved = 0;
    let matchedFiles=0,provenanceCommits=0;
    const repoProvenance=[] as Array<Record<string,unknown>>;
    for (const repoRecord of repos.rows) {
      const [owner, repo] = repoRecord.full_name.split('/');
      const tree = await github.git.getTree({ owner, repo, tree_sha: repoRecord.default_branch ?? 'HEAD', recursive: 'true' });
      const blobs = tree.data.tree.filter(file => file.type === 'blob' && file.path && !/(node_modules|vendor|dist|build|\.lock$)/i.test(file.path) && file.size !== undefined && file.size < 150_000).slice(0, 300);
      const files: Array<{ path: string; content: string; sha: string }> = [];
      for (const blobRef of blobs) {
        if (!blobRef.path || !blobRef.sha) continue;
        try {
          const blob = await github.git.getBlob({ owner, repo, file_sha: blobRef.sha });
          files.push({ path: blobRef.path, content: Buffer.from(blob.data.content, 'base64').toString('utf8'), sha: blobRef.sha });
        } catch { /* Inaccessible or binary blobs are not evidence. */ }
      }
      for(const file of files){
        const normalized=createHash('sha256').update(file.content.replace(/\s+/g,' ').trim()).digest('hex');
        const fingerprint=await db.query('INSERT INTO repository_file_fingerprints(user_id,repository_id,file_path,blob_sha,normalized_sha256) VALUES($1,$2,$3,$4,$5) ON CONFLICT(repository_id,file_path,blob_sha) DO UPDATE SET normalized_sha256=EXCLUDED.normalized_sha256 RETURNING id',[userId,repoRecord.id,file.path,file.sha,normalized]);
        const duplicates=await db.query('SELECT id FROM repository_file_fingerprints WHERE user_id=$1 AND normalized_sha256=$2 AND repository_id<>$3',[userId,normalized,repoRecord.id]);
        for(const duplicate of duplicates.rows){const left=[fingerprint.rows[0].id,duplicate.id].sort();await db.query("INSERT INTO repository_similarity_signals(user_id,left_fingerprint,right_fingerprint,signal,uncertainty) VALUES($1,$2,$3,'identical-normalized-file','Exact normalized text match can reflect shared boilerplate, a fork, generated code, or collaboration; it does not establish copying or originality.') ON CONFLICT DO NOTHING",[userId,left[0],left[1]])}
      }
      const commits=await github.repos.listCommits({owner,repo,sha:repoRecord.default_branch??undefined,per_page:100});
      for(const commit of commits.data){if(!commit.sha)continue;const authorLogin=commit.author?.login??null;const authorMatched=Boolean(authorLogin&&authorLogin.toLowerCase()===identity.data.login.toLowerCase());await db.query('INSERT INTO repository_provenance(user_id,repository_id,commit_sha,commit_url,author_login,author_verified,uncertainty) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(repository_id,commit_sha) DO UPDATE SET author_login=EXCLUDED.author_login,author_verified=EXCLUDED.author_verified,uncertainty=EXCLUDED.uncertainty,observed_at=now()',[userId,repoRecord.id,commit.sha,commit.html_url??`https://github.com/${repoRecord.full_name}/commit/${commit.sha}`,authorLogin,authorMatched,'GitHub-associated commit identity is a weak provenance signal; commit authors can be configured, shared, or changed and this does not prove authorship.']);provenanceCommits++}
      const forkNote=repoRecord.is_fork?`Forked from ${repoRecord.parent_full_name??'an upstream repository'}; shared files may be inherited.`:'Repository is not marked as a GitHub fork.';
      repoProvenance.push({repository:repoRecord.full_name,isFork:repoRecord.is_fork,parent:repoRecord.parent_full_name,commitsExamined:commits.data.length,commitsMatchingAuthenticatedLogin:commits.data.filter(commit=>commit.author?.login?.toLowerCase()===identity.data.login.toLowerCase()).length,note:forkNote});
      for (const signal of inspectFiles(files)) {
        const existing = await db.query("SELECT id FROM claims WHERE user_id=$1 AND concept=$2 AND source='repository' AND source_ref=$3 LIMIT 1", [userId, signal.skill, repoRecord.full_name]);
        const claim = existing.rowCount ? existing : await db.query("INSERT INTO claims(user_id,concept,source,source_ref,target_role,importance_weight) VALUES($1,$2,'repository',$3,'software-developer',1) RETURNING id", [userId, signal.skill, repoRecord.full_name]);
        const evidenceIds: string[] = [];
        for (const filePath of signal.sources) {
          const file = files.find(candidate => candidate.path === filePath);
          if (!file) continue;
          const sourceRef = `https://github.com/${repoRecord.full_name}/blob/${repoRecord.default_branch}/${encodeURIComponent(filePath).replaceAll('%2F', '/')}`;
          const existingEvidence = await db.query("SELECT id FROM evidence WHERE user_id=$1 AND claim_id=$2 AND source_ref=$3 AND provenance->>'blobSha'=$4 AND withdrawn_at IS NULL LIMIT 1", [userId, claim.rows[0].id, sourceRef, file.sha]);
          let evidenceId: string;
          if (existingEvidence.rowCount) evidenceId = existingEvidence.rows[0].id;
          else {
            const inserted = await db.query('INSERT INTO evidence(user_id,claim_id,kind,source_ref,excerpt,confidence,provenance) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [userId, claim.rows[0].id, 'repository', sourceRef, null, signal.confidence, { method: 'path-content-heuristic', blobSha: file.sha, limitations: signal.limitations, repository: repoRecord.full_name }]);
            evidenceId = inserted.rows[0].id;
          }
          evidenceIds.push(evidenceId);
        }
        const evidence = evidenceIds.map(id => ({ kind: 'repository' as const, confidence: signal.confidence, createdAt: new Date().toISOString(), ref: id }));
        const result = verdict(evidence);
        const previous = await db.query('SELECT tier FROM verdicts WHERE user_id=$1 AND claim_id=$2 ORDER BY created_at DESC LIMIT 1', [userId, claim.rows[0].id]);
        if (!previous.rowCount || previous.rows[0].tier !== result.tier) {
          await db.query('INSERT INTO verdicts(user_id,claim_id,tier,rule_id,reason,evidence_refs) VALUES($1,$2,$3,$4,$5,$6)', [userId, claim.rows[0].id, result.tier, RULE_VERSION, signal.limitations, evidenceIds]);
        }
        saved++;
      }
      await db.query('UPDATE repositories SET analyzed_at=now() WHERE id=$1', [repoRecord.id]);
    }
    const similar=await db.query('SELECT count(*)::int AS n FROM repository_similarity_signals WHERE user_id=$1',[userId]);matchedFiles=similar.rows[0].n;
    await db.query('INSERT INTO audit_log(user_id,action,object_type,details) VALUES($1,$2,$3,$4)', [userId, 'repository.analysis', 'repository', { repositories: repos.rowCount, signals: saved, provenanceCommits, matchedFiles }]);
    return NextResponse.json({ repositories: repos.rowCount, signals: saved, provenanceCommits, identicalFileMatches:matchedFiles,repoProvenance,ruleVersion: RULE_VERSION, limitations: 'Commit identity and identical-file checks are uncertain signals only; authorship, originality, and understanding are not proven.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Repository analysis failed.';
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHENTICATED' ? 401 : 500 });
  }
}
