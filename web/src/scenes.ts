import type { StageId } from '../../shared/story.ts';

// One drawing per stage. Every drawing has up to 4 "steps" (data-s="1".."4") that appear as jobs
// in that stage get done, so the picture is built by the work, not by a timer.

const C = {
  sky1: '#d3e9e2', sky2: '#f4f1dc', sun: '#ffdf85', hill: '#b9d897', hill2: '#a2c784', ground: '#86b56e', soil: '#9a7650',
  wall: '#f8ebd0', wallRaw: '#e2cda6', roof: '#c9573f', roofDark: '#a7432f', door: '#2f5d50', glass: '#a9d8e8', lit: '#ffd866',
  line: '#16302a', concrete: '#c2c4bb', concreteDark: '#9c9e95', wood: '#c79a63', woodDark: '#a67c4b', hat: '#f4c858',
  vest: '#e8743b', skin: '#f2c7a0', pants: '#2b4a66', green: '#2f9e5b', paper: '#1f4f7a',
};

/** The builder: hardhat, vest and a hammer arm that never stops. `flip` makes them face left. */
export function builder(x: number, y: number, scale = 1.4, flip = false, tool: 'hammer' | 'pencil' | 'wave' = 'hammer'): string {
  const held = tool === 'hammer'
    ? `<rect x="11.5" y="26" width="4" height="20" rx="1.5" fill="${C.woodDark}"/><rect x="6" y="42" width="15" height="8" rx="2" fill="#5b6b7a"/>`
    : tool === 'pencil' ? `<rect x="11.5" y="26" width="4" height="18" rx="1.5" fill="${C.hat}"/><path d="M11.5 44h4l-2 5z" fill="${C.line}"/>` : '';
  return `<g transform="translate(${x},${y}) scale(${flip ? -scale : scale},${scale})">
    <ellipse cx="0" cy="62" rx="22" ry="4.5" fill="#000" opacity=".14"/>
    <rect x="-10" y="34" width="8" height="27" rx="3" fill="${C.pants}"/><rect x="2" y="34" width="8" height="27" rx="3" fill="${C.pants}"/>
    <g class="bob">
      <rect x="-17" y="8" width="7" height="21" rx="3.5" fill="${C.skin}"/>
      <rect x="-13" y="5" width="26" height="33" rx="8" fill="${C.vest}"/>
      <rect x="-13" y="19" width="26" height="5" fill="${C.hat}"/>
      <circle cx="0" cy="-7" r="11" fill="${C.skin}"/>
      <circle cx="-1" cy="-7" r="1.6" fill="${C.line}"/><circle cx="6" cy="-7" r="1.6" fill="${C.line}"/>
      <path d="M-1 -2q4 3 8 0" stroke="${C.line}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M-12.5 -10a12.5 12.5 0 0 1 25 0z" fill="${C.hat}"/><rect x="-15" y="-11.5" width="32" height="4" rx="2" fill="#e0ae3a"/>
      <g class="arm ${tool}"><rect x="10" y="7" width="7" height="22" rx="3.5" fill="${C.skin}"/>${held}</g>
    </g>
  </g>`;
}

const bg = (sun = true) => `
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.sky1}"/><stop offset="1" stop-color="${C.sky2}"/></linearGradient></defs>
  <rect width="800" height="450" fill="url(#sky)"/>
  ${sun ? `<circle cx="690" cy="78" r="34" fill="${C.sun}"/>` : ''}
  <g class="cloud" fill="#fff" opacity=".85"><ellipse cx="150" cy="80" rx="46" ry="15"/><ellipse cx="185" cy="68" rx="30" ry="14"/></g>
  <g class="cloud slow" fill="#fff" opacity=".7"><ellipse cx="520" cy="120" rx="40" ry="12"/><ellipse cx="548" cy="110" rx="24" ry="11"/></g>
  <path d="M0 335Q140 262 320 322T640 300T800 318V450H0Z" fill="${C.hill}"/>
  <path d="M0 352Q200 316 420 346T800 338V450H0Z" fill="${C.hill2}"/>
  <rect y="350" width="800" height="100" fill="${C.ground}"/>`;

const win = (x: number, lit: boolean) => `
  <rect x="${x}" y="236" width="52" height="46" rx="4" fill="${lit ? C.lit : C.glass}" stroke="#fff" stroke-width="5"/>
  <path d="M${x + 26} 236v46M${x} 259h52" stroke="#fff" stroke-width="3"/>`;
const flowers = (x: number) => `<rect x="${x - 3}" y="286" width="58" height="9" rx="3" fill="${C.woodDark}"/>
  ${[6, 19, 32, 45].map((d, i) => `<circle cx="${x + d}" cy="283" r="5" fill="${['#e8743b', '#f4c858', '#e56b8a', '#f4c858'][i]}"/>`).join('')}`;

/** The finished house, used on inspection day and move-in day. */
const house = (lit: boolean) => `
  <path d="M384 350h32l26 100h-84z" fill="#eadfc4"/>
  <rect x="236" y="338" width="328" height="14" rx="3" fill="${C.concrete}"/>
  <rect x="468" y="128" width="28" height="60" fill="${C.roofDark}"/>
  <rect x="250" y="200" width="300" height="140" fill="${C.wall}"/>
  <path d="M226 206L400 106l174 100z" fill="${C.roof}"/>
  <rect x="378" y="266" width="44" height="74" rx="4" fill="${C.door}"/><circle cx="412" cy="305" r="3.5" fill="${C.hat}"/>
  ${win(284, lit)}${win(464, lit)}${flowers(284)}${flowers(464)}`;

function plan(): string {
  const grid = [...Array(13)].map((_, i) => `<path d="M${120 + i * 40} 60V360"/>`).join('') + [...Array(7)].map((_, i) => `<path d="M92 ${88 + i * 40}H628"/>`).join('');
  const rows = [0, 1, 2].map((i) => `
    <g class="s" data-s="${i + 1}"><rect x="446" y="${150 + i * 48}" width="22" height="22" rx="4" fill="none" stroke="#e9f3ff" stroke-width="2.5"/>
    <rect x="482" y="${154 + i * 48}" width="${[118, 96, 108][i]}" height="6" rx="3" fill="#e9f3ff" opacity=".85"/><rect x="482" y="${165 + i * 48}" width="${[70, 84, 56][i]}" height="5" rx="2.5" fill="#e9f3ff" opacity=".45"/></g>
    <path class="s draw" data-s="${i + 1}" pathLength="1" d="M450 ${161 + i * 48}l6 7 11-14" stroke="${C.hat}" stroke-width="4"/>`).join('');
  return `${bg(false)}
  <rect x="160" y="360" width="12" height="66" fill="${C.woodDark}"/><rect x="548" y="360" width="12" height="66" fill="${C.woodDark}"/>
  <rect x="80" y="48" width="560" height="324" rx="12" fill="${C.paper}" stroke="#163a5c" stroke-width="6"/>
  <g stroke="#fff" opacity=".1">${grid}</g>
  <text x="104" y="86" class="bp">BLUEPRINT</text><text x="446" y="130" class="bp small">WHAT YOUR APP WILL DO</text>
  <g fill="none" stroke="#e9f3ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path class="s draw" data-s="1" pathLength="1" d="M124 322H416"/>
    <path class="s draw" data-s="1" pathLength="1" d="M168 322V214H372V322"/>
    <path class="s draw" data-s="2" pathLength="1" d="M150 216L270 132L390 216"/>
    <path class="s draw" data-s="2" pathLength="1" d="M318 166V140H340V182"/>
    <path class="s draw" data-s="3" pathLength="1" d="M254 322V264H286V322"/>
    <path class="s draw" data-s="3" pathLength="1" d="M190 238H232V274H190ZM308 238H350V274H308Z"/>
    <path class="s draw" data-s="4" pathLength="1" stroke="${C.hat}" stroke-width="2" d="M168 344H372M168 337V351M372 337V351"/>
    ${rows}
  </g>
  <g transform="translate(540,318) rotate(-8)"><g class="s pop" data-s="4"><rect x="-70" y="-20" width="140" height="40" rx="8" fill="none" stroke="${C.hat}" stroke-width="3.5"/><text x="0" y="6" text-anchor="middle" class="bp stamp">PLAN READY</text></g></g>
  ${builder(712, 318, 1.55, true, 'pencil')}`;
}

function setup(): string {
  const stakes = [[202, 322], [598, 322], [160, 392], [640, 392]].map(([x, y], i) => `<rect class="s drop" data-s="1" style="transition-delay:${i * 0.12}s" x="${x}" y="${y}" width="7" height="30" rx="2" fill="${C.woodDark}"/>`).join('');
  return `${bg()}
  <path d="M196 344H604L650 414H150Z" fill="${C.soil}"/><path d="M196 344H604L612 356H188Z" fill="#fff" opacity=".12"/>
  <path class="s draw" data-s="1" pathLength="1" d="M205 327H601L643 397H163Z" fill="none" stroke="#fff8e0" stroke-width="2.5"/>
  ${stakes}
  <g class="s growx" data-s="2"><path d="M232 352H568L594 398H206Z" fill="${C.concrete}"/><path d="M206 398H594V409H206Z" fill="${C.concreteDark}"/></g>
  <g class="s slide" data-s="3">
    <rect x="662" y="318" width="52" height="46" rx="4" fill="${C.wood}" stroke="${C.woodDark}" stroke-width="3"/><path d="M662 318l52 46M714 318l-52 46" stroke="${C.woodDark}" stroke-width="3"/>
    <rect x="700" y="290" width="46" height="40" rx="4" fill="${C.wood}" stroke="${C.woodDark}" stroke-width="3"/><path d="M700 310h46" stroke="${C.woodDark}" stroke-width="3"/>
    <rect x="724" y="344" width="50" height="26" rx="5" fill="${C.roof}"/><rect x="741" y="336" width="16" height="10" rx="3" fill="none" stroke="${C.roofDark}" stroke-width="3"/><rect x="745" y="353" width="8" height="6" rx="1" fill="${C.hat}"/>
  </g>
  <g transform="translate(400,352)"><g class="s pop" data-s="4"><rect x="-2" y="-66" width="4" height="70" fill="${C.line}"/><path d="M2 -66l40 13-40 13z" fill="${C.hat}"/>
    <path d="M-70 -30l3 7 7 3-7 3-3 7-3-7-7-3 7-3zM86 -50l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="#fff"/></g></g>
  ${builder(108, 318, 1.55)}`;
}

function look(): string {
  const bricks = [[270, 300], [300, 318], [500, 304], [520, 222], [290, 222], [440, 318]].map(([x, y]) => `<path d="M${x} ${y}h22" stroke="${C.woodDark}" stroke-width="3" opacity=".45" stroke-linecap="round"/>`).join('');
  return `${bg()}
  <path class="s" data-s="4" d="M384 350h32l26 100h-84z" fill="#eadfc4"/>
  <rect x="236" y="338" width="328" height="14" rx="3" fill="${C.concrete}"/>
  <g stroke="${C.woodDark}" stroke-width="5" stroke-linecap="round"><path d="M196 350V190M228 350V190M190 300h44M190 240h44"/></g>
  <g class="s drop" data-s="3"><rect x="468" y="128" width="28" height="60" fill="${C.roofDark}"/></g>
  <g class="s rise" data-s="1"><rect x="250" y="200" width="300" height="140" fill="${C.wallRaw}"/>${bricks}</g>
  <rect class="s" data-s="4" x="250" y="200" width="300" height="140" fill="${C.wall}"/>
  <g class="s pop" data-s="2"><rect x="378" y="266" width="44" height="74" rx="4" fill="${C.door}"/><circle cx="412" cy="305" r="3.5" fill="${C.hat}"/></g>
  <g class="s pop" data-s="2" style="transition-delay:.15s">${win(284, false)}</g>
  <g class="s pop" data-s="2" style="transition-delay:.3s">${win(464, false)}</g>
  <g class="s drop" data-s="3"><path d="M226 206L400 106l174 100z" fill="${C.roof}"/></g>
  <g class="s pop" data-s="4">${flowers(284)}</g><g class="s pop" data-s="4" style="transition-delay:.15s">${flowers(464)}</g>
  ${builder(140, 318, 1.55)}`;
}

function logic(): string {
  const bulb = (x: number, s: number) => `<path d="M${x} 207v14" stroke="${C.line}" stroke-width="2.5"/><circle cx="${x}" cy="232" r="11" fill="#d7d7d0" stroke="${C.line}" stroke-width="2"/>
    <g class="s" data-s="${s}"><circle class="glow" cx="${x}" cy="232" r="34" fill="${C.lit}" opacity=".4"/><circle cx="${x}" cy="232" r="11" fill="${C.lit}" stroke="${C.line}" stroke-width="2"/></g>`;
  const wire = (d: string, s: number) => `<path class="s draw" data-s="${s}" pathLength="1" d="${d}" fill="none" stroke="${C.line}" stroke-width="4" stroke-linejoin="round"/>
    <path class="s flow" data-s="${s}" d="${d}" fill="none" stroke="${C.hat}" stroke-width="2.5" stroke-linejoin="round"/>`;
  return `${bg()}
  <rect x="236" y="338" width="328" height="14" rx="3" fill="${C.concrete}"/>
  <rect x="468" y="128" width="28" height="60" fill="${C.roofDark}"/>
  <path d="M226 206L400 106l174 100z" fill="${C.roof}"/>
  <rect x="250" y="204" width="300" height="136" fill="#fff8e6" stroke="${C.line}" stroke-width="5"/>
  <path d="M400 204V290" stroke="${C.line}" stroke-width="4"/>
  <rect x="268" y="312" width="64" height="26" rx="8" fill="${C.hill}"/><rect x="264" y="300" width="14" height="38" rx="6" fill="${C.hill2}"/><rect x="322" y="300" width="14" height="38" rx="6" fill="${C.hill2}"/>
  <rect x="436" y="312" width="60" height="6" rx="2" fill="${C.wood}"/><path d="M444 318v20M488 318v20" stroke="${C.woodDark}" stroke-width="4"/>
  ${wire('M527 268V214H325V221', 1)}
  <g class="s pop" data-s="1"><rect x="514" y="268" width="26" height="36" rx="3" fill="#5b6b7a"/><path d="M521 278h12M521 286h12M521 294h12" stroke="${C.hat}" stroke-width="3" stroke-linecap="round"/></g>
  ${wire('M269 276V219H475V221', 3)}
  <g class="s pop" data-s="3"><rect x="261" y="274" width="16" height="24" rx="3" fill="#fff" stroke="${C.line}" stroke-width="2"/><rect x="266" y="279" width="6" height="9" rx="1.5" fill="${C.green}"/></g>
  ${bulb(325, 2)}${bulb(475, 4)}
  <g class="s pop" data-s="4"><path d="M610 180l4 9 9 4-9 4-4 9-4-9-9-4 9-4zM196 150l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff"/></g>
  ${builder(150, 318, 1.55)}`;
}

function memory(): string {
  const box = (x: number, y: number, color: string, s: number, d: number) => `<g class="s drop" data-s="${s}" style="transition-delay:${d}s">
    <rect x="${x}" y="${y}" width="84" height="58" rx="5" fill="${color}" stroke="${C.line}" stroke-width="2.5"/>
    <rect x="${x + 18}" y="${y + 16}" width="48" height="24" rx="3" fill="#fffdf5"/><path d="M${x + 25} ${y + 24}h34M${x + 25} ${y + 32}h22" stroke="${C.line}" stroke-width="2.5" stroke-linecap="round" opacity=".6"/></g>`;
  const planks = [...Array(6)].map((_, i) => `<path d="M${i * 150 - 30} 372l-40 78" stroke="${C.woodDark}" stroke-width="2" opacity=".5"/>`).join('');
  return `<rect width="800" height="450" fill="#f4e8cf"/><rect y="300" width="800" height="72" fill="#ecdcbb"/>
  <rect y="372" width="800" height="78" fill="${C.wood}"/>${planks}
  <rect x="610" y="60" width="130" height="104" rx="6" fill="${C.sky1}" stroke="#fff" stroke-width="8"/><path d="M675 60v104M610 112h130" stroke="#fff" stroke-width="5"/><circle cx="706" cy="88" r="13" fill="${C.sun}"/>
  <g class="s rise" data-s="1" fill="${C.woodDark}"><rect x="128" y="78" width="14" height="296"/><rect x="518" y="78" width="14" height="296"/>
    <rect x="128" y="78" width="404" height="12"/><rect x="128" y="172" width="404" height="12"/><rect x="128" y="266" width="404" height="12"/><rect x="128" y="360" width="404" height="14"/></g>
  ${box(160, 114, C.hill, 2, 0)}${box(262, 114, C.hat, 2, 0.15)}${box(400, 114, C.glass, 2, 0.3)}
  ${box(160, 208, C.glass, 3, 0)}${box(280, 208, C.hill, 3, 0.15)}
  <g class="s drop" data-s="3" style="transition-delay:.3s">${[0, 1, 2, 3, 4].map((i) => `<rect x="${404 + i * 20}" y="${[204, 212, 200, 208, 204][i]}" width="16" height="${[62, 54, 66, 58, 62][i]}" rx="2" fill="${[C.roof, C.pants, C.hat, C.green, C.vest][i]}" stroke="${C.line}" stroke-width="2"/>`).join('')}</g>
  <g transform="translate(232,318)"><g class="s pop" data-s="4"><rect x="-72" y="-36" width="144" height="76" rx="8" fill="#5b6b7a" stroke="${C.line}" stroke-width="3"/>
    <circle cx="0" cy="0" r="17" fill="${C.hat}" stroke="${C.line}" stroke-width="3"/><rect x="-3" y="-3" width="6" height="13" rx="2" fill="${C.line}"/><circle cx="0" cy="-4" r="5" fill="${C.line}"/></g></g>
  <g transform="translate(446,318)"><g class="s pop" data-s="4" style="transition-delay:.2s"><circle r="24" fill="${C.green}"/><path d="M-10 0l7 8 13-16" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g></g>
  ${builder(640, 330, 1.75, true)}`;
}

function check(): string {
  const rows = [0, 1, 2].map((i) => `<rect x="26" y="${46 + i * 50}" width="26" height="26" rx="5" fill="none" stroke="${C.line}" stroke-width="2.5"/>
    <rect x="64" y="${51 + i * 50}" width="${[88, 72, 82][i]}" height="7" rx="3.5" fill="#cfc8b4"/><rect x="64" y="${63 + i * 50}" width="${[56, 64, 44][i]}" height="5" rx="2.5" fill="#e2dccb"/>
    <path class="s draw" data-s="${i + 1}" pathLength="1" d="M31 ${59 + i * 50}l7 8 14-18" fill="none" stroke="${C.green}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `${bg(false)}
  <g transform="translate(-130,0)">${house(false)}</g>
  <g transform="translate(180,236)"><g class="magnifier"><circle r="34" fill="#fff" opacity=".28"/><circle r="34" fill="none" stroke="${C.line}" stroke-width="6"/><path d="M24 24l26 26" stroke="${C.line}" stroke-width="9" stroke-linecap="round"/></g></g>
  <g transform="translate(572,64)">
    <rect width="180" height="246" rx="12" fill="${C.woodDark}"/><rect x="12" y="20" width="156" height="214" rx="5" fill="#fffdf5"/><rect x="58" y="-10" width="64" height="26" rx="7" fill="#5b6b7a"/>
    ${rows}
    <g transform="translate(90,205) rotate(-9)"><g class="s pop" data-s="4"><rect x="-62" y="-19" width="124" height="38" rx="7" fill="#fffdf5" stroke="${C.green}" stroke-width="4"/><text x="0" y="7" text-anchor="middle" class="stamp-text">PASSED</text></g></g>
  </g>
  ${builder(500, 318, 1.55, true, 'pencil')}`;
}

function done(): string {
  const colors = [C.hat, C.vest, C.green, C.glass, '#e56b8a', '#fff'];
  const confetti = [...Array(34)].map((_, i) => {
    const x = (i * 97 + 31) % 800, d = ((i * 53) % 40) / 10, w = 6 + (i % 3) * 3;
    return `<rect class="confetti" x="${x}" y="-20" width="${w}" height="${w + 4}" rx="1.5" fill="${colors[i % colors.length]}" style="animation-delay:${d}s;animation-duration:${3.2 + (i % 5) * 0.5}s"/>`;
  }).join('');
  const bunting = [...Array(11)].map((_, i) => { const x = 130 + i * 54, y = 62 + Math.sin((i / 10) * Math.PI) * 26; return `<path d="M${x - 14} ${y}h28l-14 24z" fill="${colors[i % 5]}"/>`; }).join('');
  return `${bg()}
  <path d="M110 60Q400 124 690 60" fill="none" stroke="${C.line}" stroke-width="2"/>${bunting}
  <g class="smoke" fill="#fff"><circle cx="482" cy="118" r="9"/><circle cx="490" cy="118" r="7"/><circle cx="478" cy="118" r="6"/></g>
  ${house(true)}
  ${[170, 196, 222, 596, 622, 648].map((x, i) => `<path d="M${x} 356v-22" stroke="${C.green}" stroke-width="3"/><circle cx="${x}" cy="330" r="7" fill="${['#e56b8a', C.hat, C.vest][i % 3]}"/><circle cx="${x}" cy="330" r="2.5" fill="#fff"/>`).join('')}
  <rect x="372" y="340" width="56" height="9" rx="3" fill="${C.roof}"/>
  ${builder(716, 318, 1.55, true, 'wave')}
  ${confetti}`;
}

const DRAW: Record<StageId, () => string> = { plan, setup, look, logic, memory, check, done };

/** The whole drawing for one stage, as an SVG string. */
export function scene(stage: StageId): string {
  return `<svg class="scene-svg" data-stage="${stage}" viewBox="0 0 800 450" role="img" aria-hidden="true">${DRAW[stage]()}</svg>`;
}

/** Shows the first `n` steps of the drawing inside `root`. */
export function setSteps(root: Element, n: number) {
  root.querySelectorAll<SVGElement>('[data-s]').forEach((el) => el.classList.toggle('on', Number(el.dataset.s) <= n));
}
