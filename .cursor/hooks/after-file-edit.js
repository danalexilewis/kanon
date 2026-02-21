#!/usr/bin/env node
/**
 * Cursor afterFileEdit hook: if a relevant file is edited, write a reminder to
 * .cursor/next-step.md to trigger the appropriate skill (ingest, create-ontology, update-docs).
 */

const fs = require('fs');
const path = require('path');

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
    const relativePath = path.relative(root, fullPath);
    const nextStepPath = path.join(root, '.cursor', 'next-step.md');
    let msg = '';

    if (relativePath.startsWith('ingest/') && !relativePath.includes('manifest.md')) {
      msg = `New or updated ingest file: \`${relativePath}\`. Run the **ingest skill** to process it into \`sources/\` and \`media/\` and update the ingest manifests.\n\n(Triggered by edit to: ${relativePath})\n`;
    } else if (relativePath.startsWith('sources/') || relativePath === 'ontology/ontology.md' || relativePath.startsWith('references/')) {
      msg = `Changes detected in \`${relativePath}\`. Run the **update-docs skill** to reflect these changes in \`content/\`. If \`references/\` changed, consider running **create-ontology skill** first.\n\n(Triggered by edit to: ${relativePath})\n`;
    } else if (relativePath.startsWith('media/')) {
      msg = `Changes detected in \`${relativePath}\`. Ensure \`media/meta.md\` exists for new media. Run the **update-docs skill** to reflect these changes in \`content/\` (e.g., mirroring to \`public/media/\`).\n\n(Triggered by edit to: ${relativePath})\n`;
    }

    if (msg) {
      fs.mkdirSync(path.dirname(nextStepPath), { recursive: true });
      fs.writeFileSync(nextStepPath, msg, 'utf8');
    }
  } catch (e) {
    console.error('after-file-edit hook:', e.message);
  }
});
