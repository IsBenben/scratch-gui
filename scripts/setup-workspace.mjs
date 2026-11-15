import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync, spawnSync} from 'node:child_process';

const gui = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.dirname(gui);
const paint = path.join(workspace, 'scratch-paint');
const templates = path.join(gui, 'scripts', 'workspace');
const revision = fs.readFileSync(path.join(templates, 'paint-revision.txt'), 'utf8').trim();
const patch = path.join(templates, 'scratch-paint.patch');

if (execFileSync('git', ['rev-parse', 'HEAD'], {cwd: paint, encoding: 'utf8'}).trim() !== revision) {
    throw new Error(`scratch-paint must be checked out at ${revision}`);
}
if (spawnSync('git', ['apply', '--reverse', '--check', patch], {cwd: paint}).status !== 0) {
    execFileSync('git', ['apply', '--check', patch], {cwd: paint, stdio: 'inherit'});
    execFileSync('git', ['apply', patch], {cwd: paint, stdio: 'inherit'});
}
// The pnpm migration replaces the upstream npm lockfile.
fs.rmSync(path.join(paint, 'package-lock.json'), {force: true});
for (const name of ['package.json', 'pnpm-workspace.yaml', '.npmrc']) {
    const target = path.join(workspace, name);
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(templates, name), target);
}
const lock = path.join(workspace, 'pnpm-lock.yaml');
if (!fs.existsSync(lock)) fs.copyFileSync(path.join(gui, 'pnpm-lock.yaml'), lock);
console.info('Workspace ready. Run pnpm install --frozen-lockfile from the workspace directory.');
