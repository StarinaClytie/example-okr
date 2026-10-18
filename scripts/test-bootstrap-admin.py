"""Exercise the real bootstrap SQL in an explicitly named, disposable local DB.

Usage: python3 scripts/test-bootstrap-admin.py supabase_db_okr-repro-check
Each case rolls back all fixtures and bootstrap writes. Never targets remote DBs.
"""
import pathlib
import subprocess
import sys

if len(sys.argv) != 2 or sys.argv[1] != 'supabase_db_okr-repro-check':
    raise SystemExit('Requires disposable container supabase_db_okr-repro-check')
container = sys.argv[1]
source = pathlib.Path(__file__).with_name('bootstrap-admin.sql').read_text()
uid = 'a0000000-0000-0000-0000-000000000001'
script = source.replace('00000000-0000-0000-0000-000000000000', uid, 1)
fixture = f"INSERT INTO auth.users (id,email,email_confirmed_at) VALUES ('{uid}','bootstrap@example.test',now());"

def run(name, sql, expected_error=None):
    result = subprocess.run(
        ['docker', 'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1'],
        input='BEGIN;\n' + sql + '\nROLLBACK;', text=True, capture_output=True)
    if expected_error:
        assert result.returncode != 0 and expected_error in result.stderr, (name, result.stderr)
    else:
        assert result.returncode == 0, (name, result.stderr)
    print('PASS:', name)

run('unconfigured input rejected', source, 'Set a real user_id')
run('blank organization rejected', fixture + script.replace("'My organization'", "' '"), 'Set a real user_id')
run('blank display name rejected', fixture + script.replace("'Administrator'", "' '"), 'Set a real user_id')
run('unprivileged caller rejected', 'SET LOCAL ROLE authenticated;' + script, 'permission denied')
run('unknown Auth user rejected', script, 'email-confirmed Auth user')
run('unconfirmed Auth user rejected', fixture.replace('now()', 'NULL') + script, 'email-confirmed Auth user')
run('nonempty organization rejected', fixture + "INSERT INTO public.organizations(name) VALUES ('Existing');" + script, 'not empty')
assertion = f"""
DO $$ BEGIN
 IF (SELECT count(*) FROM public.organizations) <> 1
 OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id='{uid}' AND approval_status='approved' AND onboarding_completed)
 OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE profile_id='{uid}' AND role='administrator' AND is_active)
 THEN RAISE EXCEPTION 'Bootstrap state incorrect'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','{uid}',true);
DO $$ BEGIN
 IF public.get_my_profile_state()->>'state' IS DISTINCT FROM 'active'
 THEN RAISE EXCEPTION 'Admin identity not operational'; END IF;
END $$;
"""
run('initial administrator resolves through real RLS identity', fixture + script + assertion)
snapshot = """
CREATE TEMP TABLE identity_snapshot AS
SELECT jsonb_build_object(
 'organizations', (SELECT jsonb_agg(to_jsonb(o)) FROM public.organizations o),
 'profiles', (SELECT jsonb_agg(to_jsonb(p)) FROM public.profiles p),
 'roles', (SELECT jsonb_agg(to_jsonb(r)) FROM public.user_roles r)
) AS state;
"""
compare = """
DO $$ BEGIN
 IF (SELECT state FROM identity_snapshot) IS DISTINCT FROM jsonb_build_object(
 'organizations', (SELECT jsonb_agg(to_jsonb(o)) FROM public.organizations o),
 'profiles', (SELECT jsonb_agg(to_jsonb(p)) FROM public.profiles p),
 'roles', (SELECT jsonb_agg(to_jsonb(r)) FROM public.user_roles r))
 THEN RAISE EXCEPTION 'Repeated bootstrap changed identity data'; END IF;
END $$;
"""
run('same bootstrap repeated without changes', fixture + script + snapshot + script + compare + assertion)
run('does not promote a pending account on rerun', fixture + script + "UPDATE public.profiles SET approval_status='pending';" + script, 'not empty')
run('changed inputs cannot repurpose existing administrator', fixture + script + script.replace("'My organization'", "'Different organization'"), 'not empty')
