// Usage: npm run replay -- golden/lab-demo.jsonl [speed]
const [file, speed = '1'] = process.argv.slice(2);
if (!file) {
  console.log('Usage: npm run replay -- <path under sessions/> [speed]');
  process.exit(1);
}
const port = process.env.PORT ?? 4321;
const r = await fetch(`http://localhost:${port}/api/replay`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ file, speed: Number(speed) }),
});
console.log(r.ok ? `Replaying ${file} at ${speed}x` : `Brain answered ${r.status}`);
export {};
