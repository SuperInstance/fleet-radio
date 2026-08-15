// Fleet Radio — Shell-string subprocess ban enforcement test.
//
// Fleet critical path rule: NEVER shell=True / os.system / shell-string
// subprocess calls. All subprocess invocations must be list-form
// (array args, no shell): execFileSync('cmd', [args...]), spawnSync,
// spawn with array args, subprocess.run([...]).
//
// This test greps every source file for the banned patterns so a
// regression fails the suite instead of reaching production.
//
// Run with: npx tsx --test tests/shell-ban.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BANNED_PATTERNS: RegExp[] = [
  /shell\s*=\s*true/i,                  // Python subprocess shell=True
  /os\.system\s*\(/,                    // Python os.system
  /\bexecSync\s*\(/,                    // Node shell-string execSync
  /child_process\s*\.\s*exec\s*\(/,     // Node child_process.exec (string command)
  /subprocess\s*\.\s*(run|call|Popen|check_output|check_call)\s*\([^)]*shell\s*=/s, // Python shell= in subprocess calls
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && /\.(ts|js|py)$/.test(e.name))
    .map(e => join(dir, e.name));
}

test('no shell-string subprocess calls in src/', () => {
  const offenders: string[] = [];
  for (const file of sourceFiles('src')) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (BANNED_PATTERNS.some(re => re.test(line))) {
        offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `Banned shell-string subprocess patterns found (use list-form execFileSync/spawnSync instead):\n${offenders.join('\n')}`
  );
});

test('all child_process imports in src/ are list-form-safe', () => {
  for (const file of sourceFiles('src')) {
    const content = readFileSync(file, 'utf-8');
    const importMatch = content.match(/from\s+['"]node:child_process['"]/);
    if (!importMatch) continue;
    const imported = content.slice(0, importMatch.index!).match(/import\s*\{([^}]+)\}/);
    const names = imported ? imported[1].split(',').map(s => s.trim()) : [];
    for (const name of names) {
      // execFileSync / spawnSync / spawn are list-form-safe; execSync and
      // exec (string-command) are banned by the critical path rule.
      assert.ok(
        !['execSync', 'exec'].includes(name),
        `${file} imports banned '${name}' — use execFileSync/spawnSync with array args`
      );
    }
  }
});
