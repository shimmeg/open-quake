'use strict';
/*
 * PolyForm Noncommercial 1.0.0 — see ../src/LICENSE.
 * This standalone script embeds the DK-QUAKE / ARIS-68 protocol (frame format,
 * opcodes, parse) reverse-engineered from DK-Suite V0.4.35 — the vendor's
 * restricted-for-commercial component. Noncommercial use only.
 */
// Write-path test: send safe QUERY short-commands to the control interface and read replies.
const HID = require('node-hid');

const all = HID.devices();
// Control interface = vendor collection uP=0xFF60 on QUAKE (16728/20811) or ARIS-68 (20498/26647).
const ctrl =
  all.find(d => d.vendorId === 16728 && d.productId === 20811 && d.usagePage === 0xff60) ||
  all.find(d => d.vendorId === 20498 && d.productId === 26647 && d.usagePage === 0xff60) ||
  all.find(d => d.vendorId === 20498 && d.productId === 26647);
if (!ctrl) { console.log('Control interface not found.'); process.exit(1); }

console.log(`Opening control: ${ctrl.product} VID=${ctrl.vendorId} PID=${ctrl.productId} uP=0x${(ctrl.usagePage||0).toString(16)}`);
const dev = new HID.HID(ctrl.path);

const hex = b => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(' ');
function decode(b) {
  if (b[0] !== 0xA3) return '(non-A3)';
  const len = b[1], op = b[2], cmd = b[3], sub = Array.from(b.slice(4, 4 + Math.max(0, len - 2)));
  if (op === 0x55) {
    if (cmd === 0x2E) return `FIRMWARE name=${sub[0]} version=${sub[1]}.${sub[2]}.${sub[3]}`;
    if (cmd === 0x03) return `MIC ${sub[0] === 1 ? 'ON' : 'OFF'}`;
    if (cmd === 0x05) return `LUMINANCE=${sub[0]}`;
    if (cmd === 0xEF) return 'keep-alive PONG';
    return `STATE 0x55 cmd=0x${cmd.toString(16)} sub=[${sub}]`;
  }
  if (op === 3) return cmd === 1 ? 'KNOB rotate' : cmd === 2 ? 'KNOB press' : `op3 cmd=${cmd}`;
  return `op=0x${op.toString(16)} cmd=0x${cmd.toString(16)} sub=[${sub}]`;
}

dev.on('data', buf => console.log(`   <= ${hex(buf.slice(0, 12))}   ${decode(buf)}`));
dev.on('error', e => console.log('   ERROR', e.message));

// Build a 0xA3 short-command frame: [0xA3, data.len+1, opCode, ...data, (opCode+Σdata)%255]
function a3(opCode, data) {
  let sum = opCode; for (const d of data) sum += d;
  return [0xA3, data.length + 1, opCode, ...data, sum % 0xFF];
}
function send(label, frame) {
  console.log(`=> ${label.padEnd(16)} ${hex(frame)}`);
  dev.write([0x00, ...frame]); // prepend report-id 0x00 (matches app's sendShortCMD)
}

setTimeout(() => send('FIRMWARE QUERY',  a3(0x02, [0x2E])), 300);
setTimeout(() => send('MIC QUERY',       a3(0x02, [0x03])), 800);
setTimeout(() => send('LUMINANCE QUERY', a3(0x02, [0x05])), 1300);
setTimeout(() => send('KEEP-ALIVE PING', a3(0x02, [0xEF])), 1800);
setTimeout(() => { console.log('--- done ---'); try { dev.close(); } catch {} process.exit(0); }, 3000);
