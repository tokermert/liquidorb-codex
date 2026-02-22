# Liquid Orb Tool MVP

Simple, creator-friendly liquid orb editor built with Three.js shaders.

## Features

- Static or animated orb mode
- Shape controls: blob, detail, roundness, size
- Color controls with iridescence and glow
- Background gradient or transparent canvas
- One-click presets: Glass, Pearl, Mercury, Neon
- Export: PNG, WebM (6s), preset JSON, embed code snippet

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Notes

- Video export uses browser `MediaRecorder` and outputs WebM.
- State is persisted in `localStorage`.
