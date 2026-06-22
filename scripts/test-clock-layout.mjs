#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const clockUrl = new URL('../apps/clock.html#mode=24&seconds=0&date=1', import.meta.url).href;
const port = Number(process.env.OPEN_QUAKE_CLOCK_TEST_PORT || 9334);

function chromeCandidates() {
  const env = process.env.CHROME_BIN ? [process.env.CHROME_BIN] : [];
  if (process.platform === 'darwin') {
    env.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    env.push('/Applications/Chromium.app/Contents/MacOS/Chromium');
    env.push('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser');
    env.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  } else if (process.platform === 'win32') {
    env.push('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
    env.push('C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe');
  } else {
    env.push('/usr/bin/google-chrome');
    env.push('/usr/bin/chromium');
    env.push('/usr/bin/chromium-browser');
  }
  return env;
}

function findChrome() {
  return chromeCandidates().find(candidate => fs.existsSync(candidate));
}

async function fetchJson(pathname, options) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}

async function waitForChrome() {
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await fetchJson('/json/version');
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw lastError || new Error('Chrome did not expose DevTools in time');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;

    ws.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = ++seq;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { res, rej, method }));
        },
        close() {
          ws.close();
        },
      });
    });

    ws.addEventListener('error', reject);
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) task.rej(new Error(`${task.method}: ${message.error.message}`));
      else task.res(message.result);
    });
  });
}

async function measureLayout(cdp, viewport, time) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send('Page.navigate', { url: clockUrl });
  await new Promise(resolve => setTimeout(resolve, 250));

  const expression = `(() => new Promise(resolve => {
    (async () => {
      settings.mode = '24';
      settings.seconds = false;
      settings.date = true;
      build();
      setCard('h0', '${time.hour[0]}');
      setCard('h1', '${time.hour[1]}');
      setCard('m0', '${time.minute[0]}');
      setCard('m1', '${time.minute[1]}');

      const clock = document.getElementById('clock').getBoundingClientRect();
      const cards = Array.from(document.querySelectorAll('.card')).map((card, index) => {
        const rect = card.getBoundingClientRect();
        return {
          index,
          text: card.querySelector('.half.top .d').textContent,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          overflowsViewport: rect.left < -0.5 || rect.right > innerWidth + 0.5,
        };
      });

      resolve({
        innerWidth,
        innerHeight,
        clock: {
          left: clock.left,
          right: clock.right,
          width: clock.width,
          overflowsViewport: clock.left < -0.5 || clock.right > innerWidth + 0.5,
        },
        cards,
      });
    })();
  }))()`;
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails, null, 2));
  return result.result.value;
}

// 12h mode renders the hour as ONE wide card holding the whole hour ("1".."12"). Two-digit hours
// (10/11/12) must fit that card at --fs without being clipped by the card's overflow:hidden.
async function measureHourCard(cdp, viewport, hour) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: clockUrl });
  await new Promise(resolve => setTimeout(resolve, 250));
  const expression = `(() => {
    settings.mode = '12'; settings.seconds = false; settings.date = true; build();
    setCard('hh', ${JSON.stringify(hour)});
    const card = cards['hh'];
    const cs = getComputedStyle(document.documentElement);
    const fs = cs.getPropertyValue('--fs').trim();
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-weight:700;font-variant-numeric:tabular-nums;font-size:' + fs + ';font-family:' + getComputedStyle(card).fontFamily;
    probe.textContent = ${JSON.stringify(hour)}; document.body.appendChild(probe);
    const textW = probe.getBoundingClientRect().width; probe.remove();
    const rect = card.getBoundingClientRect();
    return { hour: ${JSON.stringify(hour)}, cardWidth: rect.width, textWidth: textW, clipped: textW > rect.width + 0.5, overflowsViewport: rect.left < -0.5 || rect.right > innerWidth + 0.5 };
  })()`;
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails, null, 2));
  return result.result.value;
}

async function main() {
  const chrome = findChrome();
  assert.ok(chrome, 'Chrome/Chromium not found; set CHROME_BIN to run the clock layout test');
  assert.ok(fs.existsSync(path.join(root, 'apps/clock.html')), 'test must run from the repository root');

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-quake-clock-layout-'));
  const child = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  try {
    await waitForChrome();
    const target = await fetchJson('/json/new?' + encodeURIComponent(clockUrl), { method: 'PUT' });
    const cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const viewports = [
      { name: 'landscape panel', width: 1920, height: 480 },
      { name: 'portrait panel', width: 480, height: 1920 },
    ];
    const times = [
      { label: '17:59', hour: '17', minute: '59' },
      { label: '18:01', hour: '18', minute: '01' },
    ];

    for (const viewport of viewports) {
      for (const time of times) {
        const layout = await measureLayout(cdp, viewport, time);
        assert.equal(layout.cards.length, 4, `${viewport.name} ${time.label}: 24h clock must render four digit cards`);
        assert.deepEqual(layout.cards.map(card => card.text), [...time.hour, ...time.minute], `${viewport.name} ${time.label}: digit order`);
        assert.equal(layout.clock.overflowsViewport, false, `${viewport.name} ${time.label}: clock overflows viewport ${JSON.stringify(layout.clock)}`);
        assert.equal(layout.cards.some(card => card.overflowsViewport), false, `${viewport.name} ${time.label}: a digit card overflows viewport ${JSON.stringify(layout.cards)}`);
      }
    }

    // 12h mode: the single wide hour card must hold two-digit hours (10/11/12) without clipping.
    for (const viewport of viewports) {
      for (const hour of ['10', '11', '12']) {
        const m = await measureHourCard(cdp, viewport, hour);
        assert.equal(m.clipped, false, `${viewport.name} 12h ${hour}: hour digits clipped by the card ${JSON.stringify(m)}`);
        assert.equal(m.overflowsViewport, false, `${viewport.name} 12h ${hour}: hour card overflows viewport ${JSON.stringify(m)}`);
      }
    }

    cdp.close();
    console.log('Clock layout tests passed.');
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
