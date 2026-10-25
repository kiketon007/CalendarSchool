---
description: Backend development standards, best practices, and conventions for the LTI Node.js/TypeScript/Express application including Domain-Driven Design, SOLID principles, architecture patterns, API design, and testing practices
globs: ["backend/src/**/*.ts", "backend/prisma/**/*.{prisma,ts}", "backend/vitest.config.ts", "backend/tsconfig.json", "backend/serverless.yml", "backend/package.json"]
alwaysApply: true
---

# Backend Project Standards and Best Practices

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
  - [Core Technologies](#core-technologies)
  - [Database & ORM](#database--orm)
  - [Testing Framework](#testing-framework)
  - [Development Tools](#development-tools)
- [Architecture Overview](#architecture-overview)
  - [Domain-Driven Design (DDD)](#domain-driven-design-ddd)
  - [Layered Architecture](#layered-architecture)
  - [Project Structure](#project-structure)
- [Domain-Driven Design Principles](#domain-driven-design-principles)
  - [Entities](#entities)
  - [Value Objects](#value-objects)
  - [Aggregates](#aggregates)
  - [Repositories](#repositories)
  - [Domain Services](#domain-services)
  - [Additional Recommendations](#additional-recommendations)
- [SOLID and DRY Principles](#solid-and-dry-principles)
  - [Single Responsibility Principle (SRP)](#single-responsibility-principle-srp)
  - [Open/Closed Principle (OCP)](#openclosed-principle-ocp)
  - [Liskov Substitution Principle (LSP)](#liskov-substitution-principle-lsp)
  - [Interface Segregation Principle (ISP)](#interface-segregation-principle-isp)
  - [Dependency Inversion Principle (DIP)](#dependency-inversion-principle-dip)
  - [DRY (Don't Repeat Yourself)](#dry-dont-repeat-yourself)
- [Coding Standards](#coding-standards)
  - [Language and Naming Conventions](#language-and-naming-conventions)
  - [TypeScript Usage](#typescript-usage)
  - [Error Handling](#error-handling)
  - [Validation Patterns](#validation-patterns)
  - [Logging Standards](#logging-standards)
- [API Design Standards](#api-design-standards)
  - [REST Endpoints](#rest-endpoints)
  - [Request/Response Patterns](#requestresponse-patterns)
  - [Error Response Format](#error-response-format)
  - [CORS Configuration](#cors-configuration)
- [Database Patterns](#database-patterns)
  - [Prisma Schema](#prisma-schema)
  - [Migrations](#migrations)
  - [Repository Pattern](#repository-pattern)
- [Testing Standards](#testing-standards)
  - [Unit Testing](#unit-testing)
  - [Integration Testing](#integration-testing)
  - [Test Coverage Requirements](#test-coverage-requirements)
  - [Mocking Standards](#mocking-standards)
- [Performance Best Practices](#performance-best-practices)
  - [Database Query Optimization](#database-query-optimization)
  - [Async/Await Patterns](#asyncawait-patterns)
  - [Error Handling Performance](#error-handling-performance)
- [Security Best Practices](#security-best-practices)
  - [Input Validation](#input-validation)
  - [Environment Variables](#environment-variables)
  - [Dependency Injection](#dependency-injection)
- [Development Workflow](#development-workflow)
  - [Git Workflow](#git-workflow)
  - [Development Scripts](#development-scripts)
  - [Code Quality](#code-quality)
- [Serverless Deployment](#serverless-deployment)
  - [AWS Lambda Configuration](#aws-lambda-configuration)
  - [Serverless Framework](#serverless-framework)

---

## Overview

This document outlines the best practices, conventions, and standards used in the LTI backend application. The backend follows Domain-Driven Design (DDD) principles and implements a layered architecture to ensure code consistency, maintainability, and scalability.

## Technology Stack

### Core Technologies
- **Node.js**: Runtime environment
- **TypeScript**: Type-safe development with strict mode
- **Express.js**: Web application framework
- **Prisma**: Modern ORM for database access

### Database & ORM
- **PostgreSQL**: Relational database (Docker container)
- **Prisma Client**: Type-safe database client
- **Prisma Migrate**: Database migration tool

### Testing Framework
- **Vitest**: Testing framework with native ESM and TypeScript support (Jest is not used)
- **Supertest**: HTTP integration tests against the Express app
- **Coverage Threshold**: 90% for branches, functions, lines, and statements (`@vitest/coverage-v8`)
- **Test Location**: `.test.ts` files next to the source code; integration tests in `*.int.test.ts`
- **Test Database**: separate `calendarschool_test` database in the same PostgreSQL container used for development; tests never run against the development database

### Development Tools
- **ESLint**: Code linting
- **Prettier**: Code formatting, applied on commit by husky + lint-staged
- **pino**: Structured JSON logging through `src/infrastructure/logger.ts`
- **Zod**: Request validation and validation of environment variables at startup
- **@node-rs/bcrypt**: Password hashing (Bcrypt, cost 12) behind the `PasswordHasher` port. It hashes on the libuv threadpool without blocking the event loop and ships prebuilt binaries (including Linux for AWS Lambda), so it needs no install scripts. Bcrypt only uses the first 72 bytes of a password: validation rejects longer passwords (measured in UTF-8 bytes) instead of truncating them
- **uuid**: UUIDv7 identifiers, generated by the application through the `IdGenerator` port (the database does not assign them)
- **jose**: JWT signing and verification (HS256) behind the `TokenIssuer` port. It is pure JavaScript, with no native binaries, so it runs on AWS Lambda. Verification accepts only HS256 and validates the payload with Zod
- **cookie**: parsing of the `Cookie` header and building of the `Set-Cookie` header of the session cookie. Only the presentation layer (`presentation/auth/sessionCookie.ts`) knows about cookies; the domain and application layers work with plain tokens
- **TypeScript Compiler**: Type checking and compilation
- **AWS CDK** (`infrastructure/` workspace): the infrastructure as TypeScript code. **serverless-http** wraps the Express app as a Lambda handler and **@aws-sdk/client-ssm** reads the secrets

### Captcha verification

- **A port with two adapters**: `CaptchaVerifier` (`application/registration`) is implemented by `RecaptchaCaptchaVerifier` (Google `siteverify`, called with the injected `fetch`) and by `FakeCaptchaVerifier`. `createCaptchaVerifier` picks one from the configuration: the real one with `RECAPTCHA_V3_SECRET` and `RECAPTCHA_V2_SECRET`, the fake one without them, with a `warn` at startup. `loadConfig` requires both secrets in production, so the fake verifier can never run there
- **One action per operation**: `verify(captcha, expectedAction)` receives `'register'` or `'login'` from the use case, and a v3 token obtained for one operation is rejected (`ACTION_MISMATCH`) in the other. The frontend asks for the token with the same action (`REGISTER_ACTION`, `LOGIN_ACTION`). The fake verifier ignores the action
- **What the real one checks**: a v3 token is accepted with success, the action the operation expects, the hostname of `APP_ORIGIN` and a score of at least 0.6 (a constant); a lower score asks for the v2 challenge (`422 CAPTCHA_CHALLENGE_REQUIRED`). A v2 token needs success and the hostname. Anything else the user can cause (missing or reused token, wrong action or hostname, challenge not passed) is `422 CAPTCHA_FAILED`; the reason goes only to the log
- **Fail closed**: if Google does not answer in 3 seconds, fails, answers something unexpected or reports an invalid secret, `CaptchaUnavailable` becomes `503 CAPTCHA_UNAVAILABLE` and the registration is not processed. Google validates the token before the secret, so an invalid secret only shows up with a well-formed token
- **Fake verifier**: accepts any token except the reserved `fake-low-score` (with `v3`), `fake-fail` and `fake-unavailable`; it applies the same shape check as the real one. Use it in unit, integration and E2E tests so none of them depends on Google
- **Never log** the token, the secret or the email: `RegisterSchool` logs `USER_REGISTER_CAPTCHA_CHALLENGE` (`info`, with the score) and `USER_REGISTER_CAPTCHA_FAILED` (`warn`, with the reason and the version), and `LogIn` the equivalent `USER_LOGIN_CAPTCHA_CHALLENGE` and `USER_LOGIN_CAPTCHA_FAILED`; the unavailability is logged by the central error handler with its cause
- **Order**: the captcha is step 2, after the attempt limit and before the validation, so a request without `captcha` is `422`, not `400`. The login validates the body first (an invalid body never costs an attempt), then applies the limit, then the captcha
- **Tests of the real adapter**: use recorded responses with Google's documented shape and an injected `fetch`, and check the request (URL, form body, secret of the token version). Mutate the threshold and the action once to make sure the tests fail

### Entry points and AWS Lambda

- **Two entry points, one composition root**: `server.ts` (local and CI) and `lambda.ts` (AWS Lambda) contain no logic. Both read the environment, call `composeApp(config, { logger, ... })` (`src/composeApp.ts`) and start the server or export the handler. `composeApp` builds the Prisma client, the repositories, the use cases and `createApp`, so no entry point repeats the wiring. Integration tests build the app with `test/support/realApp.ts`, which is a thin layer over `composeApp` and therefore exercises the production wiring
- **Configuration errors**: entry points load the configuration with `loadConfigOrLog(env, logger)`. An invalid configuration writes a single `fatal` pino line with the names of the invalid variables (never their values) and rethrows: `server.ts` then exits with code 1 and `lambda.ts` lets the initialization fail
- **Secrets from SSM**: `lambda.ts` reads the `SecureString` parameters under `SSM_PARAMETER_PATH` once per cold start (`loadSsmEnvironmentOrLog`, with top-level `await`), names each variable after the last path segment and merges them over `process.env`, so a parameter wins over an environment variable of the same name. Rotating a secret needs new Lambda instances
- **Lambda adapter**: `createLambdaHandler(app)` (`presentation/lambda`) wraps `serverless-http` for API Gateway HTTP API payload 2.0 and moves `Set-Cookie` from `headers` to `cookies`, because the HTTP API merges repeated headers. Keep the routers unaware of Lambda
- **Only through CloudFront**: with `ORIGIN_VERIFY_SECRET` in the configuration, `createApp` mounts `requireOriginVerification` before any other middleware. It compares `X-Origin-Verify` with the secret by SHA-256 and `timingSafeEqual` and answers `403 ORIGIN_NOT_ALLOWED` otherwise, logging a `warn` without the received value. Without the secret (development, tests, E2E) nothing is checked
- **Bounded pool**: `createPrismaClient` accepts `poolMax`, `connectionTimeoutMillis` (default 5000 ms, so an unresponsive database fails instead of leaving queries pending) and `ssl`. `lambda.ts` uses at most 2 connections per instance and verifies the Supabase certificate with its CA; never use `rejectUnauthorized: false`
- **Do not use session state**: production reaches PostgreSQL through the transaction-mode pooler, so the application must not rely on `SET`, `LISTEN` or session-level locks (`pg_advisory_xact_lock` is fine). Migrations and backups use the session-mode connection

### Attempt limiting

- **One generic limiter**: `AttemptLimiter` (`application/attempts`) applies a policy (`maxAttempts`, `windowMs`) to a key `<operation>:<ip>` and throws `TooManyAttempts`, which `errorHandler` turns into `429 TOO_MANY_REQUESTS` with `Retry-After`. Each operation builds its own limiter and use case (registration: 5 per 15 minutes; login: `LOGIN_ATTEMPTS_MAX`, 10 by default, counting only the failed ones; the public invitations and password resets reuse it through `application/attempts/accessLinkAttempts.ts`, each with its own limiter, key and counter: `invitation:<ip>` and `password-reset:<ip>`); the limiter knows nothing about registrations
- **Store in PostgreSQL**: attempts live in `rate_limit_attempts` so every Lambda instance shares the counter; an in-memory counter would multiply the limit by the number of instances. `PrismaAttemptRepository` runs one transaction per attempt that takes `pg_advisory_xact_lock(hashtextextended(key, 0))`, deletes the expired attempts of the key, counts and inserts only if the attempt is accepted. Run the lock with `$executeRaw`: the function returns `void`, which the Prisma adapter cannot deserialize in `$queryRaw`
- **A rejected attempt does not count**, so retrying during a block does not extend it
- **Count only the failed ones: reserve, then release**: `consume(key)` returns the id of the accepted attempt and `release(attemptId)` deletes that row. The login reserves the attempt before it checks the password and releases it when the password is right; every other ending (captcha, wrong credentials) leaves it counted. Never check first and record later: simultaneous requests would all pass the check before any is recorded. The attempts in flight count, so a burst of simultaneous correct logins can be answered `429`. Releasing is best effort: if it fails, the login goes on and `LOGIN_ATTEMPT_RELEASE_FAILED` is logged. The registration never releases, because every one of its attempts is suspicious
- **Fail closed**: if the database does not answer, the attempt is not accepted (`503`), never let through
- **Order**: the registration limit is step 1 and runs before the captcha, the validation and any lookup. The login validates the body first and then reserves the attempt, still before the captcha and any user lookup. `express.json()` always runs first, so a body that is not JSON answers `400` without counting
- **Tests**: test the real limit and the concurrency in integration tests against PostgreSQL (`registrationAttempts.int.test.ts`, `loginAttempts.int.test.ts`, `prismaAttemptRepository.int.test.ts`, with a controllable clock); the E2E starts the backend with `REGISTRATION_ATTEMPTS_MAX`, `LOGIN_ATTEMPTS_MAX`, `INVITATION_ATTEMPTS_MAX` and `PASSWORD_RESET_ATTEMPTS_MAX` at 1000 because every Cypress request comes from the same IP, and simulates the `429` with `cy.intercept`
- **Retention**: attempts hold IP addresses, so they are personal data and are not kept longer than needed. `ATTEMPT_RETENTION_HOURS` (`application/attempts/attemptRetention.ts`, 24) is the maximum age; the limiter already prunes the attempts of a key that left its window, but keys that are never used again would stay forever. `infrastructure/supabase/purge-rate-limit-attempts.sql` deletes the older ones and `backup.yml` runs it with `psql -v ON_ERROR_STOP=1` before `pg_dump`, so the dump never carries them. A test (`purgeRateLimitAttempts.int.test.ts`) runs the real SQL file against PostgreSQL, and `attemptRetention.test.ts` checks that the window of every policy (registration and login included) is shorter than the maximum age

### Privacy policy consent

- **Mandatory and explicit**: the registration request carries `privacyPolicyAccepted`, validated with `z.literal(true)`. Anything else, absent included, is `{ field: privacyPolicyAccepted, code: REQUIRED }`; it is the last field of the schema, so the order of the details stays stable. The checkbox is never pre-checked and is not persisted in the form draft
- **The backend decides what was accepted**: the client sends no version. `RegisterSchool` builds `privacyPolicyAcceptance { acceptedAt, version }` with the injected `now()` (the same instant as the registration) and `PRIVACY_POLICY_VERSION` (`domain/privacy/privacyPolicy.ts`, a `YYYY-MM-DD` date); frontend and backend are deployed together
- **Stored with the user**: two nullable columns (`privacy_policy_accepted_at`, `privacy_policy_version`) and a `CHECK` that makes them both `NULL` or both set. `NULL` is legitimate (users invited later accept at another moment); a user created by registration always has both columns filled
- **One version, three places**: `PRIVACY_POLICY_VERSION` must equal `privacyPolicy.lastUpdated` in `es.json` and `en.json`. `privacyPolicy.test.ts` reads both files and fails if they differ, so changing the text means changing the date everywhere in the same commit
- **Order**: consent is validated with the rest of the fields, after the captcha, so a request without `captcha` is still `422`
- **Tests**: add the field to `test-fixtures/registration-fields.json` (shared with the frontend) and to every valid request body in the integration tests
- **The policy covers what the code stores**: any new personal data (a column, a field of the logs, an external service) needs a purpose, a retention rule and a line in `privacyPolicy.*` (es and en) in the same change; the text and the code are reviewed together. Today it declares the data of the account, the IP of the attempts (about 48 hours), the cookie, reCAPTCHA, and the IP and user agent of the activity logs (30 days)

### Login and sessions

- **Processing order**: `Origin` (`requireAllowedOrigin`, no CORS) → validation of the body (`400`, never counts) → attempt limit (`429`) → captcha (`422` or `503`) → user lookup and password check (`401`) → account status (`403`) → session (`204`). `LogIn` (`application/login`) runs every step except the `Origin` check, which belongs to the HTTP layer. Nothing reads the users table before the limit and the captcha have passed
- **Same answer and same cost for every credential failure**: an unknown email, a wrong password and a `DELETED` user are all `401 INVALID_CREDENTIALS`. `PasswordHasher.verify(password, null)` compares against `DUMMY_PASSWORD_HASH`, a Bcrypt hash of a discarded random password with the same cost as the real ones (`BCRYPT_COST`), so the response does not reveal whether the email exists. Regenerate the dummy hash when the cost changes (a test checks it). Do not add artificial sleeps: they cost billed Lambda time and do not equalize CPU work
- **Account status after the password**: a `SUSPENDED` user gets `403 ACCOUNT_SUSPENDED` only with the right password (and the attempt is released); with a wrong one the answer is the generic `401`, so only whoever knows the password sees the state of an account
- **The session is started like in the registration**: `204` with the `refresh_token` cookie and no body, and the access token still comes only from `POST /api/auth/refresh`. An incoming `refresh_token` cookie is neither read nor revoked, and every login creates a new session; the other sessions of the user stay valid
- **Store only what a feature uses**: `refresh_tokens` has no IP or user agent column. Nothing read them and nothing purged them, so they would have outlived what the privacy policy promises. The IP and the user agent of a session live only in the activity logs (30 days)
- **Shared validation**: the email rule is in `application/credentials/credentialFields.ts`, and the same table `test-fixtures/registration-fields.json` feeds the registration, the login and the frontend. The login password only needs a value of at most 72 bytes: an old account can have a password that the current registration rules would reject
- **Errors and events**: `InvalidCredentials` (with a `reason` for the log, `PASSWORD` or `NOT_FOUND`) and `AccountSuspended` are translated only by `errorHandler`. `USER_LOGIN_SUCCESS`, `USER_LOGIN_FAILED` (`reason` `PASSWORD`, `NOT_FOUND` or `SUSPENDED`) and `USER_LOGIN_RATE_LIMITED` carry the masked email and never the password or a token
- **Narrow the ports to what each use case needs**: `RegisterSchool` receives `Pick<PasswordHasher, 'hash'>` and `RefreshSession` `Pick<RefreshTokenRepository, 'findByHash'>`, so adding `verify` or `save` did not touch their tests

### Logout and access-token invalidation

- **Logout is idempotent and never answers `401`**: `LogOut` revokes the session of the `refresh_token` cookie (`RefreshTokenRepository.revoke`, an `updateMany` filtered by `revokedAt: null`, so two simultaneous closes do not overwrite each other) and ends without error when there is nothing to revoke (no cookie, unknown, already revoked or expired token). The result the client wants, no session, already holds. It revokes only that session and also for a non-active user.
- **Clear the cookie only when the close succeeded**: the router sets `clearedRefreshTokenCookie()` after `logOut.execute` returns; on `DatabaseUnavailable` it does not, because the session may still be valid on the server and the client must be able to retry. The inner layers never know that cookies exist.
- **The access token carries its session (`sid`)**: `AccessTokenClaims.sessionId` is the id of the `refresh_tokens` row it was issued from, and `verifyAccessToken` rejects a token without it. `AuthenticateRequest` (see "Protected endpoints and roles") reads that row by primary key on every request and rejects a revoked or expired session (and a non-active user), so a logout, a suspension or a password reset invalidate access tokens at once. A stateless JWT (a revoked token would live up to 15 minutes) and a token blocklist (same cost per request plus a purge) were discarded.
- **`Cache-Control: no-store` is the default of `/api`**: the `noStore` middleware is mounted with `app.use('/api', noStore)` before `express.json()`, so it also covers the parser errors, `notFoundHandler` and `errorHandler`. Do not set it route by route; a route with public data replaces it with its own policy, and only on success (`GET /api/municipalities`).
- **Database connection errors have no code in `pg`**: when the server closes the connection in the middle of a query (a stopped container behind Docker's port proxy, a restart of the database or of the pooler) `pg` throws an `Error` with no `code` and the message `Connection terminated unexpectedly`. `translateDatabaseErrors` recognises it, and `Connection terminated due to connection timeout`, by their fixed messages; any other code-less error must stay a `500` so that real bugs are not hidden as an outage. Simulate it with a TCP server that closes the socket after the startup message (`connectionClosed.int.test.ts`): a wrong password only tests the authentication error. Stopping the database by hand (`docker compose stop postgres`) is what found it.


### Protected endpoints and roles

- **Authenticate with the access token and a single primary-key query**: `requireAuthentication` reads `Authorization: Bearer <token>` and runs `AuthenticateRequest` (`application/authentication`), which verifies the JWT and reads the session `sid` with its user and school through `RefreshTokenRepository.findById` (the same `RefreshTokenWithOwner` as `findByHash`). It rejects a missing or malformed header, an invalid token, an unknown session, a session of another user, a revoked or expired session (the same `refreshTokenStatus` rule as `RefreshSession`) and a user that is not `ACTIVE`. No cache in front of that query: it would delay revocations
- **The identity comes from the database, never from the claims**: `userId`, `schoolId`, `role` and `sessionId` of the request are read from the session row, so a role change, a suspension or a logout apply from the next request without closing the sessions of the user. `role` and `schoolId` stay in the token only for compatibility; no authorization or data-access decision may read them. A test must prove it by issuing a token whose claims differ from the database
- **`401` before `403`, and the cause only in the log**: every rejected session answers `401 INVALID_SESSION` with `WWW-Authenticate: Bearer` (set by the middleware before handing the `InvalidSession` to `errorHandler`, so the cookie-based `401` of `/api/auth/refresh` is untouched) and logs `AUTHENTICATION_REJECTED` with a `reason` (`TOKEN_MISSING`, `TOKEN_INVALID`, `SESSION_NOT_FOUND`, `SESSION_USER_MISMATCH`, `SESSION_REVOKED`, `SESSION_EXPIRED` or `USER_INACTIVE`) and never the token or the header. A database failure is `503 DATABASE_UNAVAILABLE`, never `401`
- **Role guard after the authentication guard**: `requireRole(role, logger)` compares the role of the identity and answers `403 FORBIDDEN` (the `Forbidden` domain error, translated only by `errorHandler`) logging `AUTHORIZATION_DENIED` with the user, the school and both roles. Mount both in the router of the feature (`router.use(requireAuthentication(...), requireRole('ADMIN', logger))`)
- **Handlers read the identity with `getAuthenticatedUser(res)`**: it throws a programming error (`500`) if the route was mounted without `requireAuthentication`, so a route can never answer data without an identity. Handlers never read `req.headers.authorization`
- **The school is always a mandatory parameter**: every port that reads or writes data of a school receives `schoolId` as its first parameter (`SchoolUserRepository.listBySchool(schoolId, now)`), taken from the identity by the router. No endpoint accepts the school in the path, the query or the body; an integration test with two schools proves the isolation
- **Select the fields of a list explicitly and sort in the application**: `PrismaSchoolUserRepository` uses `select` with the eight fields of the list, so the password hash or the consent can never leak when a column is added, and sorts with `localeCompare(..., 'es')` because the collation of PostgreSQL depends on how the database was created (as `PrismaMunicipalityRepository` does)
- **Endpoints authenticated with the bearer token do not use `requireAllowedOrigin`**: there are no cookies, so there is no CSRF risk. The cookie-based endpoints (`register`, `login`, `refresh`, `logout`) keep it

### Opaque secret tokens and access links

- **One generic port for every opaque secret**: `SecretTokenGenerator` (`application/tokens/`) returns a random token and its SHA-256 hash; refresh tokens, invitations and password resets all use it (`CryptoSecretTokenGenerator`). Only the hash is stored (`token_hash`, unique); the token exists once, in the response that creates it, and is never logged
- **A table for every access link, told apart by `purpose`**: `access_links` holds invitations and password resets with the same lifecycle (`expires_at` after 72 hours, `used_at`, `revoked_at`). The state is derived, never stored: `accessLinkStatus(link, now)` returns `USED`, `REVOKED`, `EXPIRED` or `PENDING` in that priority, and a link is no longer valid at the exact instant of `expires_at`. A repository method that serves one purpose filters by it, so an id of the other purpose is a `404`
- **The link carries the token in the URL fragment** (`<APP_ORIGIN>/invitacion#<token>`): the browser does not send the fragment to the server, so it never reaches access logs or `Referer`. The response that creates it is the only one with the link, with `Cache-Control: no-store`; lists never return it
- **Revoking is idempotent and atomic**: a conditional `updateMany` (`revoked_at IS NULL` and still pending) keeps the first `revoked_at` when two requests race; "already revoked, used or expired" is a `204` without an event, and only a link outside the school (or of another purpose) is a `404`
- **Use the link in one transaction, with a conditional `UPDATE` first**: accepting an invitation marks it used and creates the user in a single `$transaction`. The first statement is `updateMany` with the pending rule in the `where` (`used_at IS NULL`, `revoked_at IS NULL`, `expires_at > now`); zero rows means the link is no longer valid and nothing else runs. Under `READ COMMITTED` a second concurrent acceptance waits for the row lock and re-evaluates the `where` after the first commit, so only one wins, without `FOR UPDATE`, `SERIALIZABLE` or locking the school. If the `INSERT` of the user fails (the unique email index, detected by its name), the transaction rolls back and the link stays pending. Test it with two real concurrent calls and `Promise.allSettled`
- **A partial unique index that ignores `expires_at` means revoking everything open before inserting**: `access_links_pending_reset_user_key` allows one open password reset per user (`used_at` and `revoked_at` null) and does not look at the expiry, so an expired reset that was never revoked still occupies it. Generating a new one runs one `$transaction` that revokes every open reset of the user (expired or not) with `updateMany` and then inserts; revoking only the non-expired ones would make the `INSERT` fail after an expiry. Count what the revocation touched to tell the log whether it replaced one
- **Retry once on a unique-index race, then let it be a `500`**: two administrators generating at once can both pass the revocation, and the second `INSERT` violates the index. The adapter translates that violation (detected by the index name) into a domain error (`PasswordResetAlreadyPending`), and the use case retries the whole operation once with the same token: the retry revokes the first one and both requests answer `201`, but only the last link works. A second conflict is unexpected and propagates. Test the repository race deterministically by holding the index from another open transaction instead of relying on timing
- **Change a secret and close the sessions in the same transaction as consuming the link**: confirming a password reset marks the link used (conditional `updateMany`), checks the user is still `ACTIVE` (`updateMany` on the password with `status: 'ACTIVE'`; zero rows rolls the transaction back, link included, and the answer is `410`) and revokes every open refresh token of the user, so no session survives with the old password. Do the Bcrypt hash before the transaction, only for a link already known to be valid. Access tokens die at once because every request reads its session
- **Public endpoints that take a secret check the secret before the fields**: order is attempt limit → link (`410`, never saying why) → field validation (`400`) → password hash → registration (`409` or `201`). Validating first would let anyone without a link learn which emails exist. Hash the password (Bcrypt) only after the link is known to be valid, and outside the transaction, so a fake token costs no CPU and the row lock is short
- **Count only the failures that reveal something**: the limiter key is `invitation:<ip>`, shared by the lookup and the acceptance; each request reserves an attempt first and releases it as soon as the link turns out to be valid, even if the fields are then rejected (`400`) or the email is taken (`409`). A failure to release is logged and the request goes on. Unknown requesters share one `unknown` counter
- **Extract the rules two use cases share, not copies**: the person fields of the registration and of the acceptance (`firstName`, `lastName`, `email`, `password`, privacy policy) live in `application/registration/userFields.ts`, and the unique-index detection in `infrastructure/prisma/uniqueViolation.ts`. The shared fixture table `test-fixtures/registration-fields.json` runs against both parsers

### Managing records of a school: invariants between rows

- **One endpoint per action, with its own preconditions**: `PUT /api/users/{id}/role`, `POST /api/users/{id}/suspend` and `POST /api/users/{id}/reactivate` instead of a generic `PATCH`. Each action has its own checks, its own side effects (only the suspension revokes sessions) and its own log event, and a `PATCH` with `status` would let a client write states the feature never offers (`DELETED`). They all answer `200` with the updated record, in the same shape as the list
- **Actions are idempotent**: asking for the state a record already has answers `200` with the record unchanged, logs no event and revokes nothing. It is what happens when two administrators click at the same time
- **A rule that depends on other rows is a pure domain function**: "the school keeps at least one active administrator" lives in `domain/user/userManagement.ts` (`planUserChange(action, snapshot)`), takes what it needs as data (the target, the actor and the count of active administrators) and returns the change to write, `null` for "nothing to do", or throws a domain error. Its unit tests cover every combination of role, status and action without a database
- **Enforce the invariant by locking the parent row, in the adapter**: a check followed by a write is not safe under `READ COMMITTED` (two administrators demoting each other both see "two administrators"). `PrismaSchoolUserRepository.applyChange` runs one interactive `$transaction` that executes `SELECT 1 FROM schools WHERE id = … FOR UPDATE` (with `$executeRaw`), reads the record and the count, calls the rule it receives (`plan`) and writes. Operations of the same school run one after another; those of other schools do not wait. A row lock is compatible with the transaction-mode pooler. Do not call anything external inside that transaction, and log after it ends. Alternatives that were discarded: `SERIALIZABLE` (needs retries and cannot be tested deterministically) and a conditional `UPDATE` with a subquery (both counts see the same snapshot)
- **Test the lock with a real concurrent call, and the outcome over HTTP by its invariant**: the repository integration test fires two `applyChange` calls with `Promise.allSettled` and asserts one success, one `LastAdminRequired` and one administrator left. Over HTTP the loser may be a `409` (its authentication ran before the winner committed) or a `401`/`403` (after), so that test asserts a single `200` and the final count, not the exact status of the loser
- **A record outside the school is a `404`, whatever the reason**: another school, a missing id, a `DELETED` record and a string that is not a UUID all answer `404 NOT_FOUND` without telling which. The `id` is validated before the body and a malformed one never reaches the database. The check order is fixed and tested: `401` → `403` → `404` → self-action → state → idempotency → invariant
- **Revoke sessions in the same transaction as the state change**: a suspended user must not keep live sessions if the database fails between two statements (the middleware would reject the access token anyway because the user is not `ACTIVE`, so this is defence in depth)

### Names that must be unique inside a parent, and errors in list fields

- **Keep a cleaned name and a normalized one**: `name` is what is shown (trimmed, whitespace collapsed, case and accents kept) and `normalized_name` is what is compared (the same, lowercased with `toLocaleLowerCase('es')`; accents and signs such as `º` and `ª` are kept because they distinguish names). Both come from pure functions of the domain (`cleanName`, `normalizeName`). A unique index on `(parent_id, normalized_name)` enforces it; do not use a `lower(name)` functional index or `citext` (Prisma does not model them and they would have to be maintained by hand in every migration)
- **Let the database decide, never check-then-insert**: create the record with its children in one nested `create` (Prisma runs it in a transaction) and translate the violation of the named unique index (`violatedUniqueIndex`) to a domain error (`CourseAlreadyExists` → `409`). Two identical simultaneous requests must give one success and one conflict; test it with a real concurrent call
- **A use case that receives a body validates it**: `CreateCourse` takes `body: unknown`, parses it and throws `ValidationError`, so the router only forwards `req.body` and the rules live in one place. The parser returns every invalid field, not the first
- **Errors of list items name their position**: `classes[<i>].name`, with `i` starting at 0. A repeated item inside the list is `DUPLICATE` from its second occurrence, and the items are only checked when the length of the list is valid. The code `DUPLICATE` is a generic field code in the contract
- **Sort in the application, not in the database**: `Intl.Collator('es', { numeric: true, sensitivity: 'base' })` puts `2º` before `10º` and ignores case and accents; the collation of PostgreSQL depends on how the database was created
- **Declare in the contract what a later story will fill**: `tutor` is in `SchoolClass` since US05 and is always `null`, so US09 only changes its value. The service of the frontend checks it with the contract (`tutor === null`)
- **Table of examples shared with the frontend**: `test-fixtures/course-fields.json`, read by `backend/test/support/courseFixtures.ts` and `frontend/src/testSupport/courseFixtures.ts`

### Editing a record together with the children it owns (stable identity)

- **One `PUT` with the final state, not one endpoint per child**: `PUT /api/courses/{id}` receives `{ name, classes: [{ id?, name }] }` and leaves the course exactly like that in one transaction. Separate calls to add, rename and remove a class cannot be atomic and make the client order and undo them
- **A child keeps its identity through its `id`**: an item with `id` is the same child (renamed if its name changed), an item without `id` is created with a new UUIDv7 and a stored child that is not in the body is deleted. Delete-and-recreate would lose every reference that later stories hang from the child (tutors, students, timetables). The `id` of the body is validated as a UUID (`INVALID_FORMAT`) and cannot repeat (`DUPLICATE`), both on `classes[<i>].id`
- **The difference is a pure domain function, run inside the transaction**: `planCourseUpdate(current, requested)` (`domain/course/courseUpdate.ts`) returns what to delete, rename and create, whether the parent is renamed, and throws `CourseChanged` for an `id` the parent does not have. The repository receives it as a parameter (`update(schoolId, courseId, requested, plan)`), as `applyChange` receives its rule, so the rule is tested without a database and runs against the rows that were really locked
- **Lock the parent row before reading the children**: `SELECT id FROM courses WHERE id = … AND school_id = … FOR UPDATE` (`$queryRaw`, because the existence of the row matters). Edits of the same parent run one after another and the children read afterwards are the real ones; a parent of another school is not found (`CourseNotFound` → `404`). A row lock is compatible with the transaction-mode pooler
- **Write in an order that never breaks a non-deferrable unique index**: update the parent first (a name already in use fails before anything else is written), delete the removed children (their names become free), rename in two phases the ones whose normalized name changes (first to a provisional name that no valid name can equal, `#<i>` — `#` is not an allowed character — and then to the final one, so a swap A↔B does not collide halfway) and create the new ones last. Prisma indexes are not `DEFERRABLE`
- **A child that is no longer there is a conflict, not a silent skip**: `409 COURSE_CHANGED` (another person removed it, or the `id` belongs to another course) and nothing is saved. Anything else is last-write-wins and documented as such; an optimistic version column is a different story
- **An update equal to the stored state writes nothing**: `isEmptyPlan` answers `200` with the current state, keeps `updated_at` and logs no event. Log `COURSE_UPDATED` with counts (`classes_added`, `classes_removed`, `classes_renamed`) after the transaction, and `COURSE_UPDATE_REJECTED` with a `reason`, never names
- **Share the validation of create and update**: `courseFields.ts` has the rules of the name and of the list (`parseCourseBody`) and a callback to read the extra field of each item (the `id`); both parsers use it and `course-fields.json` runs against them
- **The unique name does not count against the record itself**: renaming `1º primaria` to `1º Primaria` changes the stored text and not the normalized name, so the index does not complain; another course with the same normalized name still gives `409 COURSE_ALREADY_EXISTS`

### Deleting a record together with the children it owns

- **A real delete, with the children falling by the database cascade**: `DELETE /api/courses/{id}` removes the course and the foreign key `ON DELETE CASCADE` removes its classes in the same statement. Do not delete the children by hand: the cascade is atomic and cannot be forgotten by a later story. Soft-delete is a different story if the product asks for it
- **Tell the client what it takes to lose before it confirms**: a read-only `GET /api/courses/{id}/impact` returns the counts (`classCount`, `studentCount`) that the confirmation dialog shows. It changes nothing and logs nothing. Fields that a later story will fill (`studentCount` until the students exist) are in the contract from the start, with a constant in the adapter that points at that story, so the later story only changes how it is computed
- **The delete answers `200` with what it really deleted, not `204`**: the counts are taken inside the same transaction that deletes, so they are what disappeared even if the record changed after the dialog was opened. The notice, the log event (`COURSE_DELETED`) and the response use that figure
- **Lock the parent row, count, then delete, in one transaction**: `SELECT id FROM courses WHERE id = … AND school_id = … FOR UPDATE` (`$queryRaw`), the count and `course.delete`. An edit (`PUT`) or a second delete of the same course waits for the lock and, if the delete committed first, finds no row: an edit answers `404` and of two simultaneous deletes one answers `200` and the other `404`. Compatible with the transaction-mode pooler
- **The port returns `null` for "not in the school"**: `impactOf` and `delete` give `null` for another school, a missing course and an already deleted one, and the use case turns it into `CourseNotFound` (`404`). A `404` writes no event. An `id` that is not a UUID is rejected by the router before reaching the use case
- **Test the atomicity with a real failure, not a mock**: a temporary PostgreSQL trigger that rejects the delete of any class makes the cascade fail halfway; the course and all its classes must still exist. Create the trigger in the test and drop it in a `finally`

### Creating a record and assigning it a one-to-one relation

- **Put the relation where one unique index can guarantee both sides**: a professor tutors one class and a class has one tutor, so the foreign key is `classes.tutor_id` (nullable, `UNIQUE`, `ON DELETE SET NULL`) and not a column in the professor. A single index says both "one professor, one class" and "one class, one tutor", the professor can exist without a class, and deleting the professor (or the class) leaves the other side free instead of failing or cascading
- **Create the record and assign it in one transaction, with a conditional `UPDATE`, without locks**: `create` opens a `$transaction`, inserts the professor and then runs `updateMany({ where: { id: classId, tutorId: null, course: { schoolId } }, data: { tutorId } })`. The `where` carries the three rules (the class exists, belongs to the school of the identity and is still free), so it is atomic by itself: under `READ COMMITTED` a second concurrent assignment waits for the row, re-evaluates the `where` and finds it taken. No `FOR UPDATE` and no `SERIALIZABLE`; the unique index is only the safety net. Test it with two real concurrent calls and `Promise.allSettled`
- **When the `UPDATE` changes nothing, a second read says why, and the throw rolls back the insert**: `count === 0` is followed by a `findFirst` on the class within the school. Found means it already has a tutor (`ClassAlreadyHasTutor` → `409`), not found means it does not exist or belongs to another school (`ClassNotFound`). The error leaves the transaction, so the professor is not created either
- **A reference that cannot be resolved inside the school is a field error, not a `404`**: the class is a field of the body, so `ClassNotFound` becomes `400 VALIDATION_ERROR` with `{ field: 'classId', code: 'NOT_FOUND' }` and another school's class is indistinguishable from a missing one. "Already has a tutor" is a state conflict and keeps its own `409` code
- **Read the relation back in the same transaction**: the response is built from a `select` after the assignment, so what the client receives is what was stored
- **Editing or deleting the parent must not break the relation**: the class keeps its identity when it is renamed (see "Editing a record together with the children it owns"), so the tutor stays; removing the class or the course frees the professor through `ON DELETE SET NULL`. Cover both in integration tests with the real database

### Changing a one-to-one relation from the edit of the parent

- **The field is optional with three meanings**: in `PUT /api/courses/{id}` each class carries `tutorId?`: absent means "unchanged" (a client that does not know the field, or cannot load the professors, never removes a tutor by accident), `null` removes the tutor and a UUID assigns it. Validate the format (`INVALID_FORMAT`) and that a professor appears only once (`DUPLICATE` on the second row), both on `classes[<i>].tutorId`
- **Resolve the referenced rows inside the locked transaction and give the pure rule a map**: after the `FOR UPDATE` of the course, read the requested professors of the school (`id IN (…) AND schoolId`, with the class each one tutors now) and pass them to `planCourseUpdate(current, requested, tutors)`. The rule decides without a database: a professor that is not in the map throws `TutorNotFound(classIndex)` (→ `400` with `classes[<i>].tutorId: NOT_FOUND`, indistinguishable from another school's) and one that tutors a class of another course throws `ProfessorAlreadyTutor` (→ `409 PROFESSOR_ALREADY_TUTOR`). A professor who tutors a class of this same course is free to move, because that class is in the plan
- **The plan lists only the tutors that change**: `tutorsChanged` has `{ classId | new class, tutorId | null }` for the classes whose tutor differs from the stored one, so an unchanged request writes nothing (`isEmptyPlan`) and the log counts `tutors_changed`
- **Write in two phases because the unique index is not deferrable**: first `updateMany({ where: { id: { in: changed } }, data: { tutorId: null } })` for every class that changes, then one `updateMany` per class that receives a tutor. A move (A→B) and a swap (A↔B) never hold the same professor twice halfway. Write the tutors after the class writes, so a class that is created or removed in the same request already exists or is gone
- **A race is the index telling the truth**: two edits of different courses that give the same professor do not share the course lock, so one of them hits `classes_tutor_id_key`. Translate that violation (`violatedUniqueIndex`) to `ProfessorAlreadyTutor`, the same `409` as the pure rule, and test it with two real simultaneous calls and `Promise.allSettled` (one `200`, one `409`)

### Editing a record and moving the one-to-one relation it holds

- **The `PUT` takes the final state and `classId` has three states**: absent means "do not touch the relation" (a client that could not load the options never removes it by accident), `null` removes it and a UUID sets it. `position` absent is `null`. Reuse the parser of the creation and only change what absent means (`parseUpdateProfessorRequest` wraps `parseCreateProfessorRequest`), so the codes and the order of the errors cannot diverge
- **Take the relation away from whoever has it, and say who**: unlike the creation (only free classes), the edit may choose a class that has another tutor; that professor loses it in the same transaction and the response returns them (`replacedTutor`) so the client can tell the person. The creation keeps its conditional `UPDATE` on a free class
- **The port returns `null` for "not in the school", with `before` and `after`**: `findById` and `update` give `null` for another school or a missing record (the use case turns it into `ProfessorNotFound` → `404`, also for an `id` that is not a UUID, validated by the router). `update` returns `{ before, after, replacedTutor }` read inside the transaction, so the log can say which fields changed without another query
- **Lock in a fixed order**: first the professor row (`SELECT … FOR UPDATE`), then, in one statement ordered by `id`, the class the professor leaves and the class they take (`… WHERE school_id = … AND id = ANY(…) ORDER BY id FOR UPDATE OF c`, which also proves the class belongs to the school). Two edits that cross (each wants the class of the other) ask for the same rows in the same order and do not deadlock; a test repeats the swap several times
- **Write in the order the unique index needs**: update the professor, free the class they held (`updateMany` on `tutorId = professor`) and then set the new class. The previous tutor of the chosen class loses it with that same `UPDATE`, which replaces the value of their row
- **A race with a write that shares no lock is still the index telling the truth**: a course edit (US09_b) does not take these locks, so it can give the professor a class between the read and the write; the violation of `classes_tutor_id_key` becomes `409 PROFESSOR_ALREADY_TUTOR` and nothing is saved. Test it with a temporary trigger that performs that other write, not with a mock
- **Log what changed, never names**: `PROFESSOR_UPDATED` only when something changed, with `changed_fields`, `tutor_changed` and `replaced_tutor`; `PROFESSOR_UPDATE_REJECTED` with a `reason`

### Deleting a record that holds one side of a one-to-one relation

- **Let the foreign key free the other side**: `DELETE /api/professors/{id}` only deletes the professor; `classes.tutor_id` is `ON DELETE SET NULL`, so the class they tutored is left without a tutor in the same statement. Do not clear the class by hand and do not forbid the delete because of the relation
- **Read what is freed inside the locked transaction**: lock the row (`SELECT id … FOR UPDATE`), read the related row (`freedClass`: `id`, `name`, `courseName`), delete, and answer `200` with it (`null` when there was none). The client and the log (`PROFESSOR_DELETED`, with `freed_class: boolean` and no names) report what was freed, not what the dialog showed earlier
- **No impact endpoint when the record itself says it**: the professor already carries `tutoredClass`, so the dialog reads `GET /api/professors/{id}` instead of a dedicated `…/impact`. Add an impact endpoint only when the cost needs counts that the record does not have (US08)
- **Test it with the other writers**: of two simultaneous deletes one is `200` and the other `404`; an edit of a deleted record is `404`; a course edit that names the deleted professor as tutor is `400` on `classes[<i>].tutorId` (`NOT_FOUND`)

### Creating a record that belongs to a parent that can disappear, with sensitive data

- **Share-lock the parent in the creating transaction**: `PrismaStudentRepository.create` runs `SELECT id FROM courses WHERE id = … AND school_id = … FOR SHARE` (`$queryRaw`), then checks that the optional second parent (the class) belongs to the first, then inserts. The delete and the edit of the course take `FOR UPDATE`, so they wait for the insert and an insert cannot see a class that vanishes right after; two inserts under the same course do not block each other. Test it with the real concurrent calls in several rounds: the child either does not exist or is left without parent after the delete
- **Let the child outlive the parent with nullable foreign keys and `ON DELETE SET NULL`**: `students.course_id` and `class_id` become `NULL` when the course or the class goes, so no cascade deletes people and no delete is blocked. The parent's impact and delete count the children (`studentCount`) inside the same transaction, after the lock, and the dialog says how many are left without parent. Do not use a composite foreign key for "the class belongs to the course": its `SET NULL` would also clear the course; the creating transaction guarantees it
- **A field that only applies when another has a value is `NOT_ALLOWED` and the database repeats the rule**: with `cafeteria: false`, `scholarship` and `foodType` must be absent or `null`, and a value is `400` with the generic field code `NOT_ALLOWED` (do not drop it silently: it hides a client error). The migration adds hand-written `CHECK` constraints for the same rule and for "with cafeteria the scholarship has an answer", as a safety net. The parser does not judge the dependent fields while the controlling field is invalid
- **Sensitive free text is stored, never listed and never logged**: `foodType` and `observations` can hold health data of minors. The list endpoint uses a summary type without them (the contract has a separate schema, not an optional field), the events carry only identifiers and booleans (`STUDENT_CREATED`: `has_class`, `cafeteria`), and a test searches the whole log for the names and texts used. Limits are measured in code points (`Array.from`), like the browser
- **Give optional text two rules**: trim and collapse spaces for short labels (`foodType`), and only trim for long free text (`observations` keeps its line breaks); a blank value is `null`. Share the examples with the frontend in `test-fixtures/student-fields.json`, including the combinations of dependent fields

### Editing a record that belongs to a parent that can disappear, with sensitive data

- **Lock the parent in shared mode first and the record after, the same order as the delete of the parent**: `PrismaStudentRepository.update` runs `SELECT … FROM courses … FOR SHARE` and then `SELECT … FROM students … FOR UPDATE`. The delete and the edit of the course take the course `FOR UPDATE` and then write its students (the `ON DELETE SET NULL` of the foreign key), so everybody goes parent → child and there is no cycle. Locking the record first would form one (delete: course → student; edit: student → course) that PostgreSQL breaks by aborting a transaction (`40P01`), and the only fix would be a retry. With the parent locked, neither it nor its children can vanish before the `UPDATE`, so no foreign key violation has to be translated
- **A record that does not exist wins over a parent that does not exist**: the record lock is read before the missing parent is reported, so an unknown student is a `404` even if the course in the body is also unknown (the client cannot fix a `404` by choosing another course). Everything else about the parent is a field error: `courseId` or `classId` with `NOT_FOUND`, indistinguishable for another school
- **The body is the final state and reuses the creation parser**: `parseUpdateStudentRequest` delegates in `parseCreateStudentRequest`, so the shared table, the codes and the order of the errors are the same, and what is absent or `null` ends up empty (there is no "leave as it is" because the form always has every field). A record that is the same as stored still answers `200`
- **Return how it was and how it is, to log what changed without a second read**: the port's `update` gives `{ before, after }` read in the same locked transaction, and the use case logs `STUDENT_UPDATED` with the **names** of the fields whose value differs (`changed_fields`), never the values. The response is `after`, read from what was stored
- **The port answers `null` for "not in the school"**, as `findById` does, and the use case turns it into `StudentNotFound` (`404`) after logging `STUDENT_UPDATE_REJECTED` with `reason: not_found`; the route validates the `id` as a UUID before the use case, so a malformed `id` is a `404` even with an invalid body
- **Test the order with the real concurrent calls**: `Promise.allSettled` of the edit towards a course and the `DELETE` of that course (the edit is either rejected with `CourseNotFound` and changes nothing, or the student ends up without course), of the edit and the `DELETE` of the course the student leaves (both succeed: no deadlock) and of two edits of the same student (both succeed, the last one wins), repeated several rounds. Over HTTP, assert only "never `500`" and the final state
- **Lock only the record to delete it, not its parent**: `PrismaStudentRepository.delete` runs `SELECT id FROM students WHERE id = … AND school_id = … FOR UPDATE` (`$queryRaw`, filtered by school) and then `DELETE` in one transaction. It never takes the course, so it cannot form a cycle with the delete of the course (course → its students) or with the edit of the student (course in share mode → student). Two deletes, or a delete and an edit, of the same student wait for each other and the loser finds no row (`404`).
- **A delete of a record without children answers a boolean and reads nothing**: the port returns `true` when it deleted the row and `false` when it is not in the school, the use case turns `false` into `StudentNotFound` and logs `STUDENT_DELETED` with `school_id`, `actor_id` and `student_id` only. The repository does not read the sensitive columns to delete, so there is nothing to log by mistake, and the `200` answers `{ deleted: { id } }`, in the common response format, not `204`.
- **Test the delete with the same real races**: two simultaneous `DELETE` of the same student (one `true`, one `false`), a `DELETE` and a `PUT` (the edit finds no student if the delete commits first), and a `DELETE` of the student and of its course repeated several rounds (no deadlock, no `500`); atomicity with a temporary `BEFORE DELETE` trigger that raises.
- **Calendars are read by both roles and written only by `ADMIN`**: `calendarsRouter` mounts `requireRole('ADMIN')` on `POST /api/calendars` only, before the body is parsed, so a `MEMBER` gets `403` even with an invalid body; `GET /api/calendars` is open to both roles and answers `no-store`.
- **Store clock times as minutes since midnight**: `calendar_periods.start_minute` and `end_minute` are `SMALLINT`, with a hand-written `CHECK` (`start >= 0`, `end <= 1439`, `end > start`) in the migration; the domain (`domain/calendar/clock.ts`) converts from and to `HH:MM` and nothing else touches the text format. This avoids time zones and `TIME` type surprises.
- **An ordered list of children keeps its `position` and derives its number**: `calendar_periods` has a unique `(calendar_id, position)`; the "session 3" number is computed from the order of the `SESSION` rows, never stored, so removing or inserting a period cannot leave gaps or duplicates.
- **Lock several rows in a fixed order**: `PrismaCalendarRepository.create` runs `SELECT id FROM courses WHERE id = ANY(...) AND school_id = ... ORDER BY id FOR UPDATE` before assigning them, so two calendars that share courses in a different order cannot deadlock; the integration test runs both calls with `Promise.allSettled`.
- **A nullable foreign key from the followed record to the follower, `ON DELETE SET NULL`**: `courses.calendar_id` lets a course follow at most one calendar and frees it when the calendar goes away; the course API does not change (its `select`s are explicit and a test asserts that the responses carry no calendar).
- **Edit a parent with an ordered list of children by replacing the list inside one transaction**: `PrismaCalendarRepository.update` locks the calendar row (`FOR UPDATE`, filtered by school; no row means `null` before anything else is touched), then the union of the requested courses and the ones that follow it today in `id` order, then renames, deletes all the periods and creates the new ones (the unique `(calendar_id, position)` allows it because the delete comes first), frees the courses that are no longer asked for and assigns the requested ones. The children get new `id`s on every edit, which is fine while nothing references them.
- **Two edits of the same parent are serialized by the parent lock**: the second reads what the first left and replaces it as a whole, so "the last save wins" never leaves a mix; the integration tests run two edits with different periods and courses at once and check that the result is exactly one of them.
- **Validate the role, then the id, then the body, then existence, then the references, then the name**: `PUT /api/calendars/:id` mounts `requireRole('ADMIN')` before `parseCalendarId` (a `MEMBER` gets `403` even for an unknown or malformed id, so nothing about the calendar is revealed), the use case parses the body, the repository answers `null` for a calendar that is not in the school (`404`, before looking at the courses), then `CalendarCoursesNotFound` and finally the unique index on the name.
- **Reuse the creation parser for the final state**: `parseUpdateCalendarRequest` delegates in `parseCreateCalendarRequest`, so the shared table `test-fixtures/calendar-fields.json` is the source of truth for both operations, and a missing `courseIds` means "no courses" (the state is final, not a patch).
- **Log what changed without names**: `CALENDAR_UPDATED` carries `changed_fields` (`name`, `periods`, `courses`; empty if nothing changed) and the counts of courses added and removed, computed from the `{ before, after }` the port returns, so there is no second read.
- **Count what an `ON DELETE SET NULL` will free by locking the children before the delete**: `PrismaCalendarRepository.delete` locks the calendar (`FOR UPDATE`, filtered by school; no row means `null` and nothing else is touched), then `SELECT id FROM courses WHERE calendar_id = … ORDER BY id FOR UPDATE`, and only then deletes the calendar. The periods go by `ON DELETE CASCADE` and the courses are left with a null `calendar_id` by `SET NULL`, both in the same statement and never by hand. The number of locked courses is the `courseCount` the API answers and the log records: a plain `count` without the locks could be false, because an edit could take or bring a course between the count and the `DELETE`. With the locks, an edit that locked the course first has already moved it (PostgreSQL re-evaluates `calendar_id = …` on the updated row under `READ COMMITTED`, so the delete does not count it) and one that comes later waits.
- **The delete takes the locks in the same order as the create and the edit (parent, then children by `id`)**: so deleting a calendar, editing it, editing another calendar that takes one of its courses, creating a calendar and deleting one of its courses never form a cycle. The integration tests run each pair several rounds without errors or deadlocks: two deletions of the same calendar (one `{ courseCount }`, one `null`), a delete and an edit of the same calendar (the edit succeeds or finds it gone), a delete and the edit of another calendar that takes a course (both succeed and the course ends up in the other calendar) and a delete and the delete of one of its courses (both succeed). Atomicity is tested with a temporary `BEFORE DELETE` trigger on `calendar_periods` that makes the cascade fail: the calendar, its periods and its courses stay as they were.

## Architecture Overview

### Domain-Driven Design (DDD)

Domain-Driven Design is a methodology that focuses on modeling software according to business logic and domain knowledge. By centering development on a deep understanding of the domain, DDD facilitates the creation of complex systems.

**Benefits:**
- **Improved Communication**: Promotes a common language between developers and domain experts, improving communication and reducing interpretation errors.
- **Clear Domain Models**: Helps build models that accurately reflect business rules and processes.
- **High Maintainability**: By dividing the system into subdomains, it facilitates maintenance and software evolution.

### Layered Architecture

The backend follows a layered DDD architecture:

**Presentation Layer** (`src/presentation/`)
- Controllers handle HTTP requests/responses
- Routes define API endpoints
- Controllers use services from Application layer

**Application Layer** (`src/application/`)
- Services contain business logic and orchestration
- Validator handles input validation
- Services use repositories from Domain layer

**Domain Layer** (`src/domain/`)
- Models define core business entities (Candidate, Position, Application, Interview, etc.)
- Repository interfaces define data access contracts
- Pure business logic without external dependencies

**Infrastructure Layer** (implicit)
- Prisma ORM handles database operations
- Repository implementations (via Prisma) satisfy domain interfaces

### Project Structure

```
backend/
├── src/
│   ├── domain/
│   │   ├── models/          # Domain entities
│   │   └── repositories/    # Repository interfaces
│   ├── application/
│   │   ├── services/        # Business logic services
│   │   └── validator.ts     # Input validation
│   ├── presentation/
│   │   └── controllers/     # HTTP request handlers
│   ├── infrastructure/
│   │   ├── logger.ts        # Logging utilities
│   │   └── prismaClient.ts  # Prisma client setup
│   ├── routes/              # Express route definitions
│   ├── middleware/          # Express middleware
│   ├── index.ts             # Application entry point
│   └── lambda.ts            # AWS Lambda handler
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── migrations/          # Database migrations
├── test-utils/
│   ├── builders/            # Test data builders
│   └── mocks/               # Mock helpers
├── vitest.config.ts         # Vitest configuration
├── tsconfig.json            # TypeScript configuration
├── serverless.yml           # Serverless Framework config
└── package.json             # Dependencies and scripts
```

## Domain-Driven Design Principles

### Entities

Entities are objects with a distinct identity that persists over time.

**Before:**
```typescript
// Previously, candidate data might have been handled as a simple JSON object without methods.
const candidate = {
    id: 1,
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com'
};
```

**After:**
```typescript
export class Candidate {
    id?: number;
    firstName: string;
    lastName: string;
    email: string;
    
    // Constructor and methods that encapsulate business logic
    constructor(data: any) {
        this.id = data.id;
        this.firstName = data.firstName;
        this.lastName = data.lastName;
        this.email = data.email;
    }
}
```

**Explanation**: `Candidate` is an entity because it has a unique identifier (`id`) that distinguishes it from other candidates, even if other properties are identical.

**Best Practice**: Entities should encapsulate business logic related to their domain concept and maintain consistency of their internal state.

### Value Objects

Value Objects describe aspects of the domain without conceptual identity. They are defined by their attributes rather than an identifier.

**Before:**
```typescript
// Handling education information as a simple object
const education = {
    institution: 'University',
    degree: 'Bachelor',
    startDate: '2010-01-01',
    endDate: '2014-01-01'
};
```

**After:**
```typescript
export class Education {
    institution: string;
    title: string;
    startDate: Date;
    endDate?: Date;
    
    constructor(data: any) {
        this.institution = data.institution;
        this.title = data.title;
        this.startDate = new Date(data.startDate);
        this.endDate = data.endDate ? new Date(data.endDate) : undefined;
    }
}
```

**Explanation**: `Education` can be considered a Value Object in some contexts, as it describes a candidate's education without needing a unique identifier. However, in the current model, it has been assigned an id, which could contradict the pure definition of a Value Object in DDD.

**Recommendation**: Classes like `Education` and `WorkExperience` currently have unique identifiers, classifying them as entities. In many cases, these could be treated as Value Objects within the context of a `Candidate` aggregate. Consider removing unique identifiers from classes that should be Value Objects, or incorporating them as part of the Candidate document if using a NoSQL database.

### Aggregates

Aggregates are clusters of objects that must be treated as a unit. They have a root entity that enforces invariants and consistency boundaries.

**Before:**
```typescript
// Candidate and education data handled separately
const candidate = { id: 1, name: 'John Doe' };
const educations = [{ candidateId: 1, institution: 'University' }];
```

**After:**
```typescript
export class Candidate {
    id?: number;
    firstName: string;
    lastName: string;
    email: string;
    educations: Education[];
    
    constructor(data: any) {
        this.id = data.id;
        this.firstName = data.firstName;
        this.lastName = data.lastName;
        this.email = data.email;
        this.educations = data.educations?.map(edu => new Education(edu)) || [];
    }
}
```

**Explanation**: `Candidate` acts as an aggregate root that contains `Education`, `WorkExperience`, `Resume`, and `Application`. `Candidate` is the root of the aggregate, as the other entities only make sense in relation to a candidate.

**Recommendation**: Aggregates should be carefully designed to ensure that all operations within the aggregate boundary maintain consistency. Operations that affect `Education` and `WorkExperience` should be handled through the aggregate root, `Candidate`, to maintain integrity and encapsulation.

### Repositories

Repositories provide interfaces for accessing aggregates and entities, encapsulating data access logic.

**Before:**
```typescript
// Direct database access without abstraction
function getCandidateById(id: number) {
    return database.query('SELECT * FROM candidates WHERE id = ?', [id]);
}
```

**After:**
```typescript
export interface ICandidateRepository {
    findById(id: number): Promise<Candidate | null>;
    save(candidate: Candidate): Promise<Candidate>;
    findAll(): Promise<Candidate[]>;
}

export class CandidateRepository implements ICandidateRepository {
    async findById(id: number): Promise<Candidate | null> {
        const data = await prisma.candidate.findUnique({ where: { id } });
        return data ? new Candidate(data) : null;
    }
    
    async save(candidate: Candidate): Promise<Candidate> {
        // Implementation with Prisma
    }
}
```

**Explanation**: `CandidateRepository` provides a clear interface for accessing candidate data, encapsulating database access logic.

**Recommendation**: 
- Develop complete repository interfaces for each entity and aggregate, ensuring all database interactions for those entities pass through the repository
- Implement repository methods that handle collections of entities, such as lists of Candidates, that can be filtered or modified in bulk
- Use dependency injection to inject Prisma client into repositories

### Domain Services

Domain Services contain business logic that doesn't naturally belong to an entity or value object.

**Before:**
```typescript
// Loose functions to handle business logic
function calculateAge(candidate: any): number {
    const today = new Date();
    const birthDate = new Date(candidate.birthDate);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}
```

**After:**
```typescript
export class CandidateService {
    static calculateAge(candidate: Candidate): number {
        const today = new Date();
        const birthDate = new Date(candidate.birthDate);
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }
}
```

**Explanation**: `CandidateService` encapsulates business logic related to candidates, such as calculating age, providing a centralized and coherent point for handling these operations.

### Additional Recommendations

**Use of Factories**

Factories are useful in DDD to encapsulate the logic of creating complex objects, ensuring that all created objects comply with domain rules from the moment of creation.

**Recommendation**: Implement factories for the creation of entities and aggregates, especially those that are complex and require specific initial configuration that complies with business rules.

**Improvement in Relationship Modeling**

Relationships between entities and aggregates must be clear and consistent with business rules.

**Recommendation**: Review and possibly redesign relationships between entities to ensure they accurately reflect domain needs and rules. This may include removing unnecessary relationships or adding new relationships that facilitate business operations.

**Domain Events Integration**

Domain events are an important part of DDD and can be used to handle side effects of domain operations in a decoupled manner.

**Recommendation**: Implement a domain event system that allows entities and aggregates to publish events that other system components can handle without being tightly coupled to the entities that generate them.

## SOLID and DRY Principles

### SOLID Principles

SOLID principles are five object-oriented design principles that help create more understandable, flexible, and maintainable systems.

#### Single Responsibility Principle (SRP)

Each class should have a single responsibility or reason to change.

**Before:**
```typescript
// A method that handles multiple responsibilities: validation and data storage
function processCandidate(candidate: any) {
    if (!candidate.email.includes('@')) {
        console.error('Invalid email');
        return;
    }
    database.save(candidate);
    console.log('Candidate saved');
}
```

**After:**
```typescript
export class Candidate {
    // The class now only handles logic related to the candidate
    validateEmail(): void {
        if (!this.email.includes('@')) {
            throw new Error('Invalid email');
        }
    }
}

export class CandidateRepository {
    async save(candidate: Candidate): Promise<Candidate> {
        candidate.validateEmail();
        return await prisma.candidate.create({ data: candidate });
    }
}
```

**Explanation**: The `Candidate` class now has separate methods for validation, while the repository handles data persistence, complying with the single responsibility principle.

**Observation**: The `Candidate` class in `backend/src/domain/models/Candidate.ts` handles both business logic and data access logic.

**Recommendation**: Separate data access logic into a repository layer to adhere more closely to SRP.

#### Open/Closed Principle (OCP)

Software entities should be open for extension but closed for modification.

**Before:**
```typescript
// Direct modification of the class to add functionality
class Candidate {
    saveToDatabase() {
        // code to save to database
    }
    // To add new functionality, we modify the class directly
    sendEmail() {
        // code to send an email
    }
}
```

**After:**
```typescript
export class Candidate {
    saveToDatabase() {
        // code to save to database
    }
}

// Extend functionality without modifying the existing class
class CandidateWithEmail extends Candidate {
    sendEmail() {
        // code to send an email
    }
}
```

**Explanation**: The email sending functionality is extended in a subclass, keeping the original class closed for modifications but open for extensions.

**Observation**: The `addCandidate` function in `backend/src/application/services/candidateService.ts` directly instantiates `Candidate`, `Education`, `WorkExperience`, and `Resume` classes.

**Recommendation**: Use factory methods to create instances, allowing for easier extension without modifying existing code.

#### Liskov Substitution Principle (LSP)

Objects of a derived class should be replaceable with objects of the base class without altering the program's functionality.

**Before:**
```typescript
// Subclass that cannot completely replace its base class
class TemporaryCandidate extends Candidate {
    saveToDatabase() {
        throw new Error("Temporary candidates can't be saved.");
    }
}
```

**After:**
```typescript
class TemporaryCandidate extends Candidate {
    saveToDatabase() {
        // Appropriate implementation that allows temporary handling
        console.log("Handled temporarily");
        // Alternative: Save to temporary storage
    }
}
```

**Explanation**: `TemporaryCandidate` now provides an appropriate implementation that respects the base class contract, allowing substitution without errors.

**Observation**: Currently, there is no inheritance in use where LSP could be violated. The project uses composition over inheritance, which generally supports LSP.

**Recommendation**: Continue using composition to avoid LSP violations and ensure that any future inheritance structures allow derived classes to substitute their base classes without altering how the program works.

#### Interface Segregation Principle (ISP)

Many specific interfaces are better than a single general interface.

**Before:**
```typescript
// A large interface that small clients don't fully use
interface CandidateOperations {
    save(): void;
    validate(): void;
    sendEmail(): void;
    generateReport(): void;
}
```

**After:**
```typescript
interface SaveOperation {
    save(): void;
}

interface EmailOperations {
    sendEmail(): void;
}

interface ReportOperations {
    generateReport(): void;
}

class Candidate implements SaveOperation, EmailOperations {
    save() {
        // implementation
    }
    
    sendEmail() {
        // implementation
    }
}
```

**Explanation**: Interfaces are segregated into smaller operations, allowing classes to implement only the interfaces they need.

**Observation**: The project does not currently use TypeScript interfaces extensively to enforce contracts for classes.

**Recommendation**: Define more granular interfaces for service classes to ensure they only implement the methods they need.

#### Dependency Inversion Principle (DIP)

High-level modules should not depend on low-level modules; both should depend on abstractions.

**Before:**
```typescript
// Direct dependency on a concrete implementation
class Candidate {
    private database = new PrismaClient();
    
    save() {
        this.database.candidate.create({ data: this });
    }
}
```

**After:**
```typescript
interface Database {
    save(candidate: Candidate): Promise<Candidate>;
}

class Candidate {
    private database: Database;
    
    constructor(database: Database) {
        this.database = database;
    }
    
    async save(): Promise<Candidate> {
        return await this.database.save(this);
    }
}
```

**Explanation**: `Candidate` now depends on an abstraction (Database), not a concrete implementation, which facilitates flexibility and code testing.

**Observation**: Classes like `Candidate` directly depend on the concrete `PrismaClient` for database operations.

**Recommendation**: Use dependency injection to invert the dependency, relying on abstractions rather than concrete implementations. Inject `PrismaClient` through the constructor or a setter method.

### DRY (Don't Repeat Yourself)

The DRY principle focuses on reducing duplication in code. Each piece of knowledge should have a single, unambiguous, and authoritative representation within a system.

**Before:**
```typescript
// Repeated code to validate emails in multiple functions
function saveCandidate(candidate: Candidate) {
    if (!candidate.email.includes('@')) {
        throw new Error('Invalid email');
    }
    // save logic
}

function updateCandidate(candidate: Candidate) {
    if (!candidate.email.includes('@')) {
        throw new Error('Invalid email');
    }
    // update logic
}
```

**After:**
```typescript
export class Candidate {
    validateEmail(): void {
        if (!this.email.includes('@')) {
            throw new Error('Invalid email');
        }
    }
    
    async save(): Promise<Candidate> {
        this.validateEmail();
        // save logic
    }
    
    async update(): Promise<Candidate> {
        this.validateEmail();
        // update logic
    }
}
```

**Explanation**: Email validation is centralized in a single `validateEmail` method, eliminating code duplication in the save and update functions.

**Observation**: The methods for saving entities like `Candidate`, `Education`, `WorkExperience`, and `Resume` contain repetitive logic for handling database operations.

**Recommendation**: Abstract common database operation logic into a reusable function or class.

## Coding Standards

### Language and Naming Conventions

Language policy (canonical rule in `docs/base-standards-castellano.md` §1):
- **English** for everything that is code: identifiers, file names, database tables and columns, API routes, error codes and test names
- **Spanish (castellano)** for comments, JSDoc, documentation, commit messages, log messages and exception messages
- **User-facing text** is resolved by the frontend through i18n; the API returns stable error codes (e.g. `EMAIL_ALREADY_REGISTERED`) together with the message

- **Variable Naming**: Use camelCase for variables and functions (e.g., `candidateId`, `findCandidateById`)
- **Class Naming**: Use PascalCase for classes and interfaces (e.g., `Candidate`, `CandidateRepository`)
- **Constants Naming**: Use UPPER_SNAKE_CASE for constants (e.g., `MAX_CANDIDATES_PER_PAGE`)
- **Type Naming**: Use PascalCase for types and interfaces (e.g., `CandidateData`, `ICandidateRepository`)
- **File Naming**: Use camelCase for file names (e.g., `candidateService.ts`, `candidateController.ts`)

**Examples:**

```typescript
// Good: English identifiers, Spanish comments
export class CandidateRepository {
    async findById(candidateId: number): Promise<Candidate | null> {
        // Busca el candidato por su ID en la base de datos
        const candidate = await this.prisma.candidate.findUnique({
            where: { id: candidateId }
        });
        return candidate ? new Candidate(candidate) : null;
    }
}

// Avoid: Spanish identifiers
export class RepositorioCandidato {
    async buscarPorId(idCandidato: number): Promise<Candidato | null> {
        // Buscar candidato por ID en la base de datos
        const candidato = await this.prisma.candidate.findUnique({
            where: { id: idCandidato }
        });
        return candidato ? new Candidato(candidato) : null;
    }
}
```

**Error Messages and Logs:**

```typescript
// Good: English error code, Spanish messages
throw new NotFoundError('CANDIDATE_NOT_FOUND', 'Candidato no encontrado con el ID proporcionado');
logger.error('Error al crear el candidato', { error: error.message });

// Avoid: Spanish error codes or English messages
throw new NotFoundError('CANDIDATO_NO_ENCONTRADO', 'Candidate not found with the provided ID');
logger.error('Failed to create candidate', { error: error.message });
```

### TypeScript Usage

- **Strict Mode**: Always enable strict mode in `tsconfig.json`
- **Type Definitions**: Use explicit types for function parameters and return values
- **Interfaces**: Define interfaces for complex data structures
- **Avoid `any`**: Use `unknown` or specific types instead of `any` when possible

```typescript
// Good: Explicit types
async function findCandidateById(id: number): Promise<Candidate | null> {
    // implementation
}

// Avoid: Using any
function processData(data: any): any {
    // implementation
}
```

### Error Handling

- **Custom Error Classes**: Create domain-specific error classes
- **Error Middleware**: Use global error middleware for consistent error responses
- **Error Messages**: Provide descriptive error messages for debugging

```typescript
export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NotFoundError';
    }
}

// In controller
try {
    const candidate = await candidateService.findById(id);
    if (!candidate) {
        throw new NotFoundError('Candidate not found');
    }
    res.json(candidate);
} catch (error) {
    next(error);
}
```

### Validation Patterns

- **Input Validation**: Validate all inputs at the application layer
- **Use Validator Module**: Centralize validation logic in `src/application/validator.ts`
- **Validate Before Processing**: Always validate before executing business logic

```typescript
import { validateCandidateData } from '../application/validator';

export async function addCandidate(req: Request, res: Response, next: NextFunction) {
    try {
        const validatedData = validateCandidateData(req.body);
        const candidate = await candidateService.create(validatedData);
        res.status(201).json(candidate);
    } catch (error) {
        next(error);
    }
}
```

### Logging Standards

- **Use Logger Class**: Use the centralized logger from `src/infrastructure/logger.ts`
- **Log Levels**: Use appropriate log levels (info, error, warn, debug)
- **Structured Logging**: Include relevant context in log messages

```typescript
import { Logger } from '../infrastructure/logger';

const logger = new Logger();

logger.info('Candidate created', { candidateId: candidate.id });
logger.error('Failed to create candidate', { error: error.message });
```

## API Design Standards

### REST Endpoints

- **RESTful Naming**: Use RESTful conventions for endpoint naming
- **HTTP Methods**: Use appropriate HTTP methods (GET, POST, PUT, DELETE, PATCH)
- **Resource-Based URLs**: URLs should represent resources, not actions

```typescript
GET    /candidates          // List candidates
GET    /candidates/:id      // Get candidate by ID
POST   /candidates          // Create new candidate
PUT    /candidates/:id      // Update candidate
DELETE /candidates/:id      // Delete candidate
```

### Request/Response Patterns

- **JSON Format**: Use JSON for request and response bodies
- **Consistent Structure**: Maintain consistent response structure across all endpoints
- **Status Codes**: Use appropriate HTTP status codes

```typescript
// Success response
{
    "success": true,
    "data": { ... },
    "message": "Operation completed successfully"
}

// Error response
{
    "success": false,
    "error": {
        "message": "Error description",
        "code": "ERROR_CODE"
    }
}
```

### Error Response Format

- **Consistent Format**: All errors should follow the same response structure
- **Error Codes**: Use meaningful error codes for different error types. A new code is added at the same time to the `ErrorCode` enum of `docs/api-spec.yml` and to `ERROR_CODES` in `src/presentation/http/appError.ts`; `appError.test.ts` fails if both lists differ
- **Validation Errors**: Respond `400` with `VALIDATION_ERROR` and one `{ field, code }` item in `details` per invalid field, using the generic field codes of the contract (`REQUIRED`, `INVALID_LENGTH`, `INVALID_FORMAT`, `INVALID_CHARACTERS`, `WEAK_PASSWORD`; reusable response `ValidationError`)
- **HTTP Status Codes**: Map errors to appropriate HTTP status codes

```typescript
// 400 Bad Request
{
    "success": false,
    "error": {
        "message": "Validation failed",
        "code": "VALIDATION_ERROR",
        "details": [ ... ]
    }
}

// 404 Not Found
{
    "success": false,
    "error": {
        "message": "Resource not found",
        "code": "NOT_FOUND"
    }
}
```

### CORS Configuration

- **Enable CORS**: Configure CORS to allow frontend origin
- **Secure Configuration**: Only allow specific origins in production
- **Credentials**: Configure credentials handling appropriately

```typescript
import cors from 'cors';

const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
};

app.use(cors(corsOptions));
```

## Database Patterns

### Prisma Schema

- **Single Source of Truth**: `prisma/schema.prisma` is the single source of truth for database structure
- **Relationships**: Define relationships using Prisma relations
- **Naming Conventions**: Use consistent naming conventions (camelCase for fields, PascalCase for models)

### Migrations

- **Version Control**: All database changes must be version-controlled through migrations
- **Migration Naming**: Use descriptive names for migrations
- **Review Migrations**: Review migration files before applying

- **Constraints Prisma cannot express are written by hand in the migration**: `CHECK` constraints and partial unique indexes (e.g. `access_links`: an invitation has a `role` and no `user_id`, a password reset the opposite; one pending reset per user) go in the `migration.sql` generated with `prisma migrate dev --create-only`, never in a later ad-hoc script. A comment in the SQL says Prisma does not know about them, because a future `migrate dev` may try to drop them. Each one has an integration test that tries to break it with a direct insert (`accessLinksSchema.int.test.ts`)

```bash
# Create migration
npx prisma migrate dev --name descriptive_migration_name

# Apply migrations in production
npx prisma migrate deploy
```

### Repository Pattern

- **Repository Interfaces**: Define repository interfaces in the domain layer
- **Prisma Implementation**: Implement repositories using Prisma in the infrastructure layer
- **Dependency Injection**: Inject Prisma client into repositories

```typescript
// Domain layer interface
export interface ICandidateRepository {
    findById(id: number): Promise<Candidate | null>;
    save(candidate: Candidate): Promise<Candidate>;
}

// Infrastructure layer implementation
export class CandidateRepository implements ICandidateRepository {
    constructor(private prisma: PrismaClient) {}
    
    async findById(id: number): Promise<Candidate | null> {
        const data = await this.prisma.candidate.findUnique({ where: { id } });
        return data ? new Candidate(data) : null;
    }
}
```

## Testing Standards

The project has strict requirements for code quality and maintainability. These are the unit testing standards and best practices that must be applied. 

### Test File Structure
- Use descriptive test file names: `[componentName].test.ts`
- Place test files alongside the source code they test
- Use Vitest as the testing framework (`describe`, `it`, `expect`, `vi` imported from `vitest`)
- Maintain 90% coverage threshold for branches, functions, lines, and statements


### Test Organization Pattern
Template:
```typescript
describe('[ComponentName] - [methodName]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('should_[expected_behavior]_when_[condition]', () => {
    it('should [specific test case]', async () => {
      // Arrange
      // Act  
      // Assert
    });
  });
});
```

Real example:
```typescript
describe('CandidateService - findById', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return candidate when found', async () => {
        // Arrange
        const candidateId = 1;
        const mockCandidate = new Candidate({ id: 1, firstName: 'John' });
        vi.mocked(CandidateRepository.findById).mockResolvedValue(mockCandidate);

        // Act
        const result = await candidateService.findById(candidateId);

        // Assert
        expect(result).toEqual(mockCandidate);
        expect(CandidateRepository.findById).toHaveBeenCalledWith(candidateId);
    });
});
```



### Test Case Naming Convention
- Use descriptive, behavior-driven naming: `should_[expected_behavior]_when_[condition]`
- Group related test cases under descriptive `describe` blocks
- Use snake_case for describe blocks and camelCase for individual tests

### Test Structure (AAA Pattern)
Always follow the Arrange-Act-Assert pattern:
```typescript
it('should update candidate stage successfully when valid data provided', async () => {
  // Arrange - Set up test data and mocks
  const candidateId = 1;
  const applicationId = 1;
  const newInterviewStep = 2;
  
  // Act - Execute the function under test
  const result = await updateCandidateStage(candidateId, applicationId, newInterviewStep);
  
  // Assert - Verify the expected behavior
  expect(result).toEqual(expectedResult);
});
```

Assertion pattern:
- Use specific matchers: `toHaveBeenCalledWith()`, `toHaveBeenCalledTimes()`
- Verify both successful operations and error conditions
- Check that mocks were called with correct parameters
- Assert on return values and side effects



### Mocking Standards

- Mock all external dependencies (models, services, database clients)
- Mock repository layers in service tests
- Mock service layers in controller tests
- Use `vi.mock()` at the top of test files for module-level mocking
- Create mock instances with realistic data structures
- Clear all mocks in `beforeEach()` to ensure test isolation


### Test Coverage Requirements

- **Comprehensive test coverage**: Include these test categories for each function:
1. **Happy Path Tests**: Valid inputs producing expected outputs
2. **Error Handling Tests**: Invalid inputs, missing data, database errors
3. **Edge Cases**: Boundary values, null/undefined inputs, empty data
4. **Validation Tests**: Input validation, business rule enforcement
5. **Integration Points**: External service calls, database operations

- **Threshold**: 90% for branches, functions, lines, and statements
- **Coverage Reports**: `npm test` always measures coverage over unit + integration tests combined (thresholds in `backend/vitest.config.ts`, not per Vitest project) and fails below 90%
- **Coverage Exclusions**: only generated code, type declarations, tests and the `server.ts` and `lambda.ts` entry points, which must not contain logic; the list is commented in `vitest.config.ts`
- **Coverage Files**: Coverage reports in `coverage/` directory adding the date, like YYYYMMDD-backend-coverage.md


### Error Testing
- Test both expected errors and unexpected errors
- Verify error messages are descriptive and helpful
- Test error propagation through service layers
- Ensure proper HTTP status codes in controller tests

### Controller Testing Specifics
- Mock the service layer completely
- Test HTTP request/response handling
- Verify parameter parsing and validation
- Test error response formatting
- Use realistic Express Request/Response mocks

### Service Testing Specifics
- Mock domain models and repositories
- Test business logic in isolation
- Verify data transformation and validation
- Test error handling and edge cases
- Mock external dependencies (Prisma, validators)

### Database Testing
- Mock Prisma client and all database operations
- Test both successful and failed database operations
- Verify correct database queries and parameters
- Test transaction handling and rollback scenarios

### Async Testing
- Always use `async/await` for asynchronous operations
- Use `Promise.allSettled()` for testing concurrent operations
- Properly handle promise rejections in tests
- Test timeout scenarios where applicable

### Test Data Management
- Use factory functions for creating test data
- Keep test data consistent and realistic
- Avoid hardcoded values in multiple places
- Use meaningful test data that reflects real-world scenarios

### Integration Testing

- **Controller Testing**: Test HTTP request/response handling
- **Database Testing**: Test repository implementations with database
- **End-to-End Flow**: Test complete request flows


### Code Quality Standards

#### TypeScript Usage
- Use strict typing for all test parameters and return values
- Define proper interfaces for mock data
- Use type assertions sparingly and with proper justification
- Leverage TypeScript's type system for better test reliability

#### Documentation
- Write clear, descriptive test names that explain the scenario
- Add comments for complex test setups
- Document any special test conditions or edge cases
- Keep test code as readable as production code

#### Performance Considerations
- Keep tests fast and focused
- Avoid unnecessary async operations in tests
- Use appropriate mock strategies to avoid real I/O
- Group related tests to minimize setup/teardown overhead

### Integration with Development Workflow
- Run tests before every commit
- Ensure all tests pass before merging
- Use test-driven development when appropriate
- Update tests when modifying existing functionality

### Common Anti-Patterns to Avoid
- Don't test implementation details, test behavior
- Don't create overly complex test setups
- Don't ignore failing tests or skip error scenarios
- Don't use real database connections in unit tests
- Don't create tests that depend on external services
- Don't write tests that are too tightly coupled to implementation

### Example Test Structure



## Performance Best Practices

### Database Query Optimization

- **Select Specific Fields**: Only select fields that are needed
- **Use Indexes**: Ensure proper database indexes for frequently queried fields
- **Avoid N+1 Queries**: Use Prisma's `include` to fetch related data efficiently

```typescript
// Good: Fetch related data efficiently
const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: {
        educations: true,
        workExperiences: true
    }
});

// Avoid: N+1 queries
const candidate = await prisma.candidate.findUnique({ where: { id } });
const educations = await prisma.education.findMany({ where: { candidateId: id } });
```

### Async/Await Patterns

- **Always Use Async/Await**: Use async/await instead of promises chains
- **Error Handling**: Properly handle errors in async operations
- **Parallel Operations**: Use `Promise.all()` for parallel operations when appropriate

```typescript
// Good: Parallel operations
const [candidates, positions] = await Promise.all([
    candidateService.findAll(),
    positionService.findAll()
]);
```

### Error Handling Performance

- **Early Returns**: Return early to avoid unnecessary processing
- **Error Propagation**: Let errors propagate naturally through the call stack
- **Avoid Over-Wrapping**: Don't wrap errors unnecessarily

## Security Best Practices

### Input Validation

- **Validate All Inputs**: Validate all user inputs before processing
- **Sanitize Data**: Sanitize data to prevent injection attacks
- **Type Checking**: Use TypeScript and validation to ensure type safety

### Environment Variables

- **Never Commit Secrets**: Never commit `.env` files or secrets to version control
- **Use Environment Variables**: Use environment variables for configuration
- **Validate Environment**: Validate required environment variables at startup
- **Session settings**: `JWT_SECRET` (at least 32 characters) signs the access tokens and `APP_ORIGIN` (an `http(s)` origin without path) is the only origin accepted by `POST /api/auth/refresh`. Both are required, validated by `loadConfig` and never logged; in production they come from AWS encrypted storage
- **Attempt limiting**: `TRUST_PROXY_HOPS` (default `0`) is the number of trusted proxies in front of the backend and drives Express `trust proxy`, so `req.ip` is the connection address with `0` and the address `N` hops from the right of `X-Forwarded-For` otherwise (the client cannot choose its IP by writing the header). `REGISTRATION_ATTEMPTS_MAX` (default `5`) is the registration attempts per IP every 15 minutes. Both are optional
- **Origin verification**: `ORIGIN_VERIFY_SECRET` (at least 32 characters) is the value CloudFront sends in `X-Origin-Verify`. Required when `NODE_ENV=production`, optional otherwise, validated by `loadConfig` and never logged. `TRUST_PROXY_HOPS` in production is a measured value, not an assumed one (see `docs/despliegue/PUESTA_EN_MARCHA.md`)
- **reCAPTCHA secrets**: `RECAPTCHA_V3_SECRET` and `RECAPTCHA_V2_SECRET`, both or neither, required when `NODE_ENV=production`; never logged and never versioned
- **Session tokens**: the refresh token is a random 256-bit value stored only as a SHA-256 hash and sent in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie scoped to `/api/auth`; the access token (JWT, 15 minutes) is returned only by `POST /api/auth/refresh`. Endpoints that read the session cookie must check the `Origin` header (`requireAllowedOrigin`) and CORS stays disabled

```typescript
// Validate required environment variables
const requiredEnvVars = ['DATABASE_URL', 'PORT'];
requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        throw new Error(`Missing required environment variable: ${varName}`);
    }
});
```

### Dependency Injection

- **Inject Prisma Client**: Inject Prisma client via Express middleware
- **Avoid Global State**: Avoid global state for database connections
- **Testability**: Use dependency injection to improve testability

```typescript
// Middleware to inject Prisma client
app.use((req: Request, res: Response, next: NextFunction) => {
    req.prisma = prisma;
    next();
});

// Use in controllers
export async function getCandidate(req: Request, res: Response) {
    const candidate = await req.prisma.candidate.findUnique({
        where: { id: req.params.id }
    });
    res.json(candidate);
}
```

## Development Workflow

### Git Workflow

- **Feature Branches**: Develop features in separate branches using clear descriptive names to allow working in parallel and avoid conflicts or collisions
- **Descriptive Commits**: Write descriptive commit messages in Spanish (castellano), following Conventional Commits
- **Code Review**: Code review before merging
- **Small Branches**: Keep branches small and focused

### Development Scripts

```bash
# From the repository root
npm run dev -w backend          # Development server with reload (node --watch + tsx loader), port 3000
npm run build -w backend        # Compile src/ to dist/ (tsc, NodeNext); run with `npm start -w backend`
npm run test -w backend         # Unit + integration tests with coverage (requires PostgreSQL)
npm run test:unit -w backend    # Unit tests only (*.test.ts), no database needed
npm exec -w backend -- vitest run --project integration   # Integration tests only (*.int.test.ts)
npm exec -w backend -- vitest run src/app.test.ts         # A single test file (Vitest's -w means --watch)
npm run typecheck -w backend    # Types of code, tests and configs
npm run db:migrate              # Apply migrations to the development database (prisma migrate deploy)
npm exec -w backend -- prisma migrate dev --name <name>   # Create a new migration
```

- The Prisma client is generated by the backend `postinstall` (`prisma generate`) into `src/infrastructure/prisma/generated/` (ignored by git); import it only from `src/infrastructure`
- Migrations are never applied implicitly on startup
- Integration tests run in parallel, one PostgreSQL schema per Vitest worker (`test_<n>` in `calendarschool_test`, from `TEST_DATABASE_URL`); `resetDatabase()` empties its tables before each test

### Code Quality

- **ESLint Validation**: Run ESLint before commits
- **TypeScript Compilation**: Ensure TypeScript compiles without errors
- **All Tests Passing**: Ensure all tests pass before deployment
- **Code Review**: Review code for adherence to standards

## Serverless Deployment

### AWS Lambda Configuration

- **Lambda Handler**: Entry point is `src/lambda.ts`
- **Serverless HTTP**: Use `serverless-http` to wrap Express app
- **Environment Variables**: Configure environment variables in `serverless.yml`

### Serverless Framework

- **Configuration File**: `serverless.yml` defines Lambda configuration
- **Build Command**: Use `npm run build:lambda` for Lambda builds
- **Deployment**: Deploy using Serverless Framework CLI

```typescript
// lambda.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import serverless from 'serverless-http';
import { app } from './index';

const serverlessHandler = serverless(app);

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  context.callbackWaitsForEmptyEventLoop = false;
  return await serverlessHandler(event, context) as APIGatewayProxyResult;
};
```

