import fs from 'node:fs';
import path from 'node:path';
import type { Review } from '../../shared/story.ts';
import { XAI_API_KEY, XAI_MODEL } from './config.ts';

// After a build, Grok looks at the finished app the way a careful first-time user would and gives a second
// opinion in plain words: what works, and up to three improvements the person can send to the builder with
// one click. Without XAI_API_KEY (or on any failure) there is simply no review.

const REVIEWER = `You review small apps for a person who does not code. You get the app's files.
Judge it as a first-time user would: is it clear, easy, friendly, does it work, does it keep information, is it usable
on a phone and with a keyboard, is the text readable. Write ONLY in everyday words: never mention code, file names,
functions, languages or tools. Be honest, warm and specific to THIS app.`;

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[`*_#]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');

export const reviewerLine = () => (XAI_API_KEY ? `Grok reviews each finished app (${XAI_MODEL})` : 'off (add XAI_API_KEY to .env for a Grok review of each finished app)');

function appFiles(dir: string): string {
  const wanted = ['index.html', 'styles.css', 'app.js', 'storage.js'];
  let out = '';
  for (const name of wanted) {
    try { out += `\n----- ${name}\n${fs.readFileSync(path.join(dir, name), 'utf8').slice(0, 9000)}`; } catch { /* not every app has every file */ }
  }
  return out.slice(0, 26000);
}

export async function reviewApp(dir: string, idea: string): Promise<Review | null> {
  if (!XAI_API_KEY) return null;
  const files = appFiles(dir);
  if (!files) return null;
  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${XAI_API_KEY}` },
      body: JSON.stringify({
        model: XAI_MODEL,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: REVIEWER },
          { role: 'user', content: `The person asked for: "${idea.slice(0, 1500)}"\n\nThe finished app:${files}\n\nReply with JSON only:
{"score": number 1-10, "good": [2 or 3 short sentences on what works well],
 "ideas": [up to 3 objects {"title": 3-6 words, "why": one sentence on why it helps the person, "change": one sentence the person could send to the builder, starting with a verb}]}` },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) { console.warn(`[review] Grok answered ${res.status}: ${(await res.text()).slice(0, 200)}`); return null; }
    const data: any = await res.json();
    const text = String(data?.choices?.[0]?.message?.content ?? '');
    const out = JSON.parse(text.replace(/^```(json)?|```$/g, '').trim());
    const score = Math.max(1, Math.min(10, Math.round(Number(out?.score) || 0)));
    const good = (Array.isArray(out?.good) ? out.good : []).map((g: unknown) => clean(g, 200)).filter(Boolean).slice(0, 3);
    const ideas = (Array.isArray(out?.ideas) ? out.ideas : []).map((i: any) => ({ title: clean(i?.title, 60), why: clean(i?.why, 220), change: clean(i?.change, 300) }))
      .filter((i: Review['ideas'][number]) => i.title && i.change).slice(0, 3);
    if (!score || (!good.length && !ideas.length)) return null;
    return { score, good, ideas };
  } catch (err: any) {
    console.warn(`[review] Grok did not answer: ${String(err?.message ?? err).slice(0, 160)}`);
    return null;
  }
}
