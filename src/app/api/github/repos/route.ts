import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { githubClient } from '@/lib/github';

async function clientFor(userId: string) {
  const row = await db.query("SELECT token_ciphertext FROM integrations WHERE user_id=$1 AND provider='github' AND revoked_at IS NULL",[userId]);
  if (!row.rowCount) throw new Error('GitHub account is not connected.');
  return githubClient(decrypt(row.rows[0].token_ciphertext));
}
export async function GET() {
  try {
    const user = await requireUser(), github = await clientFor(user);
    const listed = await github.repos.listForAuthenticatedUser({ sort:'updated', per_page:100 });
    const selected = await db.query('SELECT github_repo_id FROM repositories WHERE user_id=$1 AND selected=true',[user]);
    const ids = new Set(selected.rows.map(row => String(row.github_repo_id)));
    return NextResponse.json(listed.data.map(repo => ({ id:repo.id, name:repo.full_name, private:repo.private, defaultBranch:repo.default_branch, selected:ids.has(String(repo.id)), isFork:repo.fork, parentFullName:(repo as unknown as {parent?:{full_name:string}}).parent?.full_name??null })));
  } catch (error) { const message=error instanceof Error?error.message:'Repository lookup failed.';return NextResponse.json({error:message},{status:message==='UNAUTHENTICATED'?401:message.includes('not connected')?404:502}); }
}
export async function POST(req: Request) {
  try {
    const user = await requireUser(), body = await req.json();
    const repos: unknown = body.repositories;
    if (!Array.isArray(repos) || repos.length>30 || repos.some(item => !item || !Number.isInteger(item.id) || typeof item.name!=='string' || item.name.length>300)) return NextResponse.json({error:'Invalid repository selection.'},{status:400});
    const github = await clientFor(user), verified=[] as Array<{id:number;name:string;private:boolean;branch:string|null;isFork:boolean;parent:string|null}>;
    for (const item of repos) {
      const [owner,...parts] = item.name.split('/'), name=parts.join('/');
      if (!owner || !name) return NextResponse.json({error:'Repository name must use owner/name format.'},{status:400});
      const response = await github.repos.get({owner,repo:name});
      if (response.data.id!==item.id) return NextResponse.json({error:'Repository identity check failed.'},{status:403});
      verified.push({id:response.data.id,name:response.data.full_name,private:response.data.private,branch:response.data.default_branch,isFork:response.data.fork,parent:(response.data as unknown as {parent?:{full_name:string}}).parent?.full_name??null});
    }
    const connection=await db.connect();
    try {
      await connection.query('BEGIN');
      await connection.query('UPDATE repositories SET selected=false WHERE user_id=$1',[user]);
      for(const repo of verified) await connection.query('INSERT INTO repositories(user_id,github_repo_id,full_name,private,default_branch,selected,is_fork,parent_full_name) VALUES($1,$2,$3,$4,$5,true,$6,$7) ON CONFLICT(user_id,github_repo_id) DO UPDATE SET selected=true,full_name=EXCLUDED.full_name,private=EXCLUDED.private,default_branch=EXCLUDED.default_branch,is_fork=EXCLUDED.is_fork,parent_full_name=EXCLUDED.parent_full_name',[user,repo.id,repo.name,repo.private,repo.branch,repo.isFork,repo.parent]);
      await connection.query('COMMIT');
    } catch(error) { await connection.query('ROLLBACK'); throw error; } finally { connection.release(); }
    return NextResponse.json({selected:verified.length});
  } catch (error) { const message=error instanceof Error?error.message:'Could not save repositories.';return NextResponse.json({error:message},{status:message==='UNAUTHENTICATED'?401:message.includes('not connected')?404:502}); }
}
