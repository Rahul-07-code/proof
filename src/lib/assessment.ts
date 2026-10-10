import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type TestCase = { input: string; expected: unknown };
export type Challenge = { id: string; version: string; prompt: string; starter: string; testCases: TestCase[]; rubric: Record<string, number> };
export const challenges: Challenge[] = [{
  id: 'python-string-tools', version: '1.0.0',
  prompt: 'Implement normalize_words(text): return lowercase words with punctuation removed, preserving word order.',
  starter: 'def normalize_words(text):\n    raise NotImplementedError\n',
  testCases: [{ input: 'Hello, WORLD!', expected: ['hello', 'world'] }, { input: '', expected: [] }, { input: 'one-two', expected: ['onetwo'] }],
  rubric: { correctness: 80, edgeCases: 20 }
}];

function runCase(directory: string, input: string, timeout: number): Promise<string> {
  const wrapper = "import contextlib,io,json,sys; sys.path.insert(0,'/submission'); input_value=json.loads(sys.stdin.readline()); output_buffer=io.StringIO();\nwith contextlib.redirect_stdout(output_buffer):\n import solution\n result=solution.normalize_words(input_value)\nprint(json.dumps(result,separators=(',',':')))";
  return new Promise((resolve, reject) => {
    const name = `pos-${randomUUID()}`;
    const child = spawn('docker', ['run','--interactive','--name',name,'--rm','--network','none','--read-only','--memory','128m','--cpus','0.5','--pids-limit','64','--security-opt','no-new-privileges','--cap-drop','ALL','--user','65534:65534','--tmpfs','/tmp:rw,noexec,nosuid,size=16m','-v',`${directory}:/submission:ro`,'-w','/tmp',process.env.ASSESSMENT_DOCKER_IMAGE!,'-I','-B','-c',wrapper], { stdio: ['pipe','pipe','pipe'] });
    let output = '', error = '';
    const collect = (target: 'output'|'error') => (chunk: Buffer) => { if (target === 'output' && output.length < 4000) output += chunk.toString().slice(0,4000-output.length); if (target === 'error' && error.length < 2000) error += chunk.toString().slice(0,2000-error.length); };
    child.stdout.on('data',collect('output')); child.stderr.on('data',collect('error'));
    const timer = setTimeout(() => { child.kill('SIGKILL'); const cleanup=spawn('docker',['rm','-f',name],{stdio:'ignore'});cleanup.unref(); }, timeout);
    child.on('error', cause => { clearTimeout(timer); reject(new Error(`Assessment container could not start: ${cause.message}`)); });
    child.on('close', status => { clearTimeout(timer); if (status === 125 || status === 126 || status === 127) reject(new Error(`Assessment infrastructure failed: ${error.slice(-1000) || `docker exited ${status}`}`)); else if (status !== 0) resolve('null'); else resolve(output.trim()); });
    child.stdin.end(`${JSON.stringify(input)}\n`);
  });
}

export async function runChallenge(code: string, challenge: Challenge) {
  if (!process.env.ASSESSMENT_DOCKER_IMAGE) throw new Error('Secure assessment is unavailable: ASSESSMENT_DOCKER_IMAGE is not configured.');
  if (code.length > 20_000 || /\0/.test(code)) throw new Error('Submission is invalid or too large.');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pos-assess-'));
  try {
    await writeFile(path.join(directory, 'solution.py'), code, { mode: 0o444 });
    const timeout = Math.max(1, Math.min(10, Number(process.env.ASSESSMENT_TIMEOUT_SECONDS) || 5)) * 1000;
    let passed = 0; const outcomes: Array<{ passed: boolean; output?: unknown; error?: string }> = [];
    for (const test of challenge.testCases) {
      try {
        const raw = await runCase(directory, test.input, timeout);
        const actual = JSON.parse(raw) as unknown;
        const success = JSON.stringify(actual) === JSON.stringify(test.expected);
        outcomes.push({ passed: success }); if (success) passed++;
      } catch (error) { if (error instanceof Error && error.message.startsWith('Assessment infrastructure failed:')) throw error; outcomes.push({ passed: false }); }
    }
    return { passed, total: challenge.testCases.length, outcomes };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
