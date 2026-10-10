import {db} from '@/lib/db';
export type UserRole='student'|'recruiter'|'college'|'reviewer';
export async function githubLogin(userId:string){const r=await db.query('SELECT github_login FROM users WHERE id=$1',[userId]);return String(r.rows[0]?.github_login??'')}
export async function rolesFor(userId:string):Promise<UserRole[]>{const r=await db.query('SELECT role FROM user_roles WHERE user_id=$1',[userId]);return r.rows.map(x=>x.role as UserRole)}
export async function hasRole(userId:string,role:UserRole){return (await rolesFor(userId)).includes(role)}
export async function isReviewer(userId:string){const allow=new Set((process.env.REVIEWER_GITHUB_LOGINS??'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));return await hasRole(userId,'reviewer')||allow.has((await githubLogin(userId)).toLowerCase())}
