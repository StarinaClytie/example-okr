import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { disposableProjectId } from './disposable-project.mjs';

describe('explicit disposable local acceptance targets', () => {
 it.each(['okr-repro-check','okr-repro-check-20261108-acceptance'])('accepts %s', (id) => {
  expect(disposableProjectId(`project_id = "${id}"\n[api]\nport = 58321`)).toBe(id);
 });
 it.each(['example-okr','production','okr-repro-check-other/target','okr-repro-check-','okr-repro-check-x\"\nproject_id = \"other'])('rejects unsafe target %s', (id) => {
  expect(() => disposableProjectId(`project_id = "${id}"`)).toThrow(/disposable/);
 });
 it.each(['', 'project_id = \"okr-repro-check\"\nproject_id = \"okr-repro-check-other\"', `project_id = \"okr-repro-check-${'x'.repeat(64)}\"`])('rejects missing, duplicate or oversized IDs', (config) => {
  expect(() => disposableProjectId(config)).toThrow(/disposable/);
 });
 it('rejects onboarding against an ordinary project before CLI or network access', () => {
  const root=mkdtempSync(join(tmpdir(),'okr-target-test-'));
  try {
   mkdirSync(join(root,'supabase')); writeFileSync(join(root,'supabase/config.toml'),'project_id = "production"');
   const result=spawnSync(process.execPath,['scripts/test-local-onboarding.mjs',root],{encoding:'utf8'});
   expect(result.status).not.toBe(0); expect(result.stderr).toContain('disposable');
  } finally {rmSync(root,{recursive:true,force:true});}
 });
 it.skipIf(spawnSync('python3', ['--version']).status !== 0).each(['supabase_db_example-okr','supabase_db_okr-repro-check-other/target','supabase_db_okr-repro-check-'])('rejects bootstrap target %s before Docker', (target) => {
  const result=spawnSync('python3',['scripts/test-bootstrap-admin.py',target],{encoding:'utf8'});
  expect(result.status).not.toBe(0); expect(result.stderr).toContain('disposable');
 });
});
