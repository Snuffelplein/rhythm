# Personal guidance and optional Web Push

Version 0.6.0 adds a local day plan, explainable observations, routine settings and feedback. Targets are user-confirmed, not medically optimal sleep prescriptions. Gemma remains an optional journal summarizer; guidance rules work without AI.

## Local guidance

Today shows the next planned moments. The alarm/day-structure page contains the full plan, routine settings, optional commitments and push controls. Feedback is stored in the encrypted vault, including why a plan was difficult. Recent low energy, explicit difficulties, differences between recorded starts and chosen targets, and nearby commitments can inform the displayed support. Sparse/scattered registrations do not justify a stable trend or diagnosis.

Existing schema-one vaults without `guidance` remain readable. Guidance is an optional field, encrypted along with the rest of the diary and excluded from default JSON exports. Explicit journal inclusion includes it in JSON. Commitments are never uploaded as push content.

## Push activation status

**The push backend is active on the configured Supabase project.** The user explicitly approved the database, Vault, Edge Function and minute scheduler rollout. Hosted owner/session isolation, generic HTTP denial tests and the scheduler-to-function path have passed. There are no registered devices yet; physical iPhone delivery is not verified. The corresponding 0.6.0 frontend still needs its controlled HTTPS deployment and existing release checks.

Applied migrations are `20261115221529_personal_guidance_push`, `20261115221738_push_policy_hardening` and `20261115222412_single_use_push_cron_tickets`. Filenames match the actual hosted history. Do not replay these migrations on the configured project.

## Architecture and privacy

- An explicit account-specific opt-in stores only the selected routine times, timezone, subscription keys/address, owning account/session and operational delivery metadata in `push_devices`. Sleep records, journal text, commitment labels and vault keys are not needed by the scheduler.
- Four RLS owner policies, active-session checks and column grants protect devices. At most five devices per account and four daily reminder kinds per device are accepted. The supported provider endpoints are tightly allowlisted to avoid arbitrary server-side requests.
- Job leases, bounded retry and a ten-minute stale window limit duplicates/backlogs. The batch size is 30 jobs per minute. This is a pilot implementation, not a high-volume delivery service. A provider-accepted message followed by a lost response can still be retried; topic/tag collapse reduces duplicate presentation.
- The VAPID private key is created on the server and stored in Supabase Vault. It never enters frontend variables or the HTTP queue. Public-key bootstrap exposes only the public VAPID key and readiness. The former static cron secret has been rotated and retired.
- Private jobs/config/ticket tables have RLS, explicit restrictive client-denial policies and no app-role grants. Public dispatch/consume wrappers are SECURITY INVOKER and service-role-only. Internal definer functions have an empty search_path and narrow access.
- **Hosted pg_net queue grants cannot be restricted by the project postgres role.** Treat its headers and bodies as readable by database roles, even after REVOKE statements. The live check confirmed this [platform constraint](https://supabase.com/kb/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357). Do not put lasting credentials, VAPID keys or diary data in pg_net requests or responses.
- Each due scheduler call now creates a random 256-bit one-use ticket, stores only its SHA-256 hash privately, and queues the ticket with a 90-second lifetime. The function consumes it atomically before claiming jobs; replay and expiry are denied. A database role that captures a ticket could race the legitimate caller within that window, but cannot forge future tickets or obtain lasting credentials; the ticket permits only dispatch of already-due, user-confirmed reminders. Responses contain a processed count only.
- The `rhythm-reminders` function deliberately uses `verify_jwt: false`: the public key route is public; test requests verify the user token with Auth plus an RLS query; scheduler requests require a valid unconsumed ticket. No unauthenticated request can send a test or claim jobs. Do not deploy another unauthenticated sender.
- `pg_cron` checks each minute but calls the Edge Function only when a reminder is due. It uses `pg_net`; this consumes normal project/database/function quotas. No paid-plan upgrade is part of activation.
- Times follow the saved IANA timezone. Postgres resolves skipped/repeated clock-change times; delivery is approximate. Browser/OS/Focus/network can delay or suppress messages. Push is not an alarm guarantee or continuous local Gemma execution.
- Plan edits remain local until the user explicitly confirms the updated push schedule. Pause/disable applies to this device. Session revocation stops new dispatches; signing in again requires reconfirming the binding. Already in-flight notifications cannot be recalled.
- Account deletion cascades device/job cleanup; expired provider subscriptions are removed on 404/410. Account deletion UI remains separate work.

## Provisioning and device validation

1. On a new project, apply the migration history in order. On the configured project these migrations are already active; do not apply them twice.
2. Deploy `supabase/functions/rhythm-reminders/index.ts` with its `protocol.mjs`, `deno.json` and `deno.lock`, using the function name `rhythm-reminders` and the own-auth design above. Platform-injected server credentials are used only inside the function; no frontend secret is required.
3. Verify that the public key route returns only public configuration, unauthenticated send attempts fail, SQL owner/session isolation holds and advisors have been reviewed. Verify Vault/cron/net grants and the idle scheduler without reading or logging secret values.
4. Deploy the corresponding frontend to the controlled HTTPS preview. On iPhone add it to the Home Screen, open it, log in, unlock, confirm the selected schedule/metadata consent, and grant notification permission. Send one user-requested test and check actual receipt on the phone.
5. Verify pause, unsubscribe, logout/session revocation and a scheduled reminder. Keep the existing hosting/Auth/email/iPhone release checks from `SECURITY.md` in force.

## Tests

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:guidance
npm.cmd run test:push
npm.cmd run test:push:browser
npm.cmd run test:push:hosted
```

The browser scripts use `RHYTHM_TEST_URL`, defaulting to a local production preview at port 4178. Push UI uses controlled SDK/permission/subscription fixtures and sends no real notifications. `test:push` runs real in-memory Postgres/RLS via PGlite, with local stubs for Supabase Auth platform helpers, Vault, cron and net, plus real VAPID/encrypted-request generation and service-worker handling. It does not prove hosted extension compatibility or delivery.

The function is also checked with Deno 2.9.6 using its own config/lock. `tests/push-edge-runtime.mjs <path-to-deno>` executes the real handler against loopback HTTP fixtures with synthetic keys and outbound network restricted to loopback. It tests bootstrap, authorization and unsafe endpoints without touching production.

`tests/rls-push.sql` is a trusted hosted SQL test with complete rollback. It temporarily locks the device table and refuses queue tests if actual devices exist; use an isolated test project after onboarding real users. It checks owner/session isolation, permissions, timing, queue behavior and ticket replay/expiry without provider calls. The separate empty-queue pg_net test returned HTTP 200 on first ticket use and 401 on reuse, with zero notifications sent.
