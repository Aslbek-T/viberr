// Writes web/public/demo.jsonl: a recorded build the web app can play with no brain, no network and no keys.
// Run: node scripts/make-demo.mjs
import fs from 'node:fs';

const idea = 'An app to track how tall my plants grow';
let t = 0, n = 0;
const out = [];
const id = (p) => `${p}demo${(n++).toString(36)}`;
const at = (gap, msg) => { t += gap; out.push({ t, msg }); };
const now = (stage, text, gap = 600) => at(gap, { type: 'now', stage, text });
const task = (stage, text, gap = 900) => at(gap, { type: 'task', data: { id: id('t_'), stage, text } });
const stage = (s, gap = 800) => at(gap, { type: 'stage', stage: s });
const blocks = {};
const block = (s, key, name, does, gap = 700) => {
  const old = blocks[key];
  blocks[key] = old ? { ...old, level: old.level + 1, does } : { id: id('b_'), stage: s, name, does, level: 1 };
  at(gap, { type: 'block', data: blocks[key] });
};

at(0, { type: 'state', data: { idea, running: true, stage: 'plan', visited: ['plan'], tasks: [], blocks: [], now: '', ask: null, finished: null, narrator: 'gemini' } });
now('plan', 'Your builder is reading your idea and getting ready to write the plan.', 0);
task('plan', 'Read your idea carefully', 200);
now('plan', 'Your builder is writing the plan: what you can do, which screens you see and what it remembers.', 2500);
task('plan', 'Wrote down the full plan for your app', 2500);
const askId = id('ask_');
at(900, { type: 'ask', data: { id: askId, question: 'Here is the plan for "Sprout Tracker". Shall I start building?',
  summary: 'A simple page where you keep a list of your plants and write down how tall they are, so you can watch them grow.',
  sections: [
    { title: 'What you will be able to do', items: ['Add each of your plants with a name', 'Write down how tall a plant is whenever you measure it, with the date', 'See how much each plant has grown since you started', 'See a small growth picture for every plant', 'Remove a plant or a measurement you no longer want'] },
    { title: 'The screens', items: ['One page with a box at the top to add a new plant', 'A card for each plant with its latest height and a small growth chart', 'Inside each card, a box to type a new height and a list of past measurements'] },
    { title: 'What happens when you tap', items: ['Tapping Add plant puts a new card on the page', 'Tapping Save height adds the measurement with today\'s date and updates the chart', 'The growth number is worked out as the newest height minus the first one', 'Tapping Remove asks the app to forget that plant or measurement'] },
    { title: 'What it remembers', items: ['Every plant and every measurement', 'Everything is kept in your browser, so it is still there after you close the page'] },
    { title: 'How I will check it works', items: ['Adding a plant really adds it', 'Growth is worked out correctly, even with only one measurement', 'Removing a measurement updates the growth number'] },
    { title: 'The parts I will build', items: ['Toolbox: Project card - the app\'s name and how to run the checks', 'Screens: Main screen - the page with the plant cards', 'Screens: Colors and layout - friendly green colors that also fit a phone', 'Rules: Growth rules - adding plants, saving heights and working out growth', 'Memory: Memory box - saving and loading your plants', 'Checks: Automatic checks - trying the growth rules with example plants'] },
  ],
  options: [{ label: 'Yes, build it', explain: 'The builder fills the toolbox, then places the blocks district by district.' }, { label: 'Not yet', explain: 'The builder stops so you can describe your idea differently.' }],
  recommended: 0 } });
at(2000, { type: 'answered', id: askId, option: 0 });
task('plan', 'You approved the plan', 100);

stage('setup');
now('setup', 'Your builder is filling the toolbox: giving the project a name, a folder and its tools.');
block('setup', 'pkg', 'Project card', 'Holds the app\'s name and how to run its checks. Every tool looks here first.');
task('setup', 'Gave your project a name and a home');
task('setup', 'Got the toolbox ready for checking the work later', 600);

stage('look');
now('look', 'Your builder is placing blocks in the Screens district: the page where your plant cards will live.');
block('look', 'html', 'Main screen', 'The page you see: a box to add a plant and a card for each one. Your taps go from here to the rules.');
task('look', 'Built the main screen: Sprout Tracker');
task('look', 'Added the "Add plant" button', 500);
task('look', 'Added a box to type a new height', 500);
now('look', 'Now the colors and the layout, so it feels calm and fits on a phone screen too.', 1200);
block('look', 'css', 'Colors and layout', 'Decides the green colors, the card shapes and the spacing, and makes the page fit a phone.');
task('look', 'Chose the colors and the layout');
task('look', 'Made it fit on a phone screen too', 500);

stage('logic');
now('logic', 'Now the Rules district: what should happen when you tap each button. Screens pass your taps to these rules.');
block('logic', 'app', 'Growth rules', 'Adds plants and heights, works out how much each plant grew, and asks the memory box to save it.');
task('logic', 'Taught the app how to add a plant');
task('logic', 'Taught the app how to work out growth', 600);
task('logic', 'Taught the app how to draw the growth chart', 600);

stage('memory');
now('memory', 'Your builder is building the Memory district, so your plants are still there tomorrow.');
block('memory', 'store', 'Memory box', 'Saves your plants and measurements in the browser and loads them again when you come back.');
task('memory', 'Made a safe place to keep your information');
task('memory', 'Taught the app to remember your plants', 600);
now('memory', 'The rules now save into this memory after every change, and load from it when the page opens.', 1200);

stage('check');
now('check', 'Checks time: your builder is writing small automatic tests that try the rules with example plants.');
block('check', 'tests', 'Automatic checks', 'Tries the growth rules with example plants and shouts if any answer is wrong.');
task('check', 'Wrote checks for the important parts');
task('check', 'Check: growth is newest height minus first', 600);
task('check', 'Ran all the checks', 1500);
at(800, { type: 'problem', text: 'The builder found a problem and is fixing it.' });
now('check', 'One check failed: growth with a single measurement was wrong. Your builder is going back to the rules to fix it.', 300);
block('logic', 'app', 'Growth rules', 'Adds plants and heights, works out growth (zero when there is only one measurement) and asks the memory box to save it.', 1500);
task('check', 'Found a problem and went back to fix it', 400);
task('check', 'Every check passed', 1800);

const structure = [
  { stage: 'look', parts: [blocks.html, blocks.css] },
  { stage: 'logic', parts: [blocks.app] },
  { stage: 'memory', parts: [blocks.store] },
  { stage: 'check', parts: [blocks.tests] },
  { stage: 'setup', parts: [blocks.pkg] },
].map((d) => ({ stage: d.stage, parts: d.parts.map((b) => ({ name: b.name, does: b.does })) }));
stage('done', 1500);
now('done', 'Your app is ready. Every block is in place.', 0);
at(0, { type: 'finished', data: { ok: true, summary: 'Sprout Tracker is ready. Add your plants, type a height whenever you measure one, and watch the growth chart climb. Everything is remembered next time you open it.',
  previewUrl: 'demo-app/index.html', handoffUrl: 'demo-app/guide.html', structure } });

fs.writeFileSync(new URL('../web/public/demo.jsonl', import.meta.url), out.map((l) => JSON.stringify(l)).join('\n') + '\n');
console.log(`wrote ${out.length} lines, ${Math.round(t / 1000)} s`);
