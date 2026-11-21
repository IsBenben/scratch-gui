import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const gui = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.dirname(gui);
const paint = path.join(workspace, 'scratch-paint');
const templates = path.join(gui, 'scripts', 'workspace');
const revision = fs.readFileSync(path.join(templates, 'paint-revision.txt'), 'utf8').trim();

if (execFileSync('git', ['rev-parse', 'HEAD'], {cwd: paint, encoding: 'utf8'}).trim() !== revision) {
    throw new Error(`scratch-paint must be checked out at ${revision}`);
}
for (const name of ['package.json', 'pnpm-workspace.yaml', '.npmrc']) {
    const target = path.join(workspace, name);
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(templates, name), target);
}
const lock = path.join(workspace, 'pnpm-lock.yaml');
if (!fs.existsSync(lock)) fs.copyFileSync(path.join(gui, 'pnpm-lock.yaml'), lock);
console.info('Workspace ready. Run pnpm install --frozen-lockfile from the workspace directory.');
