// Caller-aware database authorization and claim are atomic. Provider requests use
// a stable notification identity; ambiguous retries stop before Resend's 24h TTL.
// Provider acceptance is reported as delivered only after the audit write succeeds.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resourceEmailConfig, sendTransactionalEmail } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROBLEM_TYPE_LABELS: Record<string, string> = {
  location_incorrect: 'Location incorrect',
  missing: 'Missing',
  damaged: 'Damaged',
  malfunction: 'Malfunction',
  quantity_incorrect: 'Incorrect quantity',
  manual_issue: 'Manual/instructions issue',
  other: 'Other',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, delivered: false, code: 'unauthorized' }, 405);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRoleKey) {
    return json({ ok: false, delivered: false, code: 'network' }, 500);
  }

  // Verify the caller's JWT using their own identity.
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user: caller }, error: userError } = await callerClient.auth.getUser();
  if (userError || !caller) {
    return json({ ok: false, delivered: false, code: 'unauthorized' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, delivered: false, code: 'network' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ ok: false, delivered: false, code: 'network' }, 400);
  }
  const notificationId = typeof body.notificationId === 'string' ? body.notificationId : '';
  if (notificationId === '') {
    return json({ ok: false, delivered: false, code: 'network' }, 400);
  }

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve the notification server-side.
  const { data: notification, error: notificationError } = await adminClient
    .from('resource_problem_notifications')
    .select('id,organization_id,problem_id,recipient_id,status,delivery_payload')
    .eq('id', notificationId)
    .maybeSingle();
  if (notificationError || !notification) {
    return json({ ok: false, delivered: false, code: 'not_found' }, 404);
  }

  // Atomic claim: pending/failed are claimed; a sent notification short-circuits
  // to delivered; a live concurrent delivery is left untouched.
  const { data: claimResult, error: claimError } = await adminClient
    .rpc('claim_resource_problem_notification', { p_notification_id: notificationId, p_caller_id: caller.id });
  if (claimError) return json({ ok: false, delivered: false, code: 'network' }, 503);
  const claim = claimResult as string;
  if (claim === 'not_found') return json({ ok: false, delivered: false, code: claim }, 404);
  if (claim === 'forbidden') return json({ ok: false, delivered: false, code: claim }, 403);
  if (claim === 'retry_window_expired') return json({ ok: false, delivered: false, code: claim }, 409);
  if (claim === 'sent') {
    return json({ ok: true, delivered: true, code: 'already_sent' });
  }
  if (claim === 'in_progress') {
    return json({ ok: false, delivered: false, code: 'in_progress' }, 409);
  }

  if (claim !== 'claimed') return json({ ok: false, delivered: false, code: 'network' }, 503);
  const fail = async (code: string, status = 503) => {
    const { error } = await adminClient.from('resource_problem_notifications')
      .update({ status: 'failed', error_code: code }).eq('id', notificationId);
    return json({ ok: false, delivered: false, code: error ? 'delivery_state_unknown' : code }, error ? 503 : status);
  };

  let payload = notification.delivery_payload;
  if (!payload) {
    // Resolve the problem, resource, owner email, and reporter name server-side.
    const { data: problem, error: problemError } = await adminClient
      .from('resource_problems')
      .select('resource_id,problem_type,description,reporter_id')
      .eq('id', notification.problem_id)
      .maybeSingle();
    if (problemError || !problem) return fail('not_found', 404);

    const { data: resource, error: resourceError } = await adminClient
      .from('resources')
      .select('name,owner_id')
      .eq('id', problem.resource_id)
      .maybeSingle();
    if (resourceError || !resource) return fail('not_found', 404);

    const { data: owner, error: ownerError } = await adminClient
      .from('profiles')
      .select('email,display_name')
      .eq('id', resource.owner_id)
      .maybeSingle();
    if (ownerError || !owner || !owner.email || owner.email.trim() === '') {
      return fail('owner_email_missing');
    }

    const { data: reporter, error: reporterError } = await adminClient
      .from('profiles')
      .select('display_name')
      .eq('id', problem.reporter_id)
      .maybeSingle();
    const reporterName = (reporterError || !reporter) ? '' : (reporter.display_name ?? '');

    const emailConfig = resourceEmailConfig((key) => Deno.env.get(key));
    if (!emailConfig) {
      return fail('email_not_configured');
    }
    const appUrl = emailConfig.appUrl;
    const deepLink = `${appUrl}/resources/${problem.resource_id}`;
    const subject = `[Example OKR] Resource problem reported: ${resource.name}`;
    const text = [
      'A problem has been reported for a resource you are responsible for.',
      '',
      `Resource: ${resource.name}`,
      `Problem: ${PROBLEM_TYPE_LABELS[problem.problem_type] ?? problem.problem_type}`,
      `Reported by: ${reporterName || 'Unknown'}`,
      '',
      `Description: ${problem.description ?? ''}`,
      '',
      `Open resource: ${deepLink}`,
    ].join('\n');

    payload = { from: emailConfig.from, to: owner.email, subject, text };
  }
  // The DB preserves the first full request under a row lock, including sender.
  // Always use its result so a concurrent/stale worker cannot change the request.
  const { data: snapshot, error: snapshotError } = await adminClient.rpc('snapshot_resource_problem_notification', {
    p_notification_id: notificationId, p_payload: payload,
  });
  if (snapshotError || !snapshot) return fail('delivery_state_unknown');

  const sent = await sendTransactionalEmail({ ...snapshot, idempotencyKey: `resource-problem/${notificationId}` });
  if (!sent.ok) return fail(sent.code);

  const { data: saved, error: saveError } = await adminClient.from('resource_problem_notifications')
    .update({ status: 'sent', sent_at: new Date().toISOString(), error_code: null })
    .eq('id', notificationId).eq('status', 'sending').select('id');
  if (saveError || !saved?.length) {
    // Leave the claim intact: its eventual retry reuses the same provider key.
    return json({ ok: false, delivered: false, code: 'delivery_state_unknown' }, 503);
  }
  return json({ ok: true, delivered: true, code: 'sent' });
});
