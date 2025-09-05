This project is distributed under the terms of the GNU General Public License, version 3 or (at your option) any later version. See LICENSE for details.

Attributions and Notices

- Portions of the MD3 parsing and viewer concepts are derived from and inspired by Thomas Diewald’s MD3 work (GPL-2.0-or-later).
  - Website: http://thomasdiewald.com/blog/
  - We acknowledge the original author and have adapted and extended MD3 reading and rendering ideas for WebGL2. Any remaining original fragments retain their original license terms. Our combined distribution is GPL-3.0-or-later, which is compatible with “GPL-2.0 or later.”

- Quake III Arena is a registered trademark of id Software, Inc. This project uses the MD3 format specification for interoperability. No id Software game assets are included.

- Dependencies and tools:
  - gl-matrix (MIT): https://github.com/toji/gl-matrix
  - Vite (MIT): https://vitejs.dev/
  These remain under their respective licenses.

- Ground Textures:
  - Poly Haven (CC0): ground textures included in /public/textures (plate.webp and plate_n.webp) are based on assets from https://polyhaven.com. Poly Haven assets are released under CC0 (public domain).

Assets and Content

- No copyrighted game assets are shipped. Player and weapon model directories are intentionally empty or stubbed; users must provide their own legal assets.
- The application defaults to “NO PLAYER” and “UNARMED” when no asset indexes or models are provided. There are no built-in id Software assets or automatic fallbacks.

Shadow Mapping and Shaders

- Shadow mapping uses hardware shadow samplers with compare mode; the implementation includes PCF/Poisson sampling, bias controls, and quality parameters.

Audio

- The procedural soundtrack is generated via the Web Audio API at runtime. There are no embedded audio samples/content.

Contact

- Maintainer: 3merillon
- Repository: https://github.com/3merillon/q3-md3-webgl-viewer