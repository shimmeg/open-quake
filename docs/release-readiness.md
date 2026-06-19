# Release Readiness

This fork does not currently publish ready-to-install macOS release artifacts.
These notes are a checklist for a future release, not a download promise.

## Pre-Release Gates

Do not publish a release until all of the following are true:

- Task 7/8 hardening is merged and verified.
- `npm run security:baseline`, `npm run security:actions`, `npm run security:macos`,
  and `npm run security:docs` pass.
- Editor/config UI smoke is green.
- Any device, DFU, voice, microphone, or push-to-talk smoke has explicit operator
  approval before it is run.
- Release notes and SHA256 checksums are prepared.
- The release tag is signed or annotated.

## Build Checks

For an unsigned local macOS app bundle, run:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac:dir
```

Use this to verify packaging layout and bundled files without claiming a
distributable signed release.

Run the signed release build only when signing and notarization credentials are
available in the release environment:

```bash
npm run dist:mac
```

Do not run `npm run dist:mac` as a substitute for signing/notarization setup.

## Release Notes

Release notes should include:

- upstream version merged, if any;
- fork hardening summary;
- macOS support status and known limitations;
- verification commands run and their exact results;
- smoke tests run, including whether device and push-to-talk smoke were approved;
- license boundary warning for `src/Aris68Connector.js`, `docs/DEVICE_PROTOCOL.md`,
  and `tools/*` under PolyForm Noncommercial.

## Checksums

After signed artifacts are produced, generate SHA256 checksums from the final
files that will be uploaded:

```bash
shasum -a 256 dist/open-quake-* > dist/SHA256SUMS.txt
```

Review the checksum file before publishing it with the release.

## Tags

Use signed or annotated tags for public releases. Example annotated tag:

```bash
git tag -a v0.2.2-open-quake-fork.1 -m "open-quake fork v0.2.2 hardening release"
```

Use a signed tag instead when signing keys are configured:

```bash
git tag -s v0.2.2-open-quake-fork.1 -m "open-quake fork v0.2.2 hardening release"
```

Push tags only after all release gates are satisfied.
