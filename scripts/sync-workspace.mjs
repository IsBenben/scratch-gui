import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const gui = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.dirname(gui);
const paint = path.join(workspace, 'scratch-paint');
const templates = path.join(gui, 'scripts', 'workspace');
if (execFileSync('git', ['status', '--porcelain'], {cwd: paint, encoding: 'utf8'}).trim()) {
    throw new Error('Commit scratch-paint changes before syncing its pinned revision.');
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: paint, encoding: 'utf8'}).trim();
const manifestPath = path.join(gui, 'package.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.dependencies['scratch-paint'] = `git+https://github.com/IsBenben/scratch-paint.git#${revision}`;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(templates, 'paint-revision.txt'), `${revision}\n`);
for (const name of ['package.json', 'pnpm-workspace.yaml', '.npmrc']) {
    fs.copyFileSync(path.join(workspace, name), path.join(templates, name));
}
fs.copyFileSync(path.join(workspace, 'pnpm-lock.yaml'), path.join(gui, 'pnpm-lock.yaml'));
console.info('Synced workspace configuration, GUI lockfile, and committed paint revision.');
