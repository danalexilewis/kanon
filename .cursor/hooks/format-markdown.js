#!/usr/bin/env node
/**
 * Cursor afterFileEdit hook: formats .md and .mdx files with Prettier.
 */

const path = require('path');
const { execSync } = require('child_process');

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
    const ext = path.extname(fullPath).toLowerCase();
    if (ext !== '.md' && ext !== '.mdx') return;

    execSync('npx', ['prettier', '--write', fullPath], {
      cwd: root,
      stdio: 'inherit',
    });
  } catch (e) {
    if (e.status !== undefined && e.status !== 0) {
      console.error('format-markdown hook: Prettier exited with code', e.status);
    } else {
      console.error('format-markdown hook:', e.message);
    }
  }
});
