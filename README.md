# IsBenben/scratch-gui

This fork of [TurboWarp/scratch-gui](https://github.com/TurboWarp/scratch-gui) adds persistent project palettes and enhanced color pickers to the Scratch editor. It works with the matching [scratch-paint fork](https://github.com/IsBenben/scratch-paint) through a shared pnpm workspace.

## Features

Variables, lists, and custom blocks support primary, secondary, border, dropdown selection, and text colors. Palettes apply to the workspace, flyout, and relevant stage monitors. Projects, sprite files, and backpack items retain their colors through metadata and fallback comments. See [Project block colors](docs/project-block-colors.md) for persistence and transfer behavior.

Better Color Picker is enabled by default and provides independent cursor and handle-color settings. The 2D picker uses native HSV state, supports numeric input, and preserves fractional values during live updates. Shift limits dragging to one axis. With Better Color Picker enabled, Ctrl snaps active values to multiples of 5.

Horizontal sliders respond to either wheel axis with the same step. In the 2D area, horizontal scrolling adjusts saturation and vertical scrolling adjusts brightness. Shift with the vertical wheel also adjusts saturation.

## Getting started

### Requirements

Use Node.js 24 and pnpm 10.33.0. The recommended setup is the [Scratch Editor workspace](https://github.com/IsBenben/scratch-editor-workspace), which records compatible GUI and paint commits as Git submodules.

### Workspace checkout

Clone the workspace and its submodules, then install dependencies and start the development server.

```sh
git clone --recurse-submodules https://github.com/IsBenben/scratch-editor-workspace.git
cd scratch-editor-workspace
pnpm install --frozen-lockfile
pnpm --filter scratch-gui run prepare
pnpm --filter scratch-gui start
```

The editor is available at [http://localhost:8601/](http://localhost:8601/). If the workspace was cloned without submodules, run `git submodule update --init --recursive` before installing dependencies.

### Separate checkouts

You can also clone GUI and paint into sibling directories. Run the following commands from their intended parent directory. The revision lookup in this example uses a POSIX shell.

```sh
git clone --branch develop https://github.com/IsBenben/scratch-gui.git scratch-gui
git clone --branch develop https://github.com/IsBenben/scratch-paint.git scratch-paint
git -C scratch-paint checkout "$(cat scratch-gui/scripts/workspace/paint-revision.txt)"
node scratch-gui/scripts/setup-workspace.mjs
pnpm install --frozen-lockfile
pnpm --filter scratch-gui run prepare
pnpm --filter scratch-gui start
```

In PowerShell, replace the revision checkout command with the following command.

```powershell
git -C scratch-paint checkout (Get-Content scratch-gui/scripts/workspace/paint-revision.txt).Trim()
```

The setup script checks paint's HEAD against the required revision and creates missing workspace configuration files in the parent directory. It uses relative paths, so the checkout can be moved without changing the configuration.

## Dependencies and maintenance

### Local paint dependency

GUI declares scratch-paint as a pinned HTTPS Git dependency from the IsBenben fork. The root pnpm-workspace.yaml overrides it with `workspace:*`, so workspace development uses the local paint source without a global link step. The GUI lockfile is a committed copy of the root workspace lockfile.

Paint changes are committed directly to its fork. GUI CI checks out the commit recorded in scripts/workspace/paint-revision.txt and recreates the sibling workspace before installing, preparing, building, and testing both packages.

### Synchronizing changes

After committing paint changes and ensuring its working tree is clean, run `pnpm run sync` at the workspace root. This updates GUI's paint dependency, the CI revision, configuration templates, and lockfile copy. When dependencies change, run `pnpm install` and synchronize again.

Paint's standalone lockfile only needs updating when its own dependencies change. Use `pnpm --dir scratch-paint --ignore-workspace install --lockfile-only` for that update. Commit and push paint first, GUI second, and the workspace's submodule references last.

### Installation scripts

The prepare script downloads and verifies the microbit HEX asset and generates its import. Installation normally runs it automatically. If you install with `--ignore-scripts`, run `pnpm -r rebuild --pending` and explicitly run GUI's prepare command before building.

The workspace permits the required core-js, scratch-blocks, and Canvas installation scripts. It also pins Cheerio for Enzyme compatibility and configures paint's jsdom and Canvas test dependencies. Node uses the system CA store for dependency-script downloads, and the relative pnpm store path can be changed in the root .npmrc.

## Building and testing

Run these commands from the workspace root to build GUI and run its unit tests.

```sh
pnpm --filter scratch-gui run build
pnpm --filter scratch-gui run test:unit
```

After building, run the browser regression suite with an installed Chrome. Set CHROME_BINARY if Chrome is not at the expected path.

```sh
pnpm --filter scratch-gui run test:pickers:browser
```

The browser suite checks both pickers, palette controls, copying and dragging, sprite and backpack transfers, and project serialization. It starts a temporary local server and browser profile, then removes its temporary files when finished.

Local validation on November 20, 2026 passed the GUI build, all 67 GUI unit tests, and the complete Chrome regression. The repository configuration was checked again on November 21 with frozen installation, prepare, both packages' unit tests, and clean-directory setup checks. These runs used Node.js 24.22.3 and pnpm 10.33.0.

The full `pnpm --filter scratch-gui test` command also runs lint, which still reports 39 existing errors. Unit tests can be run separately. Hosted CI results have not yet been verified.

For general TurboWarp development guidance, see the [development documentation](https://docs.turbowarp.org/development/getting-started).

## License

This fork is licensed under the GNU General Public License v3.0. See [LICENSE](LICENSE) and the [GNU license documentation](https://www.gnu.org/licenses/) for details.

The original scratch-gui license is retained below as required by its terms. It applies to the original code, while this fork is distributed under GPL v3.0.

```
Copyright (c) 2016, Massachusetts Institute of Technology
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

The original `src/lib/default-project/dango.svg` asset was based on [Twemoji](https://twemoji.twitter.com/) and licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credits for the current default artwork are recorded in the [default-project README](src/lib/default-project/README.md).
