# Q3 MD3 Character Viewer & Controller (WebGL2, GPL-3.0-or-later)

A modern, WebGL2-based Quake 3 MD3 viewer/controller with:
- Upper/lower animation system (independent timelines) + smooth morph crossfades
- Character controller (WASD, sprint, crouch, jump, attack) with camera orbit/pan/zoom
- Weapon attach on tag_weapon, optional muzzle flash on tag_flash, additive laser/flash materials
- Shadow mapping with Poisson PCF, tunable bias/softness/intensity/light size & angles
- Procedural death-metal soundtrack (browser-safe, user-gesture auto-resume) with volume
- Dynamic JSONC-based asset index for players and weapons (no bundled game assets)
- LOD (0/1/2) for player parts and weapons; skin switching per player

Important
- This repository ships with zero id Software game assets. It starts with “NO PLAYER” and “UNARMED” by default.
- Bring your own MD3 assets and indexes to load content (see “Bring Your Own Assets”).

## Why GPLv3

This project is distributed under GPL-3.0-or-later.

- Portions of the MD3 handling logic are derived from Thomas Diewald’s MD3 work published under “GPL-2.0 or later,” which is compatible with GPLv3. Thus the combined work may be distributed as GPLv3 (or later).
- Third-party dependencies and tools (e.g., gl-matrix (MIT), Vite (MIT)) are license-compatible; they remain under their original licenses, while this repository remains under GPL terms.

If you distribute builds, you must make source code available and retain the original notices and license texts.

## Quick Start

Prerequisites:
- Node.js 18+ recommended
- Modern browser with WebGL2

Install and run:
- Install dependencies:
  - `npm install`
- Start dev server:
  - `npm run dev`
- Open the printed local URL in your browser.

Build:
- Production build:
  - `npm run build`
- Preview locally:
  - `npm run preview`

Note: Use the dev server or static hosting (HTTP/HTTPS). fetch() will not work via file://.

## Super Simple “Add A Player” Recipe (from .pk3/.pkg)

Legal note: Only add assets you have permission to use. This repo ships no id Software assets.

1) Extract the model from the package
- If your file is `.pk3` or `.pkg`, rename it to `.zip` and extract.
- Inside you should find something like `models/players/<player_name>/`.

2) Create the destination folder in THIS project
- Make: `public/models/players/<your_player>/`
  - Example: `public/models/players/major/`

3) Copy essential files into that folder
- Required: `head.md3`, `upper.md3`, `lower.md3`, `animation.cfg`
- Required: `head_default.skin`, `upper_default.skin`, `lower_default.skin`
  - If your skins have other names (e.g. `head_red.skin`), keep them too; “default” must exist for first run.
- Required: All textures referenced by those skin files.

4) Fix filename case (very important on non-Windows)
- Ensure extensions are lowercase `.md3` and `.tga/.png/.jpg`.
  - macOS/Linux example:
    - `mv HEAD.MD3 head.md3` (repeat for `upper`/`lower` and textures as needed)
  - Windows PowerShell example:
    - `Rename-Item -Path HEAD.MD3 -NewName head.md3`

5) Verify expected base names
- Must be exactly: `head.md3`, `upper.md3`, `lower.md3`
- Optional LODs: `head_1.md3`, `head_2.md3` (also for upper/lower)

6) Sanity check your `.skin` files (common pitfall)
- Open `head_default.skin`, `upper_default.skin`, `lower_default.skin`.
- Each line format: `surface_name, texture_file`
- Keep texture_file as a simple file name (no directories).
  - Good: `s_head, head_d.tga`
  - Avoid: `s_head, models/players/major/head_d.tga`
- Why: this viewer loads textures from the same folder as the skin; a plain file name is simplest.

7) Optional: more skins
- You can add `head_blue.skin`, `upper_blue.skin`, `lower_blue.skin`, etc.
- Whatever suffix you use (e.g., `blue`), list it in the players index (Step 9).

8) Ensure `animation.cfg` is present
- Put it next to the MD3s. Without it, only a trivial idle is used.

9) Create or edit the players index
- File: `public/models/players/index.jsonc`
- Add your player entry (remove `"stub": true` if present):

```
{
  // List players; "skins" must match your skin suffixes (e.g., head_blue.skin => "blue")
  "players": [
    {
      "name": "major",
      "skins": ["default", "blue", "red"],
      "hasVariants": true
      // If you previously had "stub": true, remove it when you add real files.
    }
  ]
}
```

10) Run and test
- `npm run dev`
- Open the app, choose your player. If it’s disabled:
  - You left `"stub": true` or mis-typed the name.
- If nothing shows:
  - Check the console for 404s.
  - Verify exact file names and case.
  - Ensure textures in `.skin` match actual files (case-sensitive).
  - Confirm `head/upper/lower.md3` and `animation.cfg` exist.

## “Add A Weapon” Recipe

1) Create destination folder
- `public/models/weapons/<weapon_name>/`

2) Copy weapon files
- Required: `<weapon_name>.md3`, `<weapon_name>.skin`, and referenced textures.
- Optional muzzle flash:
  - `<weapon_name>_flash.md3`
  - `<weapon_name>_flash.skin`
  - Textures referenced by the flash skin.
- Optional LODs:
  - `<weapon_name>_1.md3`, `<weapon_name>_2.md3`

3) Fix filename case
- Ensure lowercase `.md3`, `.tga/.png/.jpg`; rename if necessary.

4) Update weapons index
- File: `public/models/weapons/index.jsonc`
- Add (or un-stub) your weapon:

```
{
  "weapons": [
    { "name": "shotgun", "hasVariants": true },
    { "name": "gauntlet", "hasVariants": false }
  ]
}
```

- Remove `"stub": true` if it exists for your entry.

5) Test
- Start the dev server, select your weapon in the HUD.
- If disabled: you left `"stub": true` or mis-typed the name.

## Project Structure

Key paths:

- `public/`
  - `index.html` — App shell and UI
  - `shaders/*.glsl` — GLSL shaders used by the renderer
  - `textures/plate.webp`, `textures/plate_n.webp` — ground textures (Poly Haven, CC0; see Notices)
  - `models/players/` — place your player MD3 assets here
  - `models/weapons/` — place your weapon MD3 assets here
- `src/`
  - `main.js` — UI wiring, dynamic asset indexes, viewer bootstrap
  - `viewer.js` — rendering pipeline, shadow pass, main pass
  - `shadows/shadow-system.js` — shadow map FBO and parameters
  - `camera/camera.js` — orbit camera with pan/zoom, state import/export
  - `ground.js` — textured ground plane with scrolling UVs
  - `character-controller.js` — WASD, sprint, crouch, jump, attack, weapon hotkeys (1–9)
  - `q3/` — MD3 object/skin/player/weapon glue, animation config
  - `md3/` — MD3 parser types
  - `audio/` — AudioManager and DeathMetalGenerator (Web Audio)
  - `data/assets.js` — JSONC loaders, dynamic index for players/weapons (no auto-fallback to id assets)
  - `util/` — TGA loader, image wrapper, byte reader, etc.
- `package.json` — scripts (dev/build/preview), dependencies
- `vite.config.js` — Vite config

## Controls

- Movement: W/A/S/D
- Sprint: Shift
- Jump: Space
- Crouch toggle: C
- Attack: Left mouse button (LMB)
- Orbit/pan camera: Right mouse button (RMB) drag
- Zoom: Mouse wheel
- Weapon hotkeys: 1–9 (uses dynamic weapons index; stubbed entries appear disabled)
- Click the canvas to focus inputs if the HUD steals focus

UI panels let you:
- Pick player, weapon, skin, and LOD (if variants exist)
- Toggle/adjust shadow settings
- Control light elevation/azimuth/coverage
- Trigger one-shot actions (gesture, drop, raise, back-jump, turn)
- Control procedural music on/off and volume

## Shadows

- Hardware shadow sampler with compare mode (PCF) + Poisson 16-tap kernel
- Tunable:
  - Resolution: 512/1024/2048/4096
  - Intensity: 0–1
  - Bias: depth bias to reduce acne
  - Softness: Poisson radius in texels
  - Light elevation/azimuth + coverage (orthographic size)
- Auto-disables if FBO or compare sampling is unsupported

## Procedural Music

- Death metal generator via Web Audio API
- Auto-resume on user gesture to comply with autoplay policies
- Volume control in the HUD

Tip: First click or key press after load will ensure the AudioContext resumes properly.

## Troubleshooting

- “No models appear”:
  - Use a dev server (http(s)://), not file://
  - Check for 404s; verify filenames/case
  - Provide players/weapons indexes and assets; there is no built-in fallback list
- “Audio doesn’t start”:
  - Click canvas or press a key to resume AudioContext
  - Toggle “Enable Audio” in the HUD
- “Shadow artifacts (acne/flicker)”:
  - Increase bias slightly
  - Reduce softness (Poisson radius)
  - Lower intensity
- “App is slow”:
  - Reduce shadow map resolution
  - Lower LOD
  - Reduce device pixel ratio via OS/browser zoom

## Browser Support

- WebGL2-capable browsers (Chrome, Edge, Firefox, Safari recent versions)
- Hardware shadow compare-sampler recommended; otherwise shadows are disabled.

## License

- This repository: GPL-3.0-or-later. Include a `LICENSE` file with the GPL-3.0 text.
- Third-party:
  - gl-matrix (MIT)
  - Vite (MIT)
- You are responsible for licenses of any assets you add (models/textures/sounds).

## Acknowledgements

- Thomas Diewald — original MD3 parsing work and reference viewer (GPL-2.0-or-later)
- id Software — Quake 3 model format (MD3)
- Poly Haven — ground textures (CC0): https://polyhaven.com
- gl-matrix authors — math library (MIT)