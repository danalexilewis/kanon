#!/usr/bin/env node
/**
 * Cursor afterFileEdit hook: if the agent edited anything under src/ingest/
 * (other than manifest.json/manifest.md), git-restore those files and tell
 * the agent to make no further edits there. Exits immediately when the edit
 * is not in ingest (no git or extra fs work).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MANIFEST_JSON = 'src/ingest/manifest.json';
const MANIFEST_MD = 'src/ingest/manifest.md';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const filePath = payload.file_path || '';
    const roots = payload.workspace_roots || [process.cwd()];
    const root = path.resolve(roots[0]);

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
    let relativePath = path.relative(root, fullPath);
    if (path.sep !== '/') relativePath = relativePath.split(path.sep).join('/');

    // Abort immediately if the edit was not in ingest or was allowed (manifest)
    if (!relativePath.startsWith('src/ingest/')) process.exit(0);
    if (relativePath === MANIFEST_JSON || relativePath === MANIFEST_MD) process.exit(0);

    // Edit was to a non-manifest file in ingest: revert all modified non-manifest files there
    const ingestDir = path.join(root, 'src', 'ingest');
    if (!fs.existsSync(ingestDir)) process.exit(0);

    let names = [];
    try {
      const out = execSync('git diff --name-only HEAD -- src/ingest/', { cwd: root, encoding: 'utf8' });
      names = out.split('\n').filter(Boolean);
    } catch {
      process.exit(0);
    }

    const toRestore = names.filter((p) => p !== MANIFEST_JSON && p !== MANIFEST_MD);
    if (toRestore.length === 0) process.exit(0);

    execSync(['git', 'restore', '--', ...toRestore], { cwd: root, stdio: 'pipe' });

    const nextStepPath = path.join(root, '.cursor', 'next-step.md');
    const message = [
      '**Ingest folder was reverted.**',
      '',
      'Edits to `src/ingest/` (other than the manifest) have been reverted. That folder is append-only: add new files for new input; do not edit or delete existing ingest files.',
      '',
      'Continue with your task. Do **not** make any further edits to `src/ingest/`. To process new or updated ingest files, run the **ingest** skill.',
      '',
      `(Reverted after edit to: ${relativePath})`,
    ].join('\n');

    fs.mkdirSync(path.dirname(nextStepPath), { recursive: true });
    fs.writeFileSync(nextStepPath, message, 'utf8');
  } catch (e) {
    console.error('revert-ingest-if-edited hook:', e.message);
  }
});
