#!/usr/bin/env node
/**
 * Cursor afterFileEdit hook: writes reminders to .cursor/next-step.md when
 * relevant files are edited (e.g. run ingest, update-docs). Ingest edits
 * are reverted by revert-ingest-if-edited.js.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

function hasStaleSources(root) {
  const sourcesDir = path.join(root, 'src', 'sources');
  const contentManifestJsonPath = path.join(root, 'content', 'manifest.json');

  if (!fs.existsSync(sourcesDir) || !fs.existsSync(contentManifestJsonPath)) {
    return false;
  }

  let contentManifest = {};
  try {
    contentManifest = JSON.parse(fs.readFileSync(contentManifestJsonPath, 'utf8'));
  } catch {
    return true;
  }

  const allSourceFiles = fs.readdirSync(sourcesDir, { recursive: true })
    .filter((f) => (f.endsWith('.md') || f.endsWith('.mdx')) && !f.startsWith('.'))
    .map((f) => path.join(sourcesDir, f));

  return allSourceFiles.some((file) => {
    const relativeFilePath = path.relative(root, file);
    const currentHash = calculateFileHash(file);
    return !contentManifest[relativeFilePath] || contentManifest[relativeFilePath].hash !== currentHash;
  });
}

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
    const messages = [];
    const isIngestNonManifest = relativePath.startsWith('src/ingest/') && !['src/ingest/manifest.md', 'src/ingest/manifest.json'].includes(relativePath);
    const isContentEdit = relativePath.startsWith('content/');

    if (isContentEdit && hasStaleSources(root)) {
      messages.push(
        `⚠️ **Warning:** edit in \`${relativePath}\` while \`src/sources/**\` and/or the ontology are ahead of \`content/**\`. Prefer **update-docs** to regenerate.`
      );
    }

    if (relativePath.startsWith('src/ingest/') && !relativePath.includes('manifest.md')) {
      messages.push(
        `New or updated ingest file: \`${relativePath}\`. Run the **ingest skill** to process it into \`src/sources/\` and \`src/media/\` and update the ingest manifests.`
      );
    } else if (relativePath.startsWith('src/sources/') || relativePath === '.cursor/rules/ontology.mdc' || relativePath.startsWith('src/references/')) {
      messages.push(
        `Changes detected in \`${relativePath}\`. Run the **update-docs skill** to reflect these changes in \`content/\`. If \`src/references/\` changed, consider running **create-ontology skill** first.`
      );
    } else if (relativePath.startsWith('src/media/')) {
      messages.push(
        `Changes detected in \`${relativePath}\`. Ensure \`src/media/.../meta.md\` exists for new media. Run the **update-docs skill** to reflect these changes in \`content/\` (e.g., mirroring to \`public/media/\`).`
      );
    }

    if (messages.length > 0) {
      fs.mkdirSync(path.dirname(nextStepPath), { recursive: true });
      fs.writeFileSync(nextStepPath, `${messages.join('\n\n')}\n\n(Triggered by edit to: ${relativePath})\n`, 'utf8');
    }
  } catch (e) {
    console.error('after-file-edit hook:', e.message);
  }
});
