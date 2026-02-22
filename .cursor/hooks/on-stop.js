#!/usr/bin/env node
/**
 * Cursor stop hook: checks for unprocessed ingest files or stale docs,
 * and writes a suggestion to .cursor/next-step.md.
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

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const roots = payload.workspace_roots || [process.cwd()];
    const root = path.resolve(roots[0]);
    const nextStepPath = path.join(root, '.cursor', 'next-step.md');
    let msg = '';

    // Check for unprocessed ingest files
    const ingestDir = path.join(root, 'src', 'ingest');
    const ingestManifestJsonPath = path.join(ingestDir, 'manifest.json');
    let ingestManifest = {};
    if (fs.existsSync(ingestManifestJsonPath)) {
      ingestManifest = JSON.parse(fs.readFileSync(ingestManifestJsonPath, 'utf8'));
    }

    if (fs.existsSync(ingestDir)) {
      const allIngestFiles = fs.readdirSync(ingestDir)
        .filter((f) => f !== 'manifest.md' && f !== 'manifest.json' && !f.startsWith('.'))
        .map((f) => path.join(ingestDir, f));

      const unprocessed = allIngestFiles.filter((file) => {
        const relativeFilePath = path.relative(root, file);
        return !ingestManifest[relativeFilePath] || ingestManifest[relativeFilePath].status === 'new';
      });

      if (unprocessed.length > 0) {
        msg += `${unprocessed.length} ingest file(s) not yet processed: ${unprocessed.map(f => path.relative(root, f)).join(', ')}. Run the **ingest skill**.\n`;
      }
    }

    // Check for stale docs (sources changed but content not updated)
    const sourcesDir = path.join(root, 'src', 'sources');
    const contentManifestJsonPath = path.join(root, 'content', 'manifest.json');
    let contentManifest = {};
    if (fs.existsSync(contentManifestJsonPath)) {
      contentManifest = JSON.parse(fs.readFileSync(contentManifestJsonPath, 'utf8'));
    }

    if (fs.existsSync(sourcesDir)) {
      const allSourceFiles = fs.readdirSync(sourcesDir, { recursive: true })
        .filter((f) => (f.endsWith('.md') || f.endsWith('.mdx')) && !f.startsWith('.'))
        .map((f) => path.join(sourcesDir, f));

      const staleSources = allSourceFiles.filter((file) => {
        const relativeFilePath = path.relative(root, file);
        const currentHash = calculateFileHash(file);
        return !contentManifest[relativeFilePath] || contentManifest[relativeFilePath].hash !== currentHash;
      });

      if (staleSources.length > 0) {
        msg += `${staleSources.length} source file(s) have changed since last docs update: ${staleSources.map(f => path.relative(root, f)).join(', ')}. Run the **update-docs skill**.\n`;
      }
    }

    if (msg) {
      fs.mkdirSync(path.dirname(nextStepPath), { recursive: true });
      fs.writeFileSync(nextStepPath, msg, 'utf8');
    }
  } catch (e) {
    console.error('on-stop hook:', e.message);
  }
});
