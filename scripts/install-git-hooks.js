/**
 * Installs git hooks from scripts/git-hooks/ into .git/hooks/.
 * Run automatically on pnpm install via the "prepare" script.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const hooksDir = path.join(root, ".git", "hooks");
const sourceDir = path.join(root, "scripts", "git-hooks");

if (!fs.existsSync(path.join(root, ".git"))) return;
if (!fs.existsSync(sourceDir)) return;

if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

const preCommitSrc = path.join(sourceDir, "pre-commit");
const preCommitDest = path.join(hooksDir, "pre-commit");
if (fs.existsSync(preCommitSrc)) {
  fs.copyFileSync(preCommitSrc, preCommitDest);
  fs.chmodSync(preCommitDest, 0o755);
}
