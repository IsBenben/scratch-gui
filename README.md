scratch-gui modified for use in [TurboWarp](https://turbowarp.org/)

## Setup

Use Node.js 24.18.0 and pnpm 10.33.0. Keep `scratch-gui` and `scratch-paint` in the same workspace directory:

```text
scratch-editor-workspace/
  scratch-gui/
  scratch-paint/
  package.json
  pnpm-workspace.yaml
  pnpm-lock.yaml
  .npmrc
```

From the workspace directory, clone the paint repository and check out the pinned revision:

```sh
git clone --branch develop https://github.com/TurboWarp/scratch-paint.git scratch-paint
git -C scratch-paint checkout 17be42c5d187110d96c45b6d26d6d41be2edcf1c
node scratch-gui/scripts/setup-workspace.mjs
pnpm install --frozen-lockfile
pnpm --filter scratch-gui run prepare
pnpm --filter scratch-gui run build
pnpm --filter scratch-gui run test:unit
pnpm --filter scratch-paint run test --runInBand
pnpm --filter scratch-gui start
```

The setup script applies the versioned paint patch and creates missing workspace configuration files using relative paths. GUI uses `scratch-paint: workspace:*`; there is no global link step. The GUI lockfile is the committed copy of the root workspace lockfile. After changing dependencies, run `pnpm install` from the workspace, then `node scratch-gui/scripts/sync-workspace.mjs` to sync the workspace lockfile, standalone paint lockfile, and patch.

The prepare script downloads and verifies the microbit HEX asset and generates its import. If installation uses `--ignore-scripts`, run `pnpm -r rebuild --pending` and run prepare explicitly before building. The workspace allows the required `core-js`, `scratch-blocks`, and Canvas test dependency scripts. Cheerio is pinned for Enzyme compatibility, and paint declares its jsdom/Canvas test environment. Node uses the system CA store for dependency script downloads. The relative pnpm store path is configurable in the workspace `.npmrc`.

`pnpm --filter scratch-gui test` also runs the project linter. Existing lint failures outside the picker changes are reported separately. Paint changes are reproducible from `scripts/workspace/scratch-paint.patch` against the revision in `scripts/workspace/paint-revision.txt`; CI recreates this sibling checkout and runs prepare, builds, and picker tests.

After building, run `pnpm run test:pickers:browser` from GUI for the real browser regression checks. It uses an installed Chrome (set `CHROME_BINARY` if necessary), starts a temporary local server/profile, and removes its temporary files afterwards. Horizontal sliders accept either wheel axis with the same step; the 2D area scrolls saturation horizontally and brightness vertically. Ctrl snaps active values to steps of 5 while Better Color Picker is enabled. Shift + vertical wheel is also a saturation shortcut.

More TurboWarp development information: https://docs.turbowarp.org/development/getting-started

Validated with Node.js 24.18.0 and pnpm 10.33.0: frozen installation with lifecycle scripts, manual prepare, both builds, 46 GUI unit tests, and all 63 paint unit tests passed. The paint patch and both lockfile layouts were also checked in clean checkouts. Paint lint passed with Linux-style LF line endings; GUI still has 39 existing lint errors outside these changes. Real Chrome checks cover both pickers, Ctrl dragging, horizontal and vertical scrolling, 2D scrolling, input layout, HSV retention, and dynamic handle colors. Hosted CI has not been run.

## License

TurboWarp's modifications to Scratch are licensed under the GNU General Public License v3.0. See LICENSE or https://www.gnu.org/licenses/ for details.

The following is the original license for scratch-gui, which we are required to retain. This is NOT the license of this project.

```
Copyright (c) 2016, Massachusetts Institute of Technology
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

src/lib/default-project/dango.svg is based on [Twemoji](https://twemoji.twitter.com/) and is licensed under CC BY 4.0 https://creativecommons.org/licenses/by/4.0/
