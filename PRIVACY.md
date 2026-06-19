# Privacy Policy — open-quake

_Last updated: 2026-06-19_

open-quake is a free, open-source desktop application and driver for the
**DK-QUAKE / ARIS-68** touchscreen-and-knob macro device. This fork is currently
focused on macOS source runs. This policy explains what data the app handles.

## The short version

**open-quake has no analytics, telemetry, advertising, developer accounts, or
developer-operated network service.** The developer does not receive your
configuration, prompts, dashboard credentials, API keys, or audio.

The app can still send data to services you configure yourself: web-dashboard
pages, Open WebUI chat, and Open WebUI transcription. Those destinations are
under your control and are governed by their own policies.

## What is stored, and where

On macOS, open-quake saves configuration locally under:

`~/Library/Application Support/open-quake`

This includes page layouts, tiles, app settings, dashboard URLs, dashboard
tokens/passwords/custom headers, and Open WebUI settings including API keys.
Secrets are stored in plaintext local config. They are not sent to the
developer, but they are sent to the dashboard or Open WebUI service you
configured when the matching feature is used.

## Web Dashboard Pages

open-quake can display web pages that you configure (for example Home Assistant,
Grafana, or a weather map) inside an embedded browser view. When you do this, you are
connecting to those third-party websites directly, and your use of them is governed by
**their** privacy policies, not this one. Any access tokens, passwords, or headers you
enter for a dashboard are stored locally and are sent only to the website you configured
them for. Dashboard microphone/media permissions are denied by default except
for the local Open WebUI chat page and origins you explicitly trust in config.

## Open WebUI Chat And Push-To-Talk

The Open WebUI chat app sends your chat prompts and configured API key to the
Open WebUI chat endpoint you entered in the editor.

Push-to-talk records microphone audio only while held. When you release the
knob, open-quake sends that audio clip to the Open WebUI transcription endpoint
derived from your configured Open WebUI host, normally:

`/api/v1/audio/transcriptions`

Background audio recording is not used, and audio is not sent to the developer.
macOS may ask for microphone permission the first time the chat page records
audio.

## The device (USB and microphone)

open-quake communicates with the DK-QUAKE over USB (HID) to handle touch input, the
knob, the ring lighting, and to switch the device's microphone on or off. The
device's microphone is a standard USB audio input. open-quake reads it only for
the push-to-talk flow described above.

## Local Services

open-quake starts a loopback-only HTTP server on `127.0.0.1` for bundled panel
apps such as System Monitor, Music, and Open WebUI chat. That server is not
bound to the LAN.

## Children

open-quake is a general-purpose utility and is not directed at children.

## Changes to this policy

If this policy changes, the updated version will be posted at this URL with a new
"last updated" date.

## Contact

Questions about this policy? Open an issue on the fork:
<https://github.com/shimmeg/open-quake/issues>.
