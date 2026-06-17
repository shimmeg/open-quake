'use strict';
/*
 * PolyForm Noncommercial 1.0.0 — see ../src/LICENSE.
 * This standalone script embeds the DK-QUAKE / ARIS-68 protocol (frame format,
 * opcodes, parse) reverse-engineered from DK-Suite V0.4.35 — the vendor's
 * restricted-for-commercial component. Noncommercial use only.
 */
// Live protocol probe for the ARIS-68 / Quake device.
// Opens every HID collection of the device's VID/PIDs, prints raw hex + a best-effort
// decode using the reverse-engineered protocol. Interact with the device to validate.
const HID = require('node-hid');

const TARGETS = [
  { vid: 20498, pid: 26647, label: 'CONTROL' },   // 0x5012 / 0x6817
  { vid: 1810,  pid: 16,    label: 'TOUCH'   },   // 0x0712 / 0x0010
  { vid: 16728, pid: 20811, label: 'QUAKE'   },   // 0x4158 / 0x514B
];

const td = new TextDecoder();
const hex = b => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(' ');
const beInt = arr => { let v = 0; for (const x of arr) v = (v << 8) | (x & 0xFF); return v >>> 0; };

function decodeTouch(b) {
  if (b[0] !== 0xA3 || b[3] !== 0x1A) return null;
  const count = b[4], o = 5, pts = [];
  for (let n = 0; n < count; n++) {
    const t = 5 * n;
    const action = b[o + t];
    const y = beInt([b[o + t + 2], b[o + t + 1]]);
    const x = beInt([b[o + t + 4], b[o + t + 3]]);
    pts.push(`{${action ? 'DOWN' : 'up'} x=${x} y=${y}}`);
  }
  return `TOUCH n=${count} ${pts.join(' ')}`;
}

function decodeControl(b) {
  switch (b[0]) {
    case 0x01: {
      for (let i = 0; i < 15; i++) if (b[4 + i] === 0x01) return `KEY DOWN row,col=${Math.floor(i / 5) + 1},${(i % 5) + 1}`;
      return 'KEY up';
    }
    case 0xA1: {
      const len = beInt([b[1], b[2]]);
      try { return 'JSON ' + td.decode(b.slice(3, 3 + len)); } catch { return 'JSON(parse-fail)'; }
    }
    case 0xA3: {
      const len = b[1], op = b[2], cmd = b[3];
      const sub = Array.from(b.slice(4, 4 + Math.max(0, len - 2)));
      if (op === 3) {
        if (cmd === 1) return `KNOB ROTATE dir=${sub[0] === 1 ? 'A' : 'B'}  sub=[${sub}]`;
        if (cmd === 2) return `KNOB PRESS knob=${sub[0]}  sub=[${sub}]`;
        return `op3 cmd=${cmd} sub=[${sub}]`;
      }
      if (op === 0x55) {
        if (cmd === 0x2E) return `FIRMWARE name=${sub[0]} ver=${sub[1]}.${sub[2]}.${sub[3]}`;
        if (cmd === 0x03) return `MIC ${sub[0] === 1 ? 'ON' : 'OFF'}`;
        if (cmd === 0x05) return `LUMINANCE=${sub[0]}`;
        if (cmd === 0xEF) return 'keep-alive PONG';
        return `STATE 0x55 cmd=0x${cmd.toString(16)} sub=[${sub}]`;
      }
      return `shortCMD op=0x${op.toString(16)} cmd=0x${cmd.toString(16)} sub=[${sub}]`;
    }
    default: return null;
  }
}

const all = HID.devices();
const matches = [];
for (const t of TARGETS)
  for (const d of all.filter(d => d.vendorId === t.vid && d.productId === t.pid))
    matches.push({ ...t, dev: d });

if (!matches.length) {
  console.log('!! No ARIS-68 interfaces found. All HID devices present:');
  all.forEach(d => console.log(`   vid=${d.vendorId} pid=${d.productId} uP=0x${(d.usagePage||0).toString(16)} u=0x${(d.usage||0).toString(16)} ${d.product||''}`));
  process.exit(0);
}

console.log('Found interfaces:');
matches.forEach((m, i) => console.log(`  [${i}] ${m.label}  uP=0x${(m.dev.usagePage||0).toString(16)} u=0x${(m.dev.usage||0).toString(16)}  product=${m.dev.product||'?'}`));
console.log('\n=== Listening. Turn the knob, press keys, drag on the touchscreen. (Ctrl-C to stop) ===\n');

for (const m of matches) {
  const tag = `${m.label}/0x${(m.dev.usagePage||0).toString(16)}`;
  let dev;
  try { dev = new HID.HID(m.dev.path); }
  catch (e) { console.log(`[SKIP] ${tag}: ${e.message}`); continue; }
  dev.on('data', buf => {
    const dec = decodeTouch(buf) || decodeControl(buf) || '(undecoded)';
    console.log(`[${tag}] len=${buf.length} hex: ${hex(buf.slice(0, 32))}${buf.length > 32 ? ' …' : ''}\n        => ${dec}`);
  });
  dev.on('error', e => console.log(`[${tag}] ERROR ${e.message}`));
}
setInterval(() => {}, 1 << 30);
