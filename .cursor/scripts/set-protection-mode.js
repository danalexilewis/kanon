#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const mode = (process.argv[2] || '').toLowerCase();
const validModes = new Set(['safe', 'normal', 'force']);

if (!validModes.has(mode)) {
  console.error('Usage: node .cursor/scripts/set-protection-mode.js <safe|normal|force>');
  process.exit(1);
}

const root = path.resolve(__dirname, '..', '..');
const modePath = path.join(root, '.cursor', 'protection-mode.json');
const confirmationPath = path.join(root, '.cursor', 'force-mode-confirmation.md');

const payload = {
  mode,
  updatedAt: new Date().toISOString(),
  notes: 'Switch with: node .cursor/scripts/set-protection-mode.js <safe|normal|force>',
};

fs.mkdirSync(path.dirname(modePath), { recursive: true });
fs.writeFileSync(modePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

if (mode !== 'force' && fs.existsSync(confirmationPath)) {
  fs.unlinkSync(confirmationPath);
}

console.log(`Protection mode set to: ${mode}`);
if (mode === 'force') {
  console.log('To confirm force operations, create .cursor/force-mode-confirmation.md with the line: CONFIRM FORCE MODE');
}
