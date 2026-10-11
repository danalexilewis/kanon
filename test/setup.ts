import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'kanon-test-'));

process.env.KANON_HOME = join(root, 'kanon-home');
process.env.KANON_CACHE = join(root, 'kanon-cache');
process.env.XDG_CONFIG_HOME = join(root, 'xdg-config');
process.env.XDG_CACHE_HOME = join(root, 'xdg-cache');
process.env.QMD_CONFIG_DIR = join(root, 'qmd-config');

const gitConfig = join(root, 'gitconfig');
writeFileSync(
  gitConfig,
  '[user]\n\tname = Kanon Test\n\temail = kanon-test@example.test\n[init]\n\tdefaultBranch = main\n[protocol "file"]\n\tallow = always\n',
);
process.env.GIT_CONFIG_GLOBAL = gitConfig;
process.env.GIT_CONFIG_NOSYSTEM = '1';

export const testRoot = root;
