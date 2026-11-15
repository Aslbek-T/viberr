#!/usr/bin/env node
// Claude Code hook -> Vibeerr brain. Reads the hook JSON on stdin and prints the brain's answer.
// If the brain is not running it prints nothing and exits 0, so Claude Code carries on normally.
const url = (process.env.VIBEERR_URL ?? process.env.BUILDSCAPE_URL ?? 'http://127.0.0.1:4321') + '/hook/claude';
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', async () => {
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: input,
      signal: AbortSignal.timeout(590_000), // the brain may hold this open while the person decides
    });
    const text = await res.text();
    if (res.ok && text && text !== '{}') process.stdout.write(text);
  } catch { /* brain not reachable: stay out of the way */ }
  process.exit(0);
});
