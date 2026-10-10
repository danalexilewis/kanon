import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('test sandbox', () => {
  it('does not use the real global qmd or kanon home', () => {
    expect(process.env.QMD_CONFIG_DIR).toBeDefined();
    expect(process.env.KANON_HOME).toBeDefined();
    expect(process.env.QMD_CONFIG_DIR).not.toBe(join(homedir(), '.config', 'qmd'));
    expect(process.env.KANON_HOME).not.toBe(join(homedir(), '.config', 'kanon'));
    expect(process.env.KANON_HOME).toContain('kanon-test-');
  });
});
