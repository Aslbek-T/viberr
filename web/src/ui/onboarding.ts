import type { Level, ThemeId, UserProfile } from '../../../shared/events.ts';

const KEY = 'buildscape.profile';

export function loadProfile(): UserProfile | null {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function saveProfile(p: UserProfile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function themeForField(field: string): ThemeId {
  if (/biolog|chemi|medic|lab|science|physics/i.test(field)) return 'lab';
  if (/cook|food|fun|chef|bak/i.test(field)) return 'kitchen';
  return 'office';
}

const FIELDS = ['Biology', 'Chemistry', 'Medicine', 'Physics', 'Business', 'Art and design', 'Cooking or just for fun', 'Something else'];

/** Single-screen onboarding for the starter. TODO(B5): split into 4 friendly screens. */
export function runOnboarding(existing: UserProfile | null): Promise<UserProfile> {
  const m = document.getElementById('onboarding') as HTMLElement;
  const p = existing;
  m.innerHTML = `<form class="sheet onboarding">
    <h2 id="ob-title">Welcome to Buildscape</h2>
    <p>Answer 4 quick questions so the building and the explanations fit you.</p>
    <fieldset><legend>1. What's your field?</legend>
      ${FIELDS.map((f, i) => `<label class="chip"><input type="radio" name="field" value="${f}" ${(p?.field ?? 'Biology') === f || (!p && i === 0) ? 'checked' : ''}> ${f}</label>`).join('')}
    </fieldset>
    <fieldset><legend>2. How much coding do you know?</legend>
      <label class="chip"><input type="radio" name="level" value="new" ${(p?.level ?? 'new') === 'new' ? 'checked' : ''}> None at all</label>
      <label class="chip"><input type="radio" name="level" value="some" ${p?.level === 'some' ? 'checked' : ''}> A little</label>
      <label class="chip"><input type="radio" name="level" value="dev" ${p?.level === 'dev' ? 'checked' : ''}> I'm a developer</label>
    </fieldset>
    <fieldset><legend>3. How do you like to learn?</legend>
      <label class="chip"><input type="radio" name="style" value="visual" ${(p?.style ?? 'visual') === 'visual' ? 'checked' : ''}> Pictures</label>
      <label class="chip"><input type="radio" name="style" value="reading" ${p?.style === 'reading' ? 'checked' : ''}> Reading</label>
      <label class="chip"><input type="radio" name="style" value="listening" ${p?.style === 'listening' ? 'checked' : ''}> Listening</label>
    </fieldset>
    <fieldset><legend>4. Make it comfortable</legend>
      <label class="chip"><input type="checkbox" name="captions" ${p?.a11y.captions ?? true ? 'checked' : ''}> Captions</label>
      <label class="chip"><input type="checkbox" name="voice" ${p?.a11y.voice ? 'checked' : ''}> Read aloud</label>
      <label class="chip"><input type="checkbox" name="reducedMotion" ${p?.a11y.reducedMotion ? 'checked' : ''}> Less motion</label>
      <label class="chip"><input type="checkbox" name="colorSafe" ${p?.a11y.colorSafe ? 'checked' : ''}> Color-blind safe colors</label>
      <label class="chip"><input type="checkbox" name="dyslexiaFont" ${p?.a11y.dyslexiaFont ? 'checked' : ''}> Easier-to-read font</label>
      <label>Language <select name="lang">
        <option value="en">English</option><option value="es" ${p?.a11y.lang === 'es' ? 'selected' : ''}>Español</option><option value="uz" ${p?.a11y.lang === 'uz' ? 'selected' : ''}>Oʻzbekcha</option>
      </select></label>
    </fieldset>
    <button type="submit" class="primary">Enter the building</button>
  </form>`;
  m.hidden = false;
  return new Promise((resolve) => {
    const form = m.querySelector('form') as HTMLFormElement;
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const d = new FormData(form);
      const field = String(d.get('field'));
      const profile: UserProfile = {
        userId: p?.userId ?? `u_${Math.random().toString(36).slice(2, 10)}`,
        field, level: String(d.get('level')) as Level, style: String(d.get('style')) as UserProfile['style'],
        theme: themeForField(field),
        a11y: {
          captions: d.has('captions'), voice: d.has('voice'), reducedMotion: d.has('reducedMotion'),
          colorSafe: d.has('colorSafe'), dyslexiaFont: d.has('dyslexiaFont'), lang: String(d.get('lang')),
        },
      };
      saveProfile(profile);
      m.hidden = true;
      resolve(profile);
    };
  });
}
