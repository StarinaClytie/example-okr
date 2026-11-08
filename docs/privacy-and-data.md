# Work hours, report access and data lifecycle

Example OKR connects KR progress to dated results and evidence. Work hours are an optional input to that workflow; they are not a productivity score or a measure of the value of a person's work. The application does not capture screenshots, keystrokes, idle time or background activity. Reports are entered by users.

## Choose whether to collect hours

An active, approved **administrator** can change **Settings → System → Enable work-hour recording**, then save the work-hour settings separately from the organization calendar. The public demo supports the same switch with fictional data; refresh resets demo changes.

Work-hour recording starts **enabled**, including after upgrading an existing deployment, to preserve existing behavior. A team that only needs KR progress and evidence can turn it off before inviting users. Apply all database migrations and deploy the matching frontend together.

When disabled:

- New report submissions and new revisions save zero in the numeric hours fields, including requests from an older frontend. Zero is a compatibility value for an unused field, not a statement that a person did no work.
- Report authoring, report tables, detail views, Word/PDF exports and dashboard hour views omit hour fields. Reports, results, KR updates, attachments and review remain available.
- The HR work-hours navigation disappears and the database rejects the HR hours RPC. Changing a URL or calling the RPC directly does not enable it.
- Other open browser sessions should refresh to update their controls. The database enforces the setting immediately for new stored hours; an older open page may still display information it already loaded.

**Disabling is not deletion or historical redaction.** Existing reports, prior revisions, and their recorded hours remain stored. Existing report access rules still permit authorized readers to retrieve historical hour metadata through report APIs. Database operators retain administrative access. Turning hours back on restores hour views of retained records. Comments, attachments and free text are not inspected or scrubbed for mentions of time: ask users not to enter unnecessary personal information there.

## Who can see what

These are application roles, separate from direct database/cloud-administrator access. All business access is scoped to the caller's organization and operational account; classification, ownership and project rules can further restrict it.

| Role | Report narratives and evidence | Work-hour access when enabled | Change organization hours setting |
| --- | --- | --- | --- |
| Employee | Own reports; no general right to coworkers' report bodies | Own authorized reports | No |
| Project Leader | Own reports and authorized blocks for projects they directly lead; mixed-project reports remain block-scoped | Hours on the report blocks they are allowed to read | No |
| Management | Reports within the authorized organization/classification scope; can review others' reports | Hours on authorized reports and corresponding dashboard views | No |
| HR | Own reports, including work on HR objectives; the HR hours overview does not grant access to others' narratives or attachments | Organization-wide dated investment rows through the dedicated HR RPC: person, role, project/Objective/KR labels and hours, without report narrative or evidence | No |
| Administrator | Account/configuration administration alone does not grant general business-report reading or review rights | No general HR overview permission | Yes |

File-download authorization is checked separately; knowing an object path does not grant access. Export uses the report detail available to the caller. Downloaded documents and screenshots become separate copies outside application access control.

The access model is implemented in [database migrations](../supabase/migrations), [report permission checks](../src/auth/permissionService.ts), and exercised by [block-level report tests](../supabase/tests/daily_report_leader_visibility.test.sql) and [HR tests](../supabase/tests/hr_okr_work_hours.test.sql). An administrator who also operates the database or holds server credentials can bypass application-role restrictions; restrict those credentials separately.

## What persists

A real deployment stores account/profile and role/project membership data; OKRs and progress updates; report dates, revisions, descriptions, results and optional hours; comments and review records; notification delivery state; and attachment metadata. File bytes live in your configured private object-storage bucket. Authentication, infrastructure logs and email copies have their own lifecycles. The static public demo uses fictional in-memory data and does not persist team submissions to a backend.

## Retention and deletion today

There is **no automatic report-retention period, scheduled purge, or self-service account/data-erasure workflow**. Report revision history is retained, and confirmed or past-date reports have editing locks. Hiding a feature, disabling an account, archiving an Objective, or marking an attachment deleted must not be represented as erasing all historical data.

Before real use, the deployment operator should assign a person responsible for requests and publish the team's purpose, permitted viewers, retention periods and contact route. Choose retention periods for reports, files, audit/delivery logs and backups explicitly. This repository does not select them on the team's behalf.

For a retention deadline or an individual's deletion request, the current operational process is:

1. Verify the requester, organization, intended records and any reason records must be retained. Restrict the operator account and arrange a maintenance window if needed.
2. Rehearse a scoped removal or anonymization in an isolated copy. Inventory report revisions/blocks, comments, attachment and revision metadata, notifications/delivery records, profile/Auth references and linked business records. Foreign keys can restrict deletion or cascade to additional records; inspect the installed schema rather than running a blanket `DELETE` or deleting the Auth user first.
3. Execute the reviewed database change with operator privileges, then remove affected file objects from the configured bucket using the exact stored keys. Database-row removal does not remove external OSS/S3/R2 objects automatically. The normal attachment-removal workflow remains subject to report locks and revision-history safeguards and is not a whole-account purge tool.
4. Confirm that no unauthorized records changed, that removed objects cannot be retrieved, and that retained reports still work. Cover exports, recipient email copies, caches and operational logs separately; application deletion cannot revoke a file already downloaded by another person. Already issued download URLs can remain usable until expiry unless the underlying object is removed.
5. Apply the backup retention policy and record the request's outcome without copying the removed personal content into the log. Restore procedures need a way to reapply completed deletions so a backup restore does not silently reintroduce data.

No destructive purge script is bundled: the correct scope depends on the deployment's records and retention decision. A tested retention/erasure workflow with dry-run previews, cross-storage cleanup and audit outcomes is a future extension, not a currently available feature. See the [deployment guide](supabase-setup.md) and [object-storage guide](object-storage.md).
