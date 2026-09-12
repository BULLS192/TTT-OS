# TTT OS Authentication & Access Control

## Production model

TTT OS must not use Vercel account authentication as the employee login experience.

Production access is designed as:

1. Visitor reaches the TTT OS production URL.
2. TTT OS displays its own branded sign-in screen.
3. Identity is verified through Google OAuth using Supabase Auth.
4. TTT OS reads the signed-in user's `public.user_profiles` record.
5. Access is granted only when `active = true`.
6. The user's TTT role is loaded for application permissions and future database RLS policies.

Vercel Deployment Protection should remain enabled for preview/development deployments. Once application authentication is verified, the production deployment can be public at the Vercel layer because TTT OS itself will enforce access.

## Roles

- `owner_admin` — full TTT OS administration
- `manager` — operational management
- `technician` — assigned work and technician workflows
- `service_advisor` — customer, estimate, scheduling and intake workflows
- `office` — office/admin workflows
- `read_only` — view-only access where explicitly permitted

The initial browser prototype still contains Derek's legacy local demo user. Production authorization is separate and comes from Supabase Auth + `user_profiles`.

## User onboarding

A first Google sign-in creates an Auth user and an inactive `user_profiles` row with role `read_only`.

This is intentional: possession of a Google account alone must never grant TTT OS access.

An `owner_admin` must explicitly activate the user and assign the correct role. Until the admin UI is built, activation can be performed from the Supabase administration interface or a controlled database operation.

## Security rules

- Browser code receives only the Supabase project URL and publishable key.
- Never place a Supabase secret/service-role key in frontend code or Vercel public output.
- Role and `active` state are stored in the database, not in user-editable Google/Supabase user metadata.
- `user_profiles` has RLS enabled.
- Authenticated users can read only their own profile in the initial policy.
- New accounts default to inactive and read-only.
- Customer/work-order data will receive its own RLS policies as the production database migration proceeds.
- TTT OS pages are marked `noindex,nofollow,noarchive`.

## Vercel environment variables

Production builds expect:

- `TTT_AUTH_ENABLED=true`
- `TTT_SUPABASE_URL=https://<project-ref>.supabase.co`
- `TTT_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`

If `TTT_AUTH_ENABLED` is not `true`, the current prototype remains accessible without the application login. This is deliberate so authentication can be tested before changing production access.

## Deployment sequence

1. Create a dedicated Supabase project for TTT OS.
2. Apply `supabase/001_auth_rbac.sql`.
3. Configure Google as an Auth provider.
4. Add the production and preview URLs to the Supabase redirect allow list.
5. Set the three Vercel environment variables above on the TTT OS project.
6. Deploy the authentication branch to a protected preview.
7. Sign in with the initial owner account once.
8. Activate that user and set role to `owner_admin`.
9. Verify login, logout, session persistence and blocked inactive-user behavior.
10. Merge to production.
11. Change Vercel Deployment Protection so previews remain protected while production relies on TTT OS authentication.

## Next production-data phase

Authentication is only the first production boundary. The current OS still stores operational demo data in browser `localStorage`. The next migration should move customers, vehicles, jobs/work orders, inspections, media metadata, signatures and audit events into Supabase/Postgres and object storage with role-aware RLS.
