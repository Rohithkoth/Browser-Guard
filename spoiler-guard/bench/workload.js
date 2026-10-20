// Simulates YouTube-like page activity and counts how often card text is read
// (the expensive step). Usage: node bench/workload.js
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

// SCANNER=<path> benchmarks a different scanner.js, e.g. an older version.
const scannerPath = process.env.SCANNER || path.join(__dirname, '..', 'src/shared/scanner.js');
const FILES = ['src/shared/normalize.js', 'src/shared/rules.js', 'src/shared/overlay.js']
  .map((f) => path.join(__dirname, '..', f))
  .concat([scannerPath, path.join(__dirname, '..', 'src/shared/details.js'), path.join(__dirname, '..', 'src/platforms/youtube.js')])
  .map((f) => fs.readFileSync(f, 'utf8'));

const card = (i, title) =>
  `<ytd-rich-item-renderer id="c${i}"><yt-lockup-view-model><a id="thumb${i}" href="/watch?v=vid${i}"><img alt=""></a>` +
  `<div class="overlays"></div><h3><a title="${title}">${title}</a></h3><span class="views">${i}K views</span>` +
  `</yt-lockup-view-model></ytd-rich-item-renderer>`;

async function run() {
  const cards = Array.from({ length: 200 }, (_, i) => card(i, i % 10 === 0 ? `Avengers Doomsday clip ${i}` : `Cooking video ${i}`)).join('');
  const dom = new JSDOM(`<!doctype html><body><div id="player"><span id="time">0:00</span></div><div id="grid">${cards}</div></body>`, {
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  for (const code of FILES) w.eval(code);
  const SG = w.SpoilerGuard;

  let reads = 0;
  const adapter = { ...SG.platforms.youtube, getText: (c) => { reads++; return SG.collectText(c); } };
  const scanner = SG.createScanner(adapter, w.document);
  const rules = [{ id: 'a', name: 'Avengers', keywords: ['Avengers Doomsday'], enabled: true, expiresAt: null }];
  const tick = () => new Promise((r) => setTimeout(r, 20));

  const t0 = performance.now();
  scanner.setRules(SG.compileRules(rules, Date.now()));
  const initialReads = reads;

  // 1. Playing video: timer text changes outside any card, 60 times.
  for (let s = 0; s < 60; s++) { w.document.getElementById('time').textContent = `0:${s}`; await tick(); }
  const afterPlayer = reads;

  // 2. Hovering: YouTube adds/removes hover overlays inside a card, many times per frame.
  for (let i = 0; i < 40; i++) {
    const ov = w.document.querySelector(`#c${i} .overlays`);
    for (let k = 0; k < 10; k++) { ov.innerHTML = `<div>Keep hovering to play</div>`; ov.innerHTML = ''; }
    await tick();
  }
  const afterHover = reads;

  // 2b. Hover animation: changes inside one card spread over many small tasks
  // within a few frames, like YouTube's hover progress and preview overlays.
  const ov0 = w.document.querySelector('#c1 .overlays');
  const hoverStart = reads;
  await new Promise((done) => {
    let n = 0;
    const step = () => { ov0.innerHTML = `<div style="width:${n}%"></div>`; if (++n < 200) setTimeout(step, 0); else done(); };
    step();
  });
  await tick();
  const hoverAnimReads = reads - hoverStart;

  // 3. Re-applying identical rules (what happened on every tab switch).
  for (let i = 0; i < 5; i++) scanner.setRules(SG.compileRules(rules, Date.now()));
  const afterReapply = reads;
  void afterReapply;

  // 4. Recycled card: same element now shows a different (spoiler) video.
  const c5 = w.document.getElementById('c5');
  c5.querySelector('#thumb5').setAttribute('href', '/watch?v=other');
  c5.querySelector('h3 a').textContent = 'Avengers Doomsday ending';
  await Promise.resolve();
  const recycledCoveredImmediately = c5.classList.contains('sg-concealed');
  await tick();

  const covered = w.document.querySelectorAll('.sg-concealed').length;
  const ms = (performance.now() - t0).toFixed(0);
  console.log(JSON.stringify({
    initialReads, playerReads: afterPlayer - initialReads, hoverReads: afterHover - afterPlayer,
    hoverAnimReads, reapplyReads: afterReapply - afterHover - hoverAnimReads, recycledCoveredImmediately, covered, ms,
  }));
  scanner.stop();
  w.close();
}
run();
