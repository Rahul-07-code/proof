import {loadEnvConfig} from '@next/env';
import {runChallenge,challenges} from '../src/lib/assessment';
const challenge=challenges[0];const reference='import re\ndef normalize_words(text):\n return [re.sub(r"[^a-z0-9]", "", w) for w in text.lower().split() if re.sub(r"[^a-z0-9]", "", w)]\n';const weak='def normalize_words(text):\n return text.lower().split()\n';
async function main(){loadEnvConfig(process.cwd());const good=await runChallenge(reference,challenge);const bad=await runChallenge(weak,challenge);if(good.passed!==good.total||bad.passed===bad.total)throw new Error(`Challenge QC failed. Reference ${good.passed}/${good.total}, weak ${bad.passed}/${bad.total}`);console.log('Challenge QC passed: reference passes; weak implementation is rejected.')}
main().catch(error=>{console.error(error);process.exitCode=1});
