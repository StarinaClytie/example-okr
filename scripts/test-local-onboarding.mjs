// End-to-end local Auth + approval smoke test. Creates disposable fake users.
// Run only after db reset and database tests, against project_id okr-repro-check.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workdir = process.argv[2];
assert(workdir, 'Supply the disposable Supabase work directory');
assert.match(readFileSync(resolve(workdir, 'supabase/config.toml'), 'utf8'), /^project_id\s*=\s*"okr-repro-check"\s*$/m);
const status = JSON.parse(execFileSync(process.execPath, [resolve(root, 'node_modules/supabase/dist/supabase.js'), 'status', '-o', 'json', '--workdir', workdir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const api = new URL(status.API_URL);
const mail = new URL(status.MAILPIT_URL ?? status.INBUCKET_URL);
for (const url of [api, mail]) assert(['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol === 'http:', 'Local endpoints only');
function sql(text) {
  return execFileSync('docker', ['exec', '-i', 'supabase_db_okr-repro-check', 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-At', '-v', 'ON_ERROR_STOP=1'], { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}
assert.equal(sql('SELECT count(*) FROM public.organizations;').trim(), '0', 'Reset the disposable database before this test');
const client = () => createClient(api.origin, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
async function ok(promise) {
  const result = await promise;
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}
async function mailToken(email, type) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(`${mail.origin}/api/v1/messages`);
    assert(response.ok, 'Local mail inbox unavailable');
    const inbox = await response.json();
    for (const message of inbox.messages ?? []) {
      if (!message.To?.some((recipient) => recipient.Address === email)) continue;
      const detail = await (await fetch(`${mail.origin}/api/v1/message/${message.ID}`)).json();
      const links = `${detail.HTML ?? ''} ${detail.Text ?? ''}`.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
      for (const link of links) {
        const url = new URL(link.replaceAll('&amp;', '&'));
        if (url.origin === api.origin && url.searchParams.get('type') === type) return url.searchParams.get('token');
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Local ${type} email was not captured`);
}
async function register() {
  const auth = client();
  const email = `okr-${randomUUID()}@example.test`;
  const password = `${randomUUID()}Aa1!`;
  const signup = await ok(auth.auth.signUp({ email, password }));
  assert.equal(signup.session, null, 'Email confirmation must be required');
  const token = await mailToken(email, 'signup');
  assert(token, 'Confirmation token missing');
  const verified = await ok(auth.auth.verifyOtp({ token_hash: token, type: 'signup' }));
  assert(verified.user?.email_confirmed_at, 'Email not confirmed');
  return { auth, email, password, id: verified.user.id };
}
const admin = await register();
const bootstrap = readFileSync(resolve(root, 'scripts/bootstrap-admin.sql'), 'utf8').replace('00000000-0000-0000-0000-000000000000', admin.id);
sql(bootstrap);
assert.equal((await ok(admin.auth.rpc('get_my_profile_state'))).state, 'active');
console.log('PASS: local signup, captured confirmation email, first administrator bootstrap and authenticated identity');
const employee = await register();
await ok(employee.auth.rpc('create_pending_profile', { p_display_name: 'Local smoke employee' }));
assert.equal((await ok(employee.auth.rpc('get_my_profile_state'))).state, 'pending');
await ok(admin.auth.rpc('approve_pending_user', { p_target_user_id: employee.id, p_role: 'employee' }));
assert.equal((await ok(employee.auth.rpc('get_my_profile_state'))).state, 'active');
await ok(employee.auth.auth.signOut());
await ok(employee.auth.auth.signInWithPassword({ email: employee.email, password: employee.password }));
const profile = await ok(employee.auth.from('profiles').select('display_name').eq('id', employee.id).single());
assert.equal(profile.display_name, 'Local smoke employee');
console.log('PASS: pending signup, administrator approval, login and persisted profile');
const denied = await employee.auth.rpc('approve_pending_user', { p_target_user_id: admin.id, p_role: 'administrator' });
assert(denied.error, 'Employee must not gain administrator approval privileges');
assert.equal(denied.error.code, '42501');
console.log('PASS: employee cannot approve or promote accounts');
await ok(employee.auth.auth.resetPasswordForEmail(employee.email, { redirectTo: 'http://127.0.0.1:5173/auth/reset-password' }));
assert(await mailToken(employee.email, 'recovery'), 'Recovery token missing');
console.log('PASS: password recovery email captured locally (no external delivery)');
await ok(employee.auth.auth.signOut());
await ok(admin.auth.auth.signOut());
