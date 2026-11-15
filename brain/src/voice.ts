import { ELEVENLABS_API_KEY, ELEVENLABS_MODEL, ELEVENLABS_STT_MODEL, ELEVENLABS_VOICE_ID } from './config.ts';

// The guide's voice. With ELEVENLABS_API_KEY the brain asks ElevenLabs to read the guide's words aloud and
// can turn a short spoken answer back into words. The key never leaves the brain. Without a key (or if
// ElevenLabs fails) the browser uses its own built-in voice and its own speech recognition instead.

const API = 'https://api.elevenlabs.io/v1';
let disabled = '';          // set after a key or quota problem, so we stop asking for the rest of the session
const cache = new Map<string, Buffer>();
const CACHE_MAX = 60;

export const voiceKind = (): 'elevenlabs' | 'browser' => (ELEVENLABS_API_KEY && !disabled ? 'elevenlabs' : 'browser');

function remember(key: string, audio: Buffer) {
  cache.set(key, audio);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

function giveUp(status: number, body: string) {
  // 401: wrong key. 402/429 with quota words: the free credits ran out. Either way, stop for this session.
  if (status === 401 || status === 402 || (status === 429 && /quota|credit/i.test(body))) {
    disabled = `ElevenLabs answered ${status}`;
    console.warn(`[voice] ${disabled}: ${body.slice(0, 200)}. Using the browser's own voice from now on.`);
  } else {
    console.warn(`[voice] ElevenLabs answered ${status}: ${body.slice(0, 200)}`);
  }
}

/** Reads one sentence aloud. Returns mp3 audio, or null so the browser can use its own voice. */
export async function speak(text: string): Promise<Buffer | null> {
  if (voiceKind() !== 'elevenlabs') return null;
  const words = text.replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!words) return null;
  const hit = cache.get(words);
  if (hit) return hit;
  try {
    const res = await fetch(`${API}/text-to-speech/${encodeURIComponent(ELEVENLABS_VOICE_ID)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg', 'xi-api-key': ELEVENLABS_API_KEY },
      body: JSON.stringify({ text: words, model_id: ELEVENLABS_MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) { giveUp(res.status, await res.text()); return null; }
    const audio = Buffer.from(await res.arrayBuffer());
    remember(words, audio);
    return audio;
  } catch (err: any) {
    console.warn(`[voice] ElevenLabs did not answer: ${String(err?.message ?? err).slice(0, 160)}`);
    return null;
  }
}

/** Turns a short recorded answer into words. Null when ElevenLabs is not available. */
export async function listen(audio: Buffer, type: string): Promise<string | null> {
  if (voiceKind() !== 'elevenlabs' || audio.length < 200) return null;
  try {
    const form = new FormData();
    form.append('model_id', ELEVENLABS_STT_MODEL);
    form.append('file', new Blob([audio], { type: type || 'audio/webm' }), type.includes('mp4') ? 'answer.mp4' : 'answer.webm');
    const res = await fetch(`${API}/speech-to-text`, {
      method: 'POST', headers: { 'xi-api-key': ELEVENLABS_API_KEY }, body: form, signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) { giveUp(res.status, await res.text()); return null; }
    const data: any = await res.json();
    const text = String(data?.text ?? '').replace(/\s+/g, ' ').trim();
    return text || null;
  } catch (err: any) {
    console.warn(`[voice] ElevenLabs could not listen: ${String(err?.message ?? err).slice(0, 160)}`);
    return null;
  }
}

export function voiceLine(): string {
  return ELEVENLABS_API_KEY
    ? `ElevenLabs reads the guide aloud (voice ${ELEVENLABS_VOICE_ID}, ${ELEVENLABS_MODEL})`
    : "the browser's own voice (add ELEVENLABS_API_KEY to .env for a natural voice)";
}
