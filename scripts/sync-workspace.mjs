import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import yaml from 'yaml';

const gui = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.dirname(gui);
const paint = path.join(workspace, 'scratch-paint');
const templates = path.join(gui, 'scripts', 'workspace');
const revision = fs.readFileSync(path.join(templates, 'paint-revision.txt'), 'utf8').trim();
if (execFileSync('git', ['rev-parse', 'HEAD'], {cwd: paint, encoding: 'utf8'}).trim() !== revision) {
    throw new Error(`scratch-paint must be checked out at ${revision}`);
}
const workspaceLock = fs.readFileSync(path.join(workspace, 'pnpm-lock.yaml'), 'utf8');
fs.writeFileSync(path.join(gui, 'pnpm-lock.yaml'), workspaceLock);
const paintLock = yaml.parse(workspaceLock);
paintLock.importers = {'.': paintLock.importers['scratch-paint']};
fs.writeFileSync(path.join(paint, 'pnpm-lock.yaml'), yaml.stringify(paintLock));

// Keep the patch confined to the picker and the pnpm migration.
const paths = [
    'package.json', 'README.md', '.npmrc', '.nvmrc', '.github/workflows', 'pnpm-workspace.yaml',
    'pnpm-lock.yaml', 'src/lib/color-picker-position.js', 'src/containers/color-picker.jsx',
    'src/components/color-picker', 'src/components/forms/slider.jsx', 'src/components/forms/slider.css',
    'src/components/tw-color-readout', 'test/unit/color-picker.test.js'
];
let patch = execFileSync('git', ['diff', '--binary', '--no-ext-diff', revision, '--', ...paths], {
    cwd: paint, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
});
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', ...paths], {
    cwd: paint, encoding: 'utf8'
}).trim()
    .split('\n')
    .filter(Boolean);
for (const name of untracked) {
    const content = fs.readFileSync(path.join(paint, name), 'utf8').replace(/\r\n/g, '\n');
    if (!content.endsWith('\n')) throw new Error(`Missing final newline: ${name}`);
    const lines = content.slice(0, -1).split('\n');
    patch += `diff --git a/${name} b/${name}\nnew file mode 100644\n` +
        `--- /dev/null\n+++ b/${name}\n@@ -0,0 +1,${lines.length} @@\n${
            lines.map(line => `+${line}\n`).join('')}`;
}
fs.writeFileSync(path.join(templates, 'scratch-paint.patch'), patch);
console.info('Synced workspace lockfile, standalone paint lockfile, and paint patch.');
