# System monitor (SystemView)

A built-in **System Monitor** page shows your Mac's live state on the panel — CPU and GPU
load, memory, per-drive disk usage, network throughput, process count, and (on laptops)
battery. It's added automatically on first run as a page named **System Monitor**, and it's a
normal page you can rename, reorder, include in rotation, or delete (delete it and it stays gone).

Under the hood open-quake runs a tiny metrics server bound to `127.0.0.1` (loopback only —
never exposed on the network) and the page reads from it once a second. **No admin rights and
no extra software required.**

## Honest gaps — anything unavailable shows "—", never a fake `0`

- **CPU temperature** shows **"—"** when macOS does not expose a reliable sensor through the
  cross-platform `systeminformation` API. open-quake does not bundle privileged sensor helpers.
- **GPU load/temperature** depend on what `systeminformation` can read on the current Mac. Values
  unavailable without a platform-specific helper show **"—"**.
- **Battery** appears on laptops; on a desktop (no battery) the widget is hidden.
