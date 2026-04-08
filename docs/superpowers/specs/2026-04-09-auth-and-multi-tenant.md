# Auth & Multi-Tenant Design Spec

> **Sub-project 4** of the Pulse AI Dev Health Monitor roadmap.

## Overview

Add full multi-tenant SaaS authentication to Pulse using Clerk as the auth provider. Shared database with tenant column isolation. Three roles per organization: Owner, Admin, Member. Org-scoped API keys for agent authentication with optional user tokens for attribution.

---

## 1. Tenant & User Data Model

### New Prisma models

**Organization** — the tenant boundary:
- `id` (cuid)
- `clerkOrgId` (String, unique, nullable — null for the seed org until claimed)
- `name` (String)
- `slug` (String, unique)
- `plan` (enum: FREE, PRO, ENTERPRISE, default FREE)
- `createdAt`, `updatedAt`

**User:**
- `id` (cuid)
- `clerkUserId` (String, unique)
- `email` (String)
- `name` (String, optional)
- `role` (enum: OWNER, ADMIN, MEMBER — cached from Clerk)
- `orgId` (FK → Organization)
- `lastSeenAt` (DateTime, optional)
- `createdAt`, `updatedAt`

**ApiKey:**
- `id` (cuid)
- `orgId` (FK → Organization)
- `keyHash` (String — bcrypt hash of full key)
- `prefix` (String — first 12 chars for display, e.g. `pk_live_ab...`)
- `name` (String — human label)
- `createdById` (FK → User)
- `lastUsedAt` (DateTime, optional)
- `revokedAt` (DateTime, optional — soft delete)
- `createdAt`

### Existing models gain `orgId`

All six existing tenant-scoped models get a non-nullable `orgId` (FK → Organization):
- `Session`, `TokenEvent`, `Rule`, `Alert`, `Insight`, `Webhook`

Every query is scoped by `orgId` via Prisma client extension (see Section 3).

### Why cache role in the DB?

Clerk is the source of truth for roles, but caching avoids an API call on every request. The role syncs via Clerk webhook on membership changes.

---

## 2. Authentication Flow

Three auth paths, one tenant context.

### Dashboard (web)

Clerk's `<ClerkProvider>` wraps the Next.js app. `<SignIn>` and `<SignUp>` components handle login. Clerk's session cookie is sent automatically. API requests include the Clerk session token in `Authorization: Bearer <clerkToken>`. The API validates it via Clerk's `verifyToken()` SDK.

### Agent connection

Agent sends `x-api-key: pk_live_abc123` on the WebSocket handshake and REST calls. API hashes the key, looks up `ApiKey` table, resolves `orgId`. Optionally sends `x-user-token: pt_live_xyz` for attribution — validated against the User table.

### Clerk webhooks

Clerk sends webhook events (via Svix) to `POST /api/clerk/webhook` for org/user lifecycle events. These keep the local User and Organization tables in sync with Clerk.

### Middleware chain

```
Request → authMiddleware → tenantMiddleware → route handler
```

- `authMiddleware`: Detects auth type (Clerk token vs API key), validates credentials, attaches `req.auth = { orgId, userId?, role? }` to the request.
- `tenantMiddleware`: Reads `req.auth.orgId`, creates a request-scoped Prisma client via `createTenantPrisma(orgId)`, attaches it as `req.prisma`.

### Token refresh

Handled entirely by Clerk on the client side. Short-lived session tokens (60s) with automatic refresh. The API is stateless — just validates the token on each request.

---

## 3. Tenant Scoping & Data Isolation

### Prisma client extension

Rather than manually adding `where: { orgId }` to every query, a Prisma client extension automatically injects tenant filtering:

```typescript
function createTenantPrisma(orgId: string) {
  return prisma.$extends({
    query: {
      $allOperations({ args, query, model }) {
        const tenantModels = ['Session', 'TokenEvent', 'Rule', 'Alert', 'Insight', 'Webhook', 'ApiKey'];
        if (!tenantModels.includes(model)) return query(args);

        // Inject orgId into where clauses (find, update, delete)
        if (args.where) args.where.orgId = orgId;
        // Inject orgId into create data
        if (args.data) args.data.orgId = orgId;

        return query(args);
      }
    }
  });
}
```

### How it flows

1. `tenantMiddleware` reads `req.auth.orgId` and creates a scoped Prisma client
2. Attaches it as `req.prisma` — every route handler uses `req.prisma` instead of the global `prisma`
3. Route handlers never see or think about `orgId` — it's injected automatically
4. The global `prisma` singleton is still used for non-tenant operations: Clerk webhook handlers, migration seed, health checks

### WebSocket scoping

The agent WebSocket handshake validates the API key and resolves `orgId`. The `orgId` is stored on the socket object (`ws.orgId`). All session data written during that connection uses the scoped client.

### Defense in depth

Postgres Row-Level Security (RLS) can be added later as a second enforcement layer. The Prisma extension is the primary mechanism.

---

## 4. Role-Based Access Control

### Permission matrix

| Action | Owner | Admin | Member |
|--------|-------|-------|--------|
| View dashboard, sessions, alerts | Yes | Yes | Yes |
| Dismiss/resolve alerts | Yes | Yes | Yes |
| Create/edit/delete rules | Yes | Yes | No |
| Create/edit/delete webhooks | Yes | Yes | No |
| Apply insights (auto-create rules) | Yes | Yes | No |
| Generate/revoke API keys | Yes | Yes | No |
| Invite/remove users | Yes | Yes | No |
| Change member roles | Yes | Yes | No |
| Org settings (name, plan) | Yes | No | No |
| Delete organization | Yes | No | No |

### Enforcement

A `requireRole()` middleware:

```typescript
function requireRole(...allowed: Role[]) {
  return (req, res, next) => {
    if (!allowed.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
```

Applied to route definitions:
```typescript
rulesRouter.post('/', requireRole('OWNER', 'ADMIN'), handler);
rulesRouter.get('/', requireRole('OWNER', 'ADMIN', 'MEMBER'), handler);
```

### Role source

- Clerk token auth: role extracted from token's `org_role` claim
- API key auth: defaults to `ADMIN` (API keys are management-level credentials)
- Cached `User.role` in DB is synced via Clerk webhooks

---

## 5. API Key Management

### Key format

- `pk_live_<32 random chars>` — org-scoped API key for agent
- `pt_live_<32 random chars>` — personal user token for attribution

Full key shown once at creation. Only `prefix` (first 12 chars) and `keyHash` (bcrypt) stored.

### Endpoints (OWNER or ADMIN only)

- `GET /api-keys` — list keys for org (prefix, name, createdBy, lastUsedAt)
- `POST /api-keys` — create key, returns full key once
- `DELETE /api-keys/:id` — revoke (soft-delete via `revokedAt`)

### Validation flow

1. Agent sends `x-api-key: pk_live_abc...`
2. Middleware extracts prefix, queries `ApiKey` where prefix matches and `revokedAt IS NULL`
3. Bcrypt-compares full key against `keyHash`
4. On match: resolves `orgId`, updates `lastUsedAt`, attaches to `req.auth`
5. On failure: 401

### Performance

Bcrypt comparison is ~100ms. For WebSocket, this happens once at handshake. For REST, prefix lookup narrows to one row. At small-team scale this is fine. Redis cache (key hash → orgId, 60s TTL) can be added if it becomes a bottleneck.

Personal tokens follow the same pattern but also resolve to a specific `userId`.

---

## 6. Clerk Integration & Webhook Sync

### Clerk setup

- Clerk application with Organizations enabled
- Google and GitHub as social login providers
- Webhook endpoint: `POST /api/clerk/webhook`

### Webhook events

| Event | Action |
|-------|--------|
| `organization.created` | Create Organization row |
| `organization.updated` | Update org name/slug |
| `organization.deleted` | Soft-delete org (mark inactive) |
| `organizationMembership.created` | Create User row, link to org, cache role |
| `organizationMembership.updated` | Update cached role |
| `organizationMembership.deleted` | Remove user from org |
| `user.created` | Create/update user email, name |
| `user.updated` | Sync email/name changes |

### Webhook security

Clerk signs webhooks via Svix. Verified using the `svix` npm package. Failed verification → 401.

### Sync strategy

Clerk is the source of truth. Our DB is a read cache. Webhooks keep data in sync. A manual "sync from Clerk" admin endpoint can reconcile drift if needed.

### New environment variables

- `CLERK_SECRET_KEY` — server-side Clerk API key
- `CLERK_PUBLISHABLE_KEY` — client-side (Next.js)
- `CLERK_WEBHOOK_SECRET` — Svix signing secret

---

## 7. Migration & Seed Strategy

### Migration steps

1. **Create new tables** — Organization, User, ApiKey with columns and indexes
2. **Add `orgId` as nullable** — to Session, TokenEvent, Rule, Alert, Insight, Webhook
3. **Seed the default org** — insert "Personal" Organization, UPDATE all existing rows to set `orgId`
4. **Make `orgId` non-nullable** — alter column, add FK constraint and index

Two-phase Prisma migration: first adds nullable column, seed script runs, second makes it required.

### First-user claim flow

- Seed org exists with `clerkOrgId = null` (no Clerk link)
- `POST /setup/claim` endpoint lets the first authenticated user link their Clerk org to the seed org
- That user becomes Owner of the seed org's data

### Agent backward compatibility

Existing agent configs with `AGENT_API_KEY` env var continue to work during transition. Auth middleware falls back to legacy env-var check if no ApiKey DB match found, routes to seed org. Deprecation warning logged encouraging migration to org-scoped keys.

---

## 8. Frontend Changes

### New dependencies

`@clerk/nextjs` for React components and middleware.

### Layout changes

- `<ClerkProvider>` wraps app in root layout
- `<SignIn />` and `<SignUp />` pages at `/sign-in` and `/sign-up`
- `<OrganizationSwitcher />` in sidebar — switch between orgs
- `<UserButton />` in sidebar — avatar, profile, sign-out

### Route protection

Next.js middleware via `clerkMiddleware()` protects all routes except `/sign-in`, `/sign-up`, and `/api/clerk/webhook`. Unauthenticated users redirected to `/sign-in`.

### API client changes

Replace hardcoded `Bearer dev-token` with Clerk's `getToken()`:
```typescript
const token = await getToken();
fetch(url, { headers: { Authorization: `Bearer ${token}` } });
```

### New pages

- `/settings/api-keys` — list, create, revoke API keys (OWNER/ADMIN only)
- `/settings/members` — view org members and roles (management via Clerk's hosted UI)

### Role-based UI

Member role sees rules/webhooks/insights as read-only (create/edit/delete buttons hidden). Uses Clerk's `useOrganization()` hook to check active role client-side.

---

## 9. Testing Strategy

### Unit tests

- `authMiddleware` — all three paths: valid Clerk token, valid API key, invalid → 401
- `tenantMiddleware` — scoped Prisma client created with correct `orgId`
- `requireRole()` — OWNER/ADMIN/MEMBER permutations per permission level
- `ApiKey` validation — prefix lookup, bcrypt comparison, revoked key rejection, `lastUsedAt` update
- Clerk webhook handler — org/user creation, role sync, signature validation rejection

### Integration tests

- Full request flow: Clerk token → tenant scoping → route handler → tenant-filtered data
- API key flow: agent key → org resolution → session creation with correct `orgId`
- Cross-tenant isolation: create data in org A, verify org B can't see it
- Role enforcement: Member creates rule → 403

### Migration test

- Seed script assigns all existing rows to default org
- `orgId` is non-nullable after migration
- Legacy API key backward compatibility

### Mocking strategy

- Clerk token validation: `vi.mock('@clerk/express')` returning controlled payloads
- Svix signature: mocked for webhook tests
- Bcrypt: mocked for fast API key unit tests
