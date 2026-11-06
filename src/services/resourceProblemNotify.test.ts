import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
// Execute the actual Edge handler with fake SDK and transport boundaries.
const source = readFileSync('supabase/functions/resource-problem-notify/index.ts', 'utf8')
  .replace(/^import .*;$/gm, '');
const executable = stripTypeScriptTypes(source);
async function invoke(options: { claim?: string; saveError?: boolean; missing?: string; invalidBody?: boolean; snapshot?: Record<string, unknown>; snapshotError?: boolean; resourceName?: string; ownerEmail?: string; from?: string } = {}) {
  let handler!: (request: Request) => Promise<Response>;
  const updates: unknown[] = [];
  const rows: Record<string, object> = {
    resource_problem_notifications: { id: 'n', organization_id: 'org', problem_id: 'p', status: 'failed', delivery_payload: options.snapshot },
    profiles: { organization_id: 'org', email: options.ownerEmail ?? 'owner@example.com' },
    resource_problems: { resource_id: 'r', reporter_id: 'reporter' }, resources: { name: options.resourceName ?? 'Printer', owner_id: 'owner' },
  };
  if (options.missing) delete rows[options.missing];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => name === 'snapshot_resource_problem_notification'
    ? { data: options.snapshot ?? args.p_payload, error: options.snapshotError ? { message: 'DB unavailable' } : null }
    : { data: options.claim ?? 'claimed', error: null });
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'caller' } }, error: null }) }, rpc,
    from: (table: string) => {
      const query: any = { select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: rows[table], error: null }),
        update: (value: unknown) => { updates.push(value); return query; },
        then: (resolve: any) => resolve({ data: [{}], error: options.saveError ? { message: 'DB unavailable' } : null }),
      };
      return query;
    },
  };
  const send = vi.fn(async (_email: Record<string, unknown>) => ({ ok: true }));
  new Function('Deno', 'createClient', 'resourceEmailConfig', 'sendTransactionalEmail', executable)(
    { env: { get: () => 'configured' }, serve: (fn: typeof handler) => { handler = fn; } },
    () => client, () => ({ appUrl: 'https://app.example.com', from: options.from ?? 'original-sender@example.com' }), send);
  return { response: await handler(new Request('https://edge.test', { method: 'POST', body: JSON.stringify(options.invalidBody ? null : { notificationId: 'n' }) })), rpc, send, updates };
}
afterEach(() => vi.restoreAllMocks());
it('passes the verified caller into the atomic DB authorization and claim', async () => {
  const { rpc } = await invoke({ claim: 'forbidden' });
  expect(rpc).toHaveBeenCalledWith('claim_resource_problem_notification', { p_notification_id: 'n', p_caller_id: 'caller' });
});
it('never sends when the atomic claim rejects authorization', async () => {
  const { response, send } = await invoke({ claim: 'forbidden' });
  expect(response.status).toBe(403);
  expect(send).not.toHaveBeenCalled();
});
it('does not report durable success when sent status persistence fails', async () => {
  const { response } = await invoke({ saveError: true });
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ delivered: false, code: 'delivery_state_unknown' });
});
it('supplies one stable provider key per notification', async () => {
  const { send } = await invoke();
  expect(send.mock.calls[0][0]).toMatchObject({ idempotencyKey: 'resource-problem/n' });
});

it.each(['resource_problems', 'resources'])('releases claim when %s is missing', async (missing) => {
  const { response, updates, send } = await invoke({ missing });
  expect(response.status).toBe(404);
  expect(updates).toContainEqual({ status: 'failed', error_code: 'not_found' });
  expect(send).not.toHaveBeenCalled();
});
it('rejects ambiguous retries after the provider window', async () => {
  const { response, send } = await invoke({ claim: 'retry_window_expired' });
  expect(response.status).toBe(409);
  expect(send).not.toHaveBeenCalled();
});
it('rejects JSON null as an invalid request', async () => {
  const { response, send } = await invoke({ invalidBody: true });
  expect(response.status).toBe(400);
  expect(send).not.toHaveBeenCalled();
});

it('reuses the persisted payload after acceptance and failed audit write, despite later changes', async () => {
  const first = await invoke({ saveError: true });
  expect(first.response.status).toBe(503);
  const snapshot = first.rpc.mock.calls.find(([name]) => name === 'snapshot_resource_problem_notification')![1].p_payload as Record<string, unknown>;
  const retry = await invoke({ snapshot, resourceName: 'Changed resource', ownerEmail: 'new-owner@example.com', from: 'new-sender@example.com' });
  expect(retry.send.mock.calls[0][0]).toEqual(first.send.mock.calls[0][0]);
  expect(retry.send.mock.calls[0][0]).toMatchObject({ from: 'original-sender@example.com', to: 'owner@example.com' });
});
it('does not call the provider until the complete payload is durable', async () => {
  const { response, send } = await invoke({ snapshotError: true });
  expect(response.status).toBe(503);
  expect(send).not.toHaveBeenCalled();
});
