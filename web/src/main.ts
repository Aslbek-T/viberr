import Phaser from 'phaser';
import type { ThemeId, UserProfile } from '../../shared/events.ts';
import { Feed } from './net/socket.ts';
import { BuildingScene, HEIGHT, RES, WIDTH } from './scenes/Building.ts';
import { addStep, attachNarration, clearSteps, setBadge, setVoice, showCaption, showConcept, showDecision } from './ui/overlay.ts';
import { loadProfile, runOnboarding, saveProfile } from './ui/onboarding.ts';

const scene = new BuildingScene();
new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: WIDTH * RES, height: HEIGHT * RES, backgroundColor: '#e8f4fb',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
  scene: [scene],
});

const feed = new Feed();
let profile: UserProfile;

function applyProfile(p: UserProfile) {
  profile = p;
  document.body.classList.toggle('dyslexia', p.a11y.dyslexiaFont);
  document.body.classList.toggle('reduced-motion', p.a11y.reducedMotion);
  document.body.classList.toggle('no-captions', !p.a11y.captions);
  document.documentElement.lang = p.a11y.lang;
  setVoice(p.a11y.voice, p.a11y.lang);
  (document.getElementById('theme-select') as HTMLSelectElement).value = p.theme;
  const push = () => scene.setOptions({ theme: p.theme, reducedMotion: p.a11y.reducedMotion, colorSafe: p.a11y.colorSafe });
  if (scene.sys?.isActive()) push(); else scene.events?.once('create', push);
  if (!scene.sys) setTimeout(push, 300);
  feed.send({ type: 'profile', data: p });
}

feed.on((m) => {
  switch (m.type) {
    case 'status':
      if (m.data.mode === 'replay') { setBadge('Replay', 'replay'); }
      else setBadge(feed.brainConnected ? `Live · ${m.data.sources.join(', ') || 'waiting for an agent'}` : 'Offline', feed.brainConnected ? 'live' : 'off');
      break;
    case 'event':
      if (m.data.kind === 'session_start') { /* keep history, new agent appears */ }
      scene.handleEvent(m.data);
      addStep(m.data, profile.theme);
      break;
    case 'narration':
      showCaption(m.data.text);
      attachNarration(m.data.eventId, m.data.text);
      break;
    case 'concept':
      showConcept(m.data, profile.theme, (id) => feed.send({ type: 'learned', conceptId: id }));
      break;
    case 'decision':
      showDecision(m.data, (option) => feed.decide(m.data.id, option));
      break;
  }
});

feed.onConnection = (up) => {
  setBadge(up ? 'Live · waiting for an agent' : 'Brain offline · replays still work', up ? 'live' : 'off');
  if (up && profile) feed.send({ type: 'profile', data: profile });
  refreshSessions();
};

async function refreshSessions() {
  const sel = document.getElementById('replay-select') as HTMLSelectElement;
  const files = await feed.listSessions();
  sel.innerHTML = '<option value="">Pick a session…</option>' + files.map((f) => `<option value="${f}">${f.replace(/\.jsonl$/, '')}</option>`).join('');
}

document.getElementById('replay-select')!.addEventListener('change', (ev) => {
  const file = (ev.target as HTMLSelectElement).value;
  if (!file) return;
  scene.reset();
  clearSteps();
  const speed = Number((document.getElementById('speed-select') as HTMLSelectElement).value);
  feed.replay(file, speed);
});

document.getElementById('theme-select')!.addEventListener('change', (ev) => {
  const theme = (ev.target as HTMLSelectElement).value as ThemeId;
  const p = { ...profile, theme };
  saveProfile(p);
  applyProfile(p);
});

document.getElementById('settings-btn')!.addEventListener('click', async () => applyProfile(await runOnboarding(profile)));

// Boot
const params = new URLSearchParams(location.search);
const existing = loadProfile();
applyProfile(existing ?? (await runOnboarding(null)));
setBadge('Connecting…', 'off');
feed.connect();
refreshSessions();
const fixture = params.get('fixture');
if (fixture) {
  setBadge('Replay', 'replay');
  feed.playFile(fixture.includes('/') ? `${fixture}.jsonl` : `fixtures/${fixture}.jsonl`, Number(params.get('speed') ?? 1));
}
