import { Octokit } from '@octokit/rest';
export function githubClient(token: string) { return new Octokit({ auth: token, userAgent: 'Proof-of-Skill' }); }
const skillTerms: Record<string,string[]> = { TypeScript:['typescript','\.ts$'], React:['react','\.tsx$'], PostgreSQL:['postgres','sql'], Python:['python','\.py$'], Testing:['test','spec','pytest','jest','vitest'], API:['api','route','endpoint','fetch'] };
export function inspectFiles(files: Array<{path:string;content:string}>) {
  return Object.entries(skillTerms).map(([skill, terms]) => {
    const matches = files.filter(f => terms.some(t => new RegExp(t,'i').test(f.path+' '+f.content.slice(0,2000))));
    const confidence = Math.min(0.95, matches.length ? 0.45 + Math.min(matches.length,5)*0.1 : 0);
    return { skill, confidence, sources: matches.slice(0,8).map(f=>f.path), limitations:'Heuristic file and content signals; does not establish authorship or understanding.' };
  }).filter(x=>x.confidence>0);
}
