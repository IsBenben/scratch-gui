IsBenben/scratch-gui is a fork of [TurboWarp/scratch-gui](https://github.com/TurboWarp/scratch-gui) with persistent project palettes and enhanced color pickers.

## Setup

Use Node.js 24 and pnpm 10.33.0. Clone the workspace with its pinned GUI and paint submodules:

```sh
git clone --recurse-submodules https://github.com/IsBenben/scratch-editor-workspace.git
cd scratch-editor-workspace
pnpm install --frozen-lockfile
pnpm --filter scratch-gui run prepare
pnpm --filter scratch-gui run build
pnpm --filter scratch-gui start
```

The directory layout is:

```text
scratch-editor-workspace/
  scratch-gui/
  scratch-paint/
  package.json
  pnpm-workspace.yaml
  pnpm-lock.yaml
  .npmrc
```

If you cloned GUI separately, keep the two repositories as siblings and check out the paint revision declared by GUI:

```sh
git clone --branch develop https://github.com/IsBenben/scratch-paint.git scratch-paint
git -C scratch-paint checkout "$(cat scratch-gui/scripts/workspace/paint-revision.txt)"
node scratch-gui/scripts/setup-workspace.mjs
pnpm install --frozen-lockfile
pnpm --filter scratch-gui run prepare
pnpm --filter scratch-gui run build
pnpm --filter scratch-gui run test:unit
pnpm --filter scratch-paint run test --runInBand
pnpm --filter scratch-gui start
```

The setup script verifies the committed paint revision and creates missing workspace configuration files using relative paths. GUI declares `scratch-paint` as a pinned `git+https://github.com/IsBenben/scratch-paint.git` dependency. The root `pnpm-workspace.yaml` overrides that dependency with `workspace:*`, so development uses the local paint source. There is no global link step. The GUI lockfile is the committed copy of the root workspace lockfile.

After committing paint changes, run `pnpm run sync` at the workspace root to update GUI's dependency and CI revision. After dependency changes, run `pnpm install`, then `pnpm run sync` again to copy the workspace lockfile and configuration templates. Paint maintains its standalone lockfile with `pnpm --dir scratch-paint --ignore-workspace install --lockfile-only` when its own dependencies change. Commit and push paint first, GUI second, and the workspace submodule references last.

The prepare script downloads and verifies the microbit HEX asset and generates its import. If installation uses `--ignore-scripts`, run `pnpm -r rebuild --pending` and run prepare explicitly before building. The workspace allows the required `core-js`, `scratch-blocks`, and Canvas test dependency scripts. Cheerio is pinned for Enzyme compatibility, and paint declares its jsdom/Canvas test environment. Node uses the system CA store for dependency script downloads. The relative pnpm store path is configurable in the workspace `.npmrc`.

`pnpm --filter scratch-gui test` also runs the project linter. Existing lint failures outside the picker changes are reported separately. Paint changes are committed directly to the IsBenben fork. CI checks out the commit in `scripts/workspace/paint-revision.txt`, creates the sibling workspace, and runs prepare, builds, and picker tests.

After building, run `pnpm run test:pickers:browser` from GUI for the real browser regression checks. It uses an installed Chrome (set `CHROME_BINARY` if necessary), starts a temporary local server/profile, and removes its temporary files afterwards. Horizontal sliders accept either wheel axis with the same step; the 2D area scrolls saturation horizontally and brightness vertically. Ctrl snaps active values to steps of 5 while Better Color Picker is enabled. Shift + vertical wheel is also a saturation shortcut.

More TurboWarp development information: https://docs.turbowarp.org/development/getting-started

Variable, list, and custom block palette controls, persistence, drag behavior, and sprite/backpack transfer are described in [Project block colors](docs/project-block-colors.md).

The pnpm migration was validated with Node.js 24.18.0 and pnpm 10.33.0: frozen installation with lifecycle scripts, manual prepare, both builds, and all 63 paint unit tests passed. The paint patch and both lockfile layouts were also checked in clean checkouts. Paint lint passed with Linux-style LF line endings.

The current color changes were validated with Node.js 24.22.3 and pnpm 10.33.0: the GUI build, all 67 GUI unit tests, and the complete Chrome regression passed. Browser checks cover both pickers, Ctrl/wheel input, palette controls, native duplication and dragging, sprite/backpack transfers, same-name destination priority, workspace rebuilding, actual `.sb3`/`project.json` short-ID serialization, metadata precedence, and comment fallback/deletion. GUI still has 39 existing lint errors; hosted CI has not been run.

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
