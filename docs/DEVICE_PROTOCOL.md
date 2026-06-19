# ARIS-68 / Quake device protocol — reverse-engineered from DK-Suite V0.4.35

Sources: recovered clean `src/main/DeviceControl/Connections/ProtocolUtil.js` (frame format) + beautified `background.js` (connection, semantics). Runtime in product: Electron 39 / node-hid 3.3.0 — but plain HID, so node-hid 2.x/3.x both work.
Goal: rebuild an open driver that drives the ARIS-68 (touchscreen + knob + mic) for non-commercial use.

## 1. Identity — composite device, TWO HID interfaces (`SUPPORTED_VPID`/`TOUCH_HID_DEVICE`, blob L247-255)

| Interface | VID | PID | usage | usagePage | Carries |
|---|---|---|---|---|---|
| **Control** (ARIS-68) | 20498 `0x5012` | 26647 `0x6817` | — | — | keys, knob, mic/state, firmware, **display** |
| **Touch** | 1810 `0x0712` | 16 `0x0010` | 113 `0x71` | 65395 `0xFF73` | multi-touch points |
| Quake-HID (1-iface variant) | 16728 `0x4158` | 20811 `0x514B` | 97 `0x61` | 65376 `0xFF60` | all-in-one |

Your `hotlotus` (VID 1810) = the touch interface. Models: `ARIS-68`, `Quake-HID`.

## 2. Connection (blob: control L32603-32733, touch L25293-25347)
- **Control:** poll `HID.devices()` every 5 s → filter `SUPPORTED_VPID` (VID+PID, optional usage/usagePage) → `new HID(path)` (`{nonExclusive:true}` on macOS) → `on("data")` → `checkDataValid()` → listeners. EIO ("could not read from HID device"): 3 errors/10 s ⇒ reconnect w/ backoff.
- **Touch:** poll every 2 s → find `TOUCH_HID_DEVICE` → `new HID(path)` → `on("data")` → `_checkAndConvertToCoordinate()`. Rebind 2 s after error.
- **All outgoing writes prepend report-id `0x00`:** `device.write([0x00, ...frame])` (macOS retries 3×).

## 3. Frame format (`ProtocolUtil.js`, clean source) — all multi-byte fields BIG-ENDIAN

### Parse — `checkDataValid(bytes)`, switch `bytes[0]`:
- **`0x01` keys:** scan `bytes[4..18]` (15); `0x01` at index `i` ⇒ key `row,col = ⌊i/5⌋+1, (i%5)+1`.
- **`0xA1` JSON:** `len=BE(bytes[1..2])`; verify checksum; `JSON.parse(utf8(bytes[3 .. 3+len]))`.
- **`0xA2` resource (in):** `len=BE(bytes[1..2])`; `opCode=bytes[3]`; if `0x02` ⇒ `{resourceType:bytes[4], keyCode:"bytes[5],bytes[6]", seq:bytes[9], raw:bytes[10..len-1]}`.
- **`0xA3` short cmd:** `len=bytes[1]`; checksum(start=2); `opCode=bytes[2]`, `cmdID=bytes[3]`, `subData=bytes[4 .. 4+len-2]` ⇒ `{type:'shortCMD', opCode, cmdID, subData}`.
- **Checksum:** `Σ(len bytes from startIdx) % 0xFF == bytes[startIdx+len]`; `startIdx` = 3 for A1/A2, 2 for A3.

### Wrap — `wrapData(type, data, opCode, resInfo, seq)`:
- **`0xA1`:** `[0xA1, BE(len,2), ...utf8(data), Σdata%255]`.
- **`0xA2`:** `[0xA2, BE(data.len+7,2), opCode, ...resInfo, seq(1B), ...data, Σ%255]`. For `opCode 0x02` (raw): `resInfo = resType(1B) + row(1B) + col(1B) + [0,0]`; `data` = **JPEG bytes** (`RES_TYPE_JPEG=0x00`).
- **`0xA3`:** `[0xA3, (data.len+1)(1B), opCode, ...data, (opCode+Σdata)%255]`.

## 4. Incoming events
**Control** (`QuakeMainController.handleDeviceData`, blob L25580) — frames are `0xA3` short-cmds:
- `opCode 3` **knob**: `cmdID 1` = rotate (`subData[0]`: 1=dir-A else dir-B); `cmdID 2` = press (`subData[0]`=knob idx).
- `opCode 0x55` **state**: `cmdID 0` = state-sync ack (`subData[0]==0x90`⇒busy) / mic-change result; `3` = mic (`subData[0]`:1=on); `5` = luminance (0-255); `0xEF` = keep-alive **pong**; `0x2E` = name + **firmware** `subData[1].subData[2].subData[3]`.
- `0x01` frame = key press (§3).

**Touch** (`_checkAndConvertToCoordinate`, blob L25324): `bytes[0]=0xA3`, `bytes[3]=0x1A`, `bytes[4]=count`; per finger (5 B @ offset `5+5n`): `[action(1=down/0=up), yLo, yHi, xLo, xHi]`, x/y 16-bit. Nearest-neighbour touch-ID tracking (dist≤99); `setHoldToTalkTouchCaptureActive` suppresses idle-up (mic push-to-talk). Emitted to renderer as `touch-event` (origin bottom-left).

## 5. Outgoing commands
- `sendShortCMD(sn, wrapData(0xA3, dataArr, opCode))` → e.g. **enter DFU**: `wrapData(0xA3,[0x2F,0x03],1)`.
- `sendData(sn, jsonStr)` = `0xA1`.
- `sendResource(sn, jpegBytes, 0x02, "0-RC", seq)` = `0xA2` ⇒ **push a JPEG to key Row,Col** (the display pipeline's wire op).
- mic/luminance/buzzer SET = `0x55` short-cmds (exact subData: derive from the senders — TODO §7).

## 6. Subsystems mapped to the 3 goals
- **Touchscreen IN** = touch interface (§4). **Touchscreen OUT** = render key grid in a "RemoteScreen" Electron window → per-key JPEG → `sendResource` `0xA2`.
- **Knob** = control `opCode 3`.
- **Mic** = the panel's **"5- USB PnP Audio Device"** (standard USB audio input — confirmed working with LibreWhisper; any app reads it directly, no custom wiring). The `0x55/0x03` protocol cmd reports/toggles its on/off state.
- **Keep-alive** = periodic ping; pong `0x55/0xEF`.

## 7. VALIDATED against real hardware (live `node-hid` probe)

Device present as **QUAKE** (VID 0x4158/0x514B, control on `uP=0xFF60`) + **hotlotus** touchscreen (VID 0x0712/0x0010, touch on `uP=0xFF73`). Decode confirmed exactly:
- **Knob rotate**: `a3 03 03 01 0X` — opCode 3, cmdID 1, `subData[0]` = 1 (dir A) / 2 (dir B). ✅
- **Knob press**: `a3 03 03 02 01` — opCode 3, cmdID 2, `subData[0]` = knob idx (1). ✅
- **Touch**: `a3 1c 03 1a <count> [action,yLo,yHi,xLo,xHi]…` — continuous drag, accurate 16-bit coords. ✅
- **Screen resolution ≈ 1920 × 480** (observed x≤1906, y≤479).
- **No physical keys.** This unit is one big **1920×480 touchscreen + a knob** — touch zones act as the "buttons." Touch + knob is the *complete* input set, and both are validated. (The standard-keyboard HID collection is just the MCU's default descriptor; unused here.)

## 8. Write path — VALIDATED ✅ (bidirectional, live)

Queries = `0xA3` opCode `2`; SETs = `0xA3` opCode `1`. Frame `[0xA3, len, opCode, ...data, ck]`, written as `[0x00, ...frame]`. Confirmed against hardware:
- Firmware query `A3 02 02 2E 30` → `A3 06 55 2E 03 01 00 13` = name 3, **firmware 1.0.19**.
- Mic query `A3 02 02 03 05` → `…55 03 01` = **MIC ON**.
- Luminance query `A3 02 02 05 07` → `…55 05 FF` = **brightness 255**.
- Keep-alive ping `A3 02 02 EF F1` → `…55 EF 00` = **PONG**.

Other senders: buzzer `l(163,[2,tone],1)`; knob-LED `l(163,[6,0/1],1)`; **DFU `l(163,[47,3],1)` — DO NOT SEND**. Keep-alive interval `_.deviceKeepAliveGap`. Brightness SET is opCode 1 / cmd 5 + value (to confirm).

**Buzzer SUSTAINS** — `l(163,[2,tone],1)` turns the buzzer on and it keeps ringing until silenced with tone 0 (`l(163,[2,0],1)`); it is NOT a one-shot beep.

**Mic LED is firmware-coupled to the mic mute — no independent control (probed 2026-06-18, all negative).** Held the mic ON and watched the indicator LED while sending: `0x03` with extra/alt params (`[03,01,00]`, `[03,01,02]`, `[03,02]`), plus every unmapped opCode-1 SET cmdID `0x07`–`0x0D` at both value 0 and 1 — nothing turned the LED off while the audio stayed live. The LED simply tracks the `0x03` mute state in firmware; there is no separate LED on/off or brightness command (DK-Suite exposes none either). **To kill the bright mic LED you must mute the mic.** The LED also only lights once the panel is fully awake — at connect a `0x03` set toggles the audio but the LED is dropped until a later `screenOn` re-syncs it (open-quake re-asserts mic ~2 s after connect for this reason). DFU `0x2F` was never sent during probing.

## 9. Remaining: display output (the last piece)
Wire op = `wrapData(0xA2, jpegBytes, 0x02, "resType-RC", seq)` (per-tile) — but the full 1920×480 Quake screen likely uses a **full-frame** push via the "RemoteScreen" window. Trace `sendResource` / `_checkForQuakeScreen` / `_triggerScreenBindProcess` / RemoteScreen in the blob to get the framing, then push a test image.

## 8. Build plan
1. **Probe** (next): standalone Node script + `node-hid` → open both interfaces, parse, and log decoded **key / knob / touch / firmware** events live → validates this spec against the real device.
2. Wrap into an `Aris68Connector` module (events out, display + commands in) on the V0.0.61 base.
3. Add display rendering + mic.
