# Personal guidance and optional Web Push

Version 0.6.0 adds a local day plan, explainable observations, routine settings and feedback. Targets are user-confirmed, not medically optimal sleep prescriptions. Gemma remains an optional journal summarizer; guidance rules work without AI.

## Local guidance

Today shows the next planned moments. The alarm/day-structure page contains the full plan, routine settings, optional commitments and push controls. Feedback is stored in the encrypted vault, including why a plan was difficult. Recent low energy, explicit difficulties, differences between recorded starts and chosen targets, and nearby commitments can inform the displayed support. Sparse/scattered registrations do not justify a stable trend or diagnosis.

Existing schema-one vaults without `guidance` remain readable. Guidance is an optional field, encrypted along with the rest of the diary and excluded from default JSON exports. Explicit journal inclusion includes it in JSON. Commitments are never uploaded as push content.

## Push activation status

**The new production push backend has not been activated.** The migration and Edge Function are prepared and tested locally. Automatic approval review rejected applying production DDL, stored secrets and the recurring scheduler without explicit approval of that rollout. Local plans and feedback work without it; push requires the activation below and a physical-device delivery test.

The database migration is `supabase/migrations/20261115213713_personal_guidance_push.sql`. Before applying it to the hosted project, obtain approval of the concrete database/Edge Function/scheduler activation. Do not replay earlier already-applied migrations.

## Architecture and privacy

- An explicit account-specific opt-in stores only the selected routine times, timezone, subscription keys/address, owning account/session and operational delivery metadata in `push_devices`. Sleep records, journal text, commitment labels and vault keys are not needed by the scheduler.
- Four RLS owner policies, active-session checks and column grants protect devices. At most five devices per account and four daily reminder kinds per device are accepted. The supported provider endpoints are tightly allowlisted to avoid arbitrary server-side requests.
- Job leases, bounded retry and a ten-minute stale window limit duplicates/backlogs. The batch size is 30 jobs per minute. This is a pilot implementation, not a high-volume delivery service. A provider-accepted message followed by a lost response can still be retried; topic/tag collapse reduces duplicate presentation.
- VAPID private keys and a narrowly scoped cron token are created on the server and stored in Supabase Vault. They are never frontend environment variables. Public-key bootstrap exposes only the public VAPID key and readiness.
- Private jobs/config have RLS and no app-role grants. The sole public dispatch wrapper is SECURITY INVOKER and service-role-only. Internal definer functions have an empty search_path and narrow access. App roles cannot inspect cron/net request queues.
- The `rhythm-reminders` function deliberately uses `verify_jwt: false`: the public key route is public; test requests verify the user token with Auth plus an RLS query; scheduler requests require the separate random cron token. No unauthenticated request can send a test or claim jobs. Do not deploy another unauthenticated sender.
- `pg_cron` checks each minute but calls the Edge Function only when a reminder is due. It uses `pg_net`; this consumes normal project/database/function quotas. No paid-plan upgrade is part of activation.
- Times follow the saved IANA timezone. Postgres resolves skipped/repeated clock-change times; delivery is approximate. Browser/OS/Focus/network can delay or suppress messages. Push is not an alarm guarantee or continuous local Gemma execution.
- Plan edits remain local until the user explicitly confirms the updated push schedule. Pause/disable applies to this device. Session revocation stops new dispatches; signing in again requires reconfirming the binding. Already in-flight notifications cannot be recalled.
- Account deletion cascades device/job cleanup; expired provider subscriptions are removed on 404/410. Account deletion UI remains separate work.

## Activation after approval

1. Apply only the prepared push migration to the intended Supabase project; record the actual migration version returned by the platform.
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
```

The browser scripts use `RHYTHM_TEST_URL`, defaulting to a local production preview at port 4178. Push UI uses controlled SDK/permission/subscription fixtures and sends no real notifications. `test:push` runs real in-memory Postgres/RLS via PGlite, with local stubs for Supabase Auth platform helpers, Vault, cron and net, plus real VAPID/encrypted-request generation and service-worker handling. It does not prove hosted extension compatibility or delivery.

The function is also checked with Deno 2.9.6 using its own config/lock. `tests/push-edge-runtime.mjs <path-to-deno>` executes the real handler against loopback HTTP fixtures with synthetic keys and outbound network restricted to loopback. It tests bootstrap, authorization and unsafe endpoints without touching production.
