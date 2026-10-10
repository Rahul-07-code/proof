import { NextRequest,NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { encrypt } from '@/lib/crypto';

function allowlisted(variable:string,login:string){return new Set((process.env[variable]??'').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean)).has(login.toLowerCase())}
export async function GET(req:NextRequest){
  const jar=await cookies(),code=req.nextUrl.searchParams.get('code'),state=req.nextUrl.searchParams.get('state');
  const expected=jar.get('github_state')?.value;jar.delete('github_state');
  if(!code||!state||!expected||state!==expected||jar.get('privacy_consent')?.value!=='privacy-v1')return NextResponse.json({error:'Invalid OAuth response or missing consent.'},{status:400});
  try{
    const tokenRes=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:process.env.GITHUB_CLIENT_ID,client_secret:process.env.GITHUB_CLIENT_SECRET,code,redirect_uri:process.env.GITHUB_CALLBACK_URL})});
    // GitHub token endpoint always returns HTTP 200; errors are in the JSON body.
    const tokenData=await tokenRes.json();
    if(tokenData.error||!tokenData.access_token){
      // Log sanitized GitHub error — never log the client_secret, code, or access_token.
      console.error('[oauth] GitHub token exchange error: %s — %s (http_status=%d)',tokenData.error??'no_access_token',tokenData.error_description??'no description',tokenRes.status);
      throw new Error(`GitHub token exchange failed: ${tokenData.error??'no access_token returned'}`);
    }
    const gh=await fetch('https://api.github.com/user',{headers:{Authorization:`Bearer ${tokenData.access_token}`,Accept:'application/vnd.github+json','User-Agent':'Proof-of-Skill'}});
    if(!gh.ok)throw new Error('Unable to retrieve GitHub identity.');const profile=await gh.json();
    if(!Number.isInteger(profile.id)||typeof profile.login!=='string')throw new Error('GitHub returned an invalid user profile.');
    const client=await db.connect();let userId:string;
    try{
      await client.query('BEGIN');
      const user=await client.query('INSERT INTO users(github_id,github_login) VALUES($1,$2) ON CONFLICT(github_id) DO UPDATE SET github_login=EXCLUDED.github_login RETURNING id',[profile.id,profile.login]);userId=user.rows[0].id;
      await client.query("INSERT INTO user_roles(user_id,role) VALUES($1,'student') ON CONFLICT DO NOTHING",[userId]);
      for(const [role,variable] of [['recruiter','RECRUITER_GITHUB_LOGINS'],['college','COLLEGE_GITHUB_LOGINS'],['reviewer','REVIEWER_GITHUB_LOGINS']] as const)if(allowlisted(variable,profile.login))await client.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2) ON CONFLICT DO NOTHING',[userId,role]);
      await client.query('INSERT INTO consents(user_id,version) VALUES($1,$2) ON CONFLICT DO NOTHING',[userId,'privacy-v1']);
      await client.query('INSERT INTO integrations(user_id,provider,external_id,token_ciphertext,scopes) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,provider) DO UPDATE SET token_ciphertext=EXCLUDED.token_ciphertext,revoked_at=NULL,scopes=EXCLUDED.scopes',[userId,'github',String(profile.id),encrypt(tokenData.access_token),String(tokenData.scope??'').split(',').filter(Boolean)]);
      await client.query('INSERT INTO audit_log(user_id,action,object_type,details) VALUES($1,$2,$3,$4)',[userId,'oauth.connected','integration',{provider:'github'}]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
    await createSession(userId);return NextResponse.redirect(new URL('/',req.url));
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'OAuth failed.'},{status:502})}
}
