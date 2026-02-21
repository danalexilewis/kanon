#!/usr/bin/env node
/**
 * Cursor afterFileEdit hook: writes reminders and protection-mode warnings to
 * .cursor/next-step.md when sensitive files are edited.
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

function getProtectionMode(root) {
  const modePath = path.join(root, '.cursor', 'protection-mode.json');
  if (!fs.existsSync(modePath)) return 'normal';

  try {
    const payload = JSON.parse(fs.readFileSync(modePath, 'utf8'));
    const mode = `${payload.mode || ''}`.toLowerCase();
    if (['safe', 'normal', 'force'].includes(mode)) return mode;
  } catch {
    return 'normal';
  }

  return 'normal';
}

function forceModeConfirmed(root) {
  const confirmationPath = path.join(root, '.cursor', 'force-mode-confirmation.md');
  if (!fs.existsSync(confirmationPath)) return false;

  const value = fs.readFileSync(confirmationPath, 'utf8');
  return value.includes('CONFIRM FORCE MODE');
}

function hasStaleSources(root) {
  const sourcesDir = path.join(root, 'sources');
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
    const mode = getProtectionMode(root);

    messages.push(`Protection mode: **${mode}**.`);

    const isIngestNonManifest = relativePath.startsWith('ingest/') && !['ingest/manifest.md', 'ingest/manifest.json'].includes(relativePath);
    const isContentEdit = relativePath.startsWith('content/');

    if (isIngestNonManifest) {
      messages.push(
        `⚠️ **Destructive intent warning:** edit detected in \`${relativePath}\`. Raw \`ingest/**\` files are append-only and should not be modified. Only \`ingest/manifest.json\` and \`ingest/manifest.md\` may be updated.`
      );
      if (mode === 'safe') {
        messages.push(
          `🛑 **Safe mode action:** revert this file edit and run **ingest** for new raw inputs instead of editing ingest files directly.`
        );
      }
    }

    if (isContentEdit && hasStaleSources(root)) {
      messages.push(
        `⚠️ **Destructive intent warning:** edit detected in \`${relativePath}\` while \`sources/**\` and/or \`ontology/ontology.md\` are ahead of \`content/**\`. Regenerate with **update-docs** instead of manual content edits.`
      );
      if (mode === 'safe') {
        messages.push('🛑 **Safe mode action:** avoid manual edits in `content/**`; run **update-docs** to regenerate derived output.');
      }
    }

    if (mode === 'force' && (isIngestNonManifest || isContentEdit) && !forceModeConfirmed(root)) {
      messages.push(
        '⛔ **Force mode is not confirmed:** create `.cursor/force-mode-confirmation.md` with `CONFIRM FORCE MODE` before continuing risky edits.'
      );
    }

    if (relativePath.startsWith('ingest/') && !relativePath.includes('manifest.md')) {
      messages.push(
        `New or updated ingest file: \`${relativePath}\`. Run the **ingest skill** to process it into \`sources/\` and \`media/\` and update the ingest manifests.`
      );
    } else if (relativePath.startsWith('sources/') || relativePath === 'ontology/ontology.md' || relativePath.startsWith('references/')) {
      messages.push(
        `Changes detected in \`${relativePath}\`. Run the **update-docs skill** to reflect these changes in \`content/\`. If \`references/\` changed, consider running **create-ontology skill** first.`
      );
    } else if (relativePath.startsWith('media/')) {
      messages.push(
        `Changes detected in \`${relativePath}\`. Ensure \`media/meta.md\` exists for new media. Run the **update-docs skill** to reflect these changes in \`content/\` (e.g., mirroring to \`public/media/\`).`
      );
    }

    if (messages.length > 1) {
      fs.mkdirSync(path.dirname(nextStepPath), { recursive: true });
      fs.writeFileSync(nextStepPath, `${messages.join('\n\n')}\n\n(Triggered by edit to: ${relativePath})\n`, 'utf8');
    }
  } catch (e) {
    console.error('after-file-edit hook:', e.message);
  }
});
