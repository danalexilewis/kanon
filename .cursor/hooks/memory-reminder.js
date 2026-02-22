#!/usr/bin/env node
/**
 * Cursor stop hook: appends a reminder to .cursor/next-step.md so the agent
 * (or user) is prompted to update .cursor/memory.md when substantive work was done.
 * See .cursor/rules/persistent-memory.mdc.
 */

const fs = require('fs');
const path = require('path');

const MEMORY_REMINDER = [
  '',
  '---',
  '**Persistent memory:** If the agent did substantive work (bug fix, new pattern, or environment/tooling discovery), ensure `.cursor/memory.md` was updated. See `.cursor/rules/persistent-memory.mdc`.',
].join('\n');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const roots = payload.workspace_roots || [process.cwd()];
    const root = path.resolve(roots[0]);
    const nextStepPath = path.join(root, '.cursor', 'next-step.md');

    let existing = '';
    if (fs.existsSync(nextStepPath)) {
      existing = fs.readFileSync(nextStepPath, 'utf8');
      if (existing.includes('Persistent memory:') || existing.includes('.cursor/memory.md')) {
        return;
      }
    }
    fs.mkdirSync(path.dirname(nextStepPath), { recursive: true });
    fs.writeFileSync(nextStepPath, existing + MEMORY_REMINDER + '\n', 'utf8');
  } catch (e) {
    console.error('memory-reminder hook:', e.message);
  }
});
