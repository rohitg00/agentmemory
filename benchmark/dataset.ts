import type { CompressedObservation } from "../src/types.js";

export interface LabeledQuery {
  query: string;
  relevantObsIds: string[];
  description: string;
  category: "exact" | "semantic" | "temporal" | "cross-session" | "entity";
}

const SESSION_COUNT = 30;
const OBS_PER_SESSION = 8;

function ts(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString();
}

const RAW_SESSIONS: Array<{
  sessionRange: [number, number];
  daysAgoRange: [number, number];
  project: string;
  observations: Array<Omit<CompressedObservation, "id" | "sessionId" | "timestamp">>;
}> = [
  {
    sessionRange: [0, 4],
    daysAgoRange: [28, 25],
    project: "webapp",
    observations: [
      { type: "command_run", title: "Initialize Next.js 15 project", subtitle: "create-next-app", facts: ["Created Next.js 15 app with App Router", "TypeScript template selected", "Tailwind CSS v4 configured"], narrative: "Initialized a new Next.js 15 project using create-next-app with TypeScript and Tailwind CSS. Selected the App Router layout.", concepts: ["nextjs", "typescript", "tailwind", "app-router"], files: ["package.json", "tsconfig.json", "tailwind.config.ts"], importance: 6 },
      { type: "file_edit", title: "Configure ESLint with flat config", subtitle: "eslint.config.mjs", facts: ["Migrated to ESLint flat config format", "Added typescript-eslint plugin", "Configured import sorting rules"], narrative: "Set up ESLint using the new flat config format (eslint.config.mjs). Added typescript-eslint for type-aware linting and configured import sorting with eslint-plugin-import.", concepts: ["eslint", "linting", "code-quality", "typescript"], files: ["eslint.config.mjs", "package.json"], importance: 5 },
      { type: "file_edit", title: "Set up Prettier with Tailwind plugin", subtitle: "Formatting", facts: ["Installed prettier and prettier-plugin-tailwindcss", "Added .prettierrc with semi: false, singleQuote: true", "Configured format-on-save in VS Code settings"], narrative: "Configured Prettier for automatic code formatting. Added the Tailwind CSS class sorting plugin. Set up VS Code to format on save.", concepts: ["prettier", "formatting", "tailwind", "developer-experience"], files: [".prettierrc", ".vscode/settings.json"], importance: 4 },
      { type: "file_edit", title: "Create shared UI component library", subtitle: "Components", facts: ["Created Button, Input, Card, Badge components", "Used cva (class-variance-authority) for variant styling", "Added Radix UI primitives for accessibility"], narrative: "Built a shared component library with Button, Input, Card, and Badge components. Used class-variance-authority (cva) for type-safe variant styling and Radix UI primitives for keyboard navigation and screen reader support.", concepts: ["components", "ui-library", "radix-ui", "cva", "accessibility"], files: ["src/components/ui/button.tsx", "src/components/ui/input.tsx", "src/components/ui/card.tsx"], importance: 7 },
      { type: "file_edit", title: "Add global layout with navigation", subtitle: "Layout", facts: ["Created root layout with metadata", "Added responsive navigation bar", "Implemented mobile hamburger menu"], narrative: "Created the root layout component with SEO metadata, Open Graph tags, and a responsive navigation bar that collapses into a hamburger menu on mobile devices.", concepts: ["layout", "navigation", "responsive-design", "seo"], files: ["src/app/layout.tsx", "src/components/nav.tsx"], importance: 6 },
      { type: "file_edit", title: "Configure path aliases and absolute imports", subtitle: "tsconfig", facts: ["Added @ alias pointing to src/", "Configured baseUrl for absolute imports"], narrative: "Set up TypeScript path aliases so imports can use @/components instead of relative paths. Configured baseUrl in tsconfig.json.", concepts: ["typescript", "path-aliases", "developer-experience"], files: ["tsconfig.json"], importance: 3 },
      { type: "command_run", title: "Add Vitest for unit testing", subtitle: "Testing setup", facts: ["Installed vitest and @testing-library/react", "Created vitest.config.ts with jsdom environment", "Added test script to package.json"], narrative: "Set up Vitest as the unit testing framework with React Testing Library for component tests. Configured jsdom environment for DOM testing.", concepts: ["vitest", "testing", "react-testing-library", "configuration"], files: ["vitest.config.ts", "package.json"], importance: 5 },
      { type: "file_edit", title: "Set up Husky pre-commit hooks", subtitle: "Git hooks", facts: ["Installed husky and lint-staged", "Pre-commit runs ESLint and Prettier", "Added commitlint for conventional commits"], narrative: "Configured Husky git hooks with lint-staged to run ESLint and Prettier on staged files before each commit. Added commitlint to enforce conventional commit message format.", concepts: ["husky", "git-hooks", "lint-staged", "commitlint", "ci"], files: [".husky/pre-commit", ".lintstagedrc", "commitlint.config.js"], importance: 4 },
    ],
  },
  {
    sessionRange: [5, 9],
    daysAgoRange: [24, 20],
    project: "webapp",
    observations: [
      { type: "file_edit", title: "Implement NextAuth.js v5 authentication", subtitle: "Auth setup", facts: ["Configured NextAuth.js v5 with Auth.js", "Added GitHub and Google OAuth providers", "Set up JWT session strategy with 30-day expiry"], narrative: "Implemented authentication using NextAuth.js v5 (Auth.js). Configured GitHub and Google as OAuth providers. Using JWT-based sessions with 30-day expiry instead of database sessions for simplicity.", concepts: ["nextauth", "authentication", "oauth", "jwt", "github", "google"], files: ["src/auth.ts", "src/app/api/auth/[...nextauth]/route.ts", ".env.local"], importance: 9 },
      { type: "file_edit", title: "Create login and signup pages", subtitle: "Auth UI", facts: ["Built login page with OAuth buttons", "Added email/password form with validation", "Implemented error toast notifications"], narrative: "Created the login page with GitHub and Google OAuth sign-in buttons plus an email/password form. Used react-hook-form with zod validation. Added toast notifications for login errors.", concepts: ["login", "signup", "oauth", "form-validation", "react-hook-form", "zod"], files: ["src/app/login/page.tsx", "src/app/signup/page.tsx"], importance: 7 },
      { type: "file_edit", title: "Add middleware for route protection", subtitle: "Auth middleware", facts: ["Created middleware.ts to protect /dashboard routes", "Redirects unauthenticated users to /login", "Allows public access to /api/webhooks"], narrative: "Added Next.js middleware that checks for valid sessions on protected routes (/dashboard/*). Unauthenticated users are redirected to /login. The /api/webhooks path is excluded from auth checks for third-party integrations.", concepts: ["middleware", "route-protection", "authentication", "security"], files: ["src/middleware.ts"], importance: 8 },
      { type: "file_edit", title: "Implement role-based access control", subtitle: "RBAC", facts: ["Added user roles: admin, editor, viewer", "Created withAuth HOC for role checking", "Stored roles in JWT custom claims"], narrative: "Implemented role-based access control with three roles: admin, editor, and viewer. Created a withAuth higher-order component that checks user roles before rendering protected components. Roles are stored as custom claims in the JWT token.", concepts: ["rbac", "authorization", "roles", "jwt-claims", "security"], files: ["src/lib/auth/rbac.ts", "src/lib/auth/with-auth.tsx"], importance: 8 },
      { type: "file_edit", title: "Add password hashing with bcrypt", subtitle: "Security", facts: ["Using bcrypt with cost factor 12", "Added password strength validation (min 8 chars, mixed case, number)", "Implemented rate limiting on login endpoint (5 attempts per 15 min)"], narrative: "Added bcrypt password hashing with cost factor 12 for the email/password authentication flow. Implemented password strength validation requiring minimum 8 characters with mixed case and numbers. Added rate limiting on the login API endpoint: 5 attempts per 15-minute window per IP.", concepts: ["bcrypt", "password-hashing", "rate-limiting", "security", "validation"], files: ["src/lib/auth/password.ts", "src/app/api/auth/login/route.ts"], importance: 9 },
      { type: "file_edit", title: "Create user profile settings page", subtitle: "User settings", facts: ["Profile page shows avatar, name, email", "Added avatar upload with S3 presigned URLs", "Implemented account deletion flow"], narrative: "Built the user profile settings page showing avatar, name, and email. Added avatar upload using S3 presigned URLs for direct browser-to-S3 uploads. Implemented a full account deletion flow with email confirmation.", concepts: ["user-profile", "settings", "s3", "file-upload", "account-deletion"], files: ["src/app/dashboard/settings/page.tsx", "src/app/api/upload/route.ts"], importance: 6 },
      { type: "command_run", title: "Debug OAuth callback URL mismatch", subtitle: "Auth debugging", facts: ["GitHub OAuth callback failed with redirect_uri_mismatch", "Fixed: NEXTAUTH_URL was set to http:// but app served on https://", "Lesson: always use HTTPS in production OAuth callback URLs"], narrative: "Spent time debugging why GitHub OAuth login failed in production. The error was redirect_uri_mismatch. Root cause: NEXTAUTH_URL environment variable was set to http://localhost:3000 in production instead of the HTTPS production URL. Fixed by updating the environment variable.", concepts: ["oauth-debugging", "github", "callback-url", "environment-variables", "production"], files: [".env.production"], importance: 7 },
      { type: "file_edit", title: "Add CSRF protection to API routes", subtitle: "Security", facts: ["Implemented double-submit cookie pattern", "Added CSRF token generation in layout", "Validated CSRF token on all POST/PUT/DELETE requests"], narrative: "Added CSRF protection using the double-submit cookie pattern. A CSRF token is generated on page load and stored in both a cookie and a hidden form field. All mutating API requests (POST, PUT, DELETE) validate the token.", concepts: ["csrf", "security", "cookies", "api-protection"], files: ["src/lib/csrf.ts", "src/middleware.ts"], importance: 8 },
    ],
  },
  {
    sessionRange: [10, 14],
    daysAgoRange: [19, 15],
    project: "webapp",
    observations: [
      { type: "file_edit", title: "Set up Prisma ORM with PostgreSQL", subtitle: "Database", facts: ["Initialized Prisma with PostgreSQL provider", "Created User, Post, Comment, Tag models", "Generated migrations with prisma migrate dev"], narrative: "Set up Prisma ORM connecting to a PostgreSQL database. Defined the initial schema with User, Post, Comment, and Tag models including many-to-many relationships between Post and Tag.", concepts: ["prisma", "postgresql", "database", "orm", "schema", "migrations"], files: ["prisma/schema.prisma", "src/lib/db.ts"], importance: 9 },
      { type: "file_edit", title: "Create database seed script", subtitle: "Seeding", facts: ["Created seed.ts with faker-generated data", "Seeds 10 users, 50 posts, 200 comments", "Runs via prisma db seed command"], narrative: "Built a database seed script using faker.js to generate realistic test data. Creates 10 users with posts, comments, and tags. Configured to run automatically on prisma db seed.", concepts: ["database", "seeding", "faker", "test-data", "prisma"], files: ["prisma/seed.ts", "package.json"], importance: 5 },
      { type: "file_edit", title: "Implement server actions for CRUD operations", subtitle: "Data layer", facts: ["Created server actions for post CRUD", "Used Prisma transactions for multi-step operations", "Added revalidatePath after mutations"], narrative: "Implemented Next.js server actions for post create, read, update, and delete operations. Used Prisma transactions for operations that modify multiple tables. Called revalidatePath after mutations to refresh cached data.", concepts: ["server-actions", "crud", "prisma", "transactions", "revalidation", "caching"], files: ["src/app/actions/posts.ts"], importance: 8 },
      { type: "command_run", title: "Fix N+1 query in post listing", subtitle: "Performance", facts: ["Identified N+1 query loading post authors individually", "Fixed with Prisma include for eager loading", "Query count dropped from 52 to 3"], narrative: "Discovered an N+1 query problem on the post listing page — each post was triggering a separate query to load its author. Fixed by using Prisma's include option for eager loading. Total query count dropped from 52 to 3.", concepts: ["n+1", "performance", "prisma", "eager-loading", "query-optimization"], files: ["src/app/actions/posts.ts"], importance: 8 },
      { type: "file_edit", title: "Add full-text search with PostgreSQL tsvector", subtitle: "Search", facts: ["Created tsvector column on posts table", "Built GIN index for fast text search", "Implemented search API with ts_rank scoring"], narrative: "Added full-text search using PostgreSQL's built-in tsvector functionality. Created a generated tsvector column combining title and body, with a GIN index. The search API uses ts_rank for relevance scoring and supports phrase matching.", concepts: ["full-text-search", "postgresql", "tsvector", "gin-index", "search"], files: ["prisma/migrations/20260301_add_search.sql", "src/app/api/search/route.ts"], importance: 7 },
      { type: "file_edit", title: "Set up connection pooling with PgBouncer", subtitle: "Database infra", facts: ["Deployed PgBouncer in transaction pooling mode", "Configured max 25 client connections, 10 server connections", "Added DATABASE_URL_DIRECT for migrations (bypasses pooler)"], narrative: "Deployed PgBouncer as a connection pooler for PostgreSQL. Using transaction pooling mode to maximize connection reuse. Configured separate DATABASE_URL for application use (through pooler) and DATABASE_URL_DIRECT for migrations.", concepts: ["pgbouncer", "connection-pooling", "postgresql", "infrastructure"], files: ["docker-compose.yml", ".env"], importance: 7 },
      { type: "command_run", title: "Debug Prisma migration drift", subtitle: "Database debugging", facts: ["prisma migrate deploy failed with drift detected", "Cause: manual SQL ALTER was run directly on production", "Resolution: ran prisma migrate resolve to mark migration as applied"], narrative: "Production deployment failed because Prisma detected schema drift — someone had run a manual ALTER TABLE directly on the production database. Resolved by using prisma migrate resolve to mark the conflicting migration as already applied.", concepts: ["prisma", "migration-drift", "database", "production", "debugging"], files: ["prisma/schema.prisma"], importance: 7 },
      { type: "file_edit", title: "Add Redis caching layer for expensive queries", subtitle: "Caching", facts: ["Used ioredis with 60-second TTL for post listings", "Implemented cache-aside pattern", "Added cache invalidation on post mutations"], narrative: "Added a Redis caching layer for expensive database queries. Post listings are cached for 60 seconds using a cache-aside pattern. Cache entries are invalidated when posts are created, updated, or deleted.", concepts: ["redis", "caching", "cache-aside", "ioredis", "performance"], files: ["src/lib/cache.ts", "src/app/actions/posts.ts"], importance: 7 },
    ],
  },
  {
    sessionRange: [15, 19],
    daysAgoRange: [14, 10],
    project: "webapp",
    observations: [
      { type: "file_edit", title: "Build REST API with input validation", subtitle: "API", facts: ["Created /api/v1/posts, /api/v1/users endpoints", "Used zod for request body validation", "Added consistent error response format with error codes"], narrative: "Built a versioned REST API under /api/v1/ with endpoints for posts and users. All request bodies are validated with zod schemas. Errors follow a consistent format with error codes, messages, and field-level details.", concepts: ["rest-api", "zod", "validation", "error-handling", "api-design"], files: ["src/app/api/v1/posts/route.ts", "src/app/api/v1/users/route.ts", "src/lib/api/errors.ts"], importance: 8 },
      { type: "file_edit", title: "Implement cursor-based pagination", subtitle: "API pagination", facts: ["Replaced offset pagination with cursor-based approach", "Uses Prisma cursor with opaque base64-encoded cursors", "Returns hasNextPage and endCursor in response"], narrative: "Switched from offset-based to cursor-based pagination for the post listing API. Cursors are base64-encoded Prisma record IDs. Response includes hasNextPage boolean and endCursor for the client to request the next page.", concepts: ["pagination", "cursor-based", "prisma", "api-design", "performance"], files: ["src/app/api/v1/posts/route.ts", "src/lib/api/pagination.ts"], importance: 7 },
      { type: "file_edit", title: "Add API rate limiting with Upstash Redis", subtitle: "Rate limiting", facts: ["Used @upstash/ratelimit with sliding window algorithm", "10 requests per 10 seconds per API key", "Returns X-RateLimit-Remaining header"], narrative: "Implemented API rate limiting using Upstash Redis with a sliding window algorithm. Each API key is limited to 10 requests per 10-second window. Rate limit status is communicated via standard X-RateLimit-* headers.", concepts: ["rate-limiting", "upstash", "redis", "api-security", "sliding-window"], files: ["src/middleware.ts", "src/lib/rate-limit.ts"], importance: 8 },
      { type: "file_edit", title: "Create webhook system for external integrations", subtitle: "Webhooks", facts: ["Built webhook registration and delivery system", "Events: post.created, post.updated, user.signup", "Implemented retry with exponential backoff (max 3 retries)"], narrative: "Created a webhook system allowing external services to subscribe to events. Supports post.created, post.updated, and user.signup events. Webhook deliveries use exponential backoff with up to 3 retries on failure.", concepts: ["webhooks", "events", "integrations", "retry", "exponential-backoff"], files: ["src/lib/webhooks.ts", "src/app/api/v1/webhooks/route.ts"], importance: 7 },
      { type: "file_edit", title: "Add OpenAPI specification with Swagger UI", subtitle: "API docs", facts: ["Generated OpenAPI 3.1 spec from zod schemas", "Added Swagger UI at /api/docs", "Included request/response examples"], narrative: "Generated an OpenAPI 3.1 specification from the existing zod validation schemas. Added Swagger UI accessible at /api/docs for interactive API documentation with request/response examples.", concepts: ["openapi", "swagger", "api-documentation", "zod"], files: ["src/app/api/docs/route.ts", "src/lib/openapi.ts"], importance: 5 },
      { type: "command_run", title: "Debug 504 gateway timeout on large queries", subtitle: "Performance debugging", facts: ["Large post queries timing out after 30 seconds on Vercel", "Root cause: missing database index on posts.authorId", "Added composite index (authorId, createdAt DESC), query dropped to 50ms"], narrative: "Investigated 504 Gateway Timeout errors on the post listing endpoint in production (Vercel). Found that large queries filtering by author were doing a full table scan. Added a composite index on (authorId, createdAt DESC) which reduced query time from 30+ seconds to 50ms.", concepts: ["performance", "timeout", "database-index", "postgresql", "vercel", "debugging"], files: ["prisma/migrations/20260310_add_author_index.sql"], importance: 9 },
      { type: "file_edit", title: "Implement API versioning strategy", subtitle: "API design", facts: ["URL-based versioning: /api/v1/, /api/v2/", "v1 deprecated with Sunset header", "Migration guide in API docs"], narrative: "Established an API versioning strategy using URL-based versioning (/api/v1/, /api/v2/). The v1 API returns a Sunset header indicating its deprecation date. Added a migration guide to the API documentation.", concepts: ["api-versioning", "deprecation", "sunset-header", "backward-compatibility"], files: ["src/app/api/v2/posts/route.ts", "src/lib/api/versioning.ts"], importance: 6 },
      { type: "file_edit", title: "Add request logging with structured JSON", subtitle: "Observability", facts: ["Used pino for structured JSON logging", "Logs request method, path, status, duration, user ID", "Configured log levels per environment"], narrative: "Added structured JSON request logging using pino. Each request logs method, path, response status, duration in milliseconds, and authenticated user ID. Log levels are configured per environment (debug in dev, info in production).", concepts: ["logging", "pino", "observability", "structured-logging", "monitoring"], files: ["src/lib/logger.ts", "src/middleware.ts"], importance: 6 },
    ],
  },
  {
    sessionRange: [20, 24],
    daysAgoRange: [9, 5],
    project: "webapp",
    observations: [
      { type: "file_edit", title: "Write unit tests for auth module", subtitle: "Testing", facts: ["25 test cases covering login, signup, role checking", "Mocked Prisma client with vitest", "Achieved 92% coverage on auth module"], narrative: "Wrote comprehensive unit tests for the authentication module. 25 test cases covering login flow, signup validation, role-based access checks, and password hashing. Mocked the Prisma client using vitest's vi.mock. Achieved 92% code coverage.", concepts: ["unit-testing", "vitest", "mocking", "authentication", "coverage"], files: ["tests/unit/auth.test.ts", "tests/unit/rbac.test.ts"], importance: 7 },
      { type: "file_edit", title: "Add E2E tests with Playwright", subtitle: "E2E testing", facts: ["Configured Playwright with Chrome and Firefox", "Tests: login flow, post CRUD, search, pagination", "Set up test database with Docker for isolation"], narrative: "Set up Playwright for end-to-end testing with Chrome and Firefox browsers. Created E2E tests for the complete login flow, post CRUD operations, search functionality, and pagination. Each test run gets a fresh database via Docker containers.", concepts: ["playwright", "e2e-testing", "docker", "test-isolation", "browser-testing"], files: ["playwright.config.ts", "tests/e2e/auth.spec.ts", "tests/e2e/posts.spec.ts", "docker-compose.test.yml"], importance: 8 },
      { type: "command_run", title: "Fix flaky Playwright test on CI", subtitle: "CI debugging", facts: ["Test passed locally but failed in GitHub Actions", "Root cause: missing waitForNavigation after form submit", "Fixed by using page.waitForURL instead of waitForNavigation"], narrative: "Debugged a flaky Playwright test that passed locally but failed intermittently in GitHub Actions CI. The issue was a race condition after form submission — the test was checking the URL before navigation completed. Fixed by replacing the deprecated waitForNavigation with page.waitForURL.", concepts: ["playwright", "flaky-test", "ci", "github-actions", "debugging", "race-condition"], files: ["tests/e2e/auth.spec.ts"], importance: 6 },
      { type: "file_edit", title: "Add API integration tests with supertest", subtitle: "API testing", facts: ["30 test cases for REST API endpoints", "Tests validation, auth, error responses, pagination", "Uses test database with transaction rollback"], narrative: "Created API integration tests using supertest. 30 test cases covering request validation, authentication requirements, error response formats, and cursor-based pagination. Each test runs in a database transaction that rolls back after completion.", concepts: ["integration-testing", "supertest", "api-testing", "transactions", "test-isolation"], files: ["tests/integration/api.test.ts"], importance: 7 },
      { type: "file_edit", title: "Set up test coverage reporting with codecov", subtitle: "Coverage", facts: ["Configured vitest coverage with v8 provider", "Minimum coverage thresholds: 80% branches, 85% lines", "Upload to Codecov in CI pipeline"], narrative: "Configured vitest code coverage using the v8 provider. Set minimum coverage thresholds at 80% for branches and 85% for lines. Coverage reports are uploaded to Codecov as part of the GitHub Actions CI pipeline.", concepts: ["code-coverage", "codecov", "vitest", "ci", "quality-gates"], files: ["vitest.config.ts", ".github/workflows/ci.yml"], importance: 5 },
      { type: "file_edit", title: "Create test fixtures and factories", subtitle: "Test infrastructure", facts: ["Built factory functions for User, Post, Comment, Tag", "Uses faker for realistic data generation", "Supports partial overrides for specific test scenarios"], narrative: "Created test factory functions for all main models (User, Post, Comment, Tag). Factories use faker.js for realistic data and support partial overrides so individual tests can customize specific fields.", concepts: ["test-factories", "faker", "testing-infrastructure", "fixtures"], files: ["tests/fixtures/factories.ts"], importance: 5 },
      { type: "command_run", title: "Debug memory leak in test suite", subtitle: "Test debugging", facts: ["Tests consuming 2GB+ RAM after 100+ test files", "Root cause: Prisma client not disconnected in afterAll", "Fixed by adding global teardown that calls prisma.$disconnect()"], narrative: "Investigated why the test suite was consuming over 2GB of RAM. The Prisma client was creating new connections in each test file but never disconnecting. Fixed by adding a global teardown hook that calls prisma.$disconnect().", concepts: ["memory-leak", "testing", "prisma", "debugging", "resource-management"], files: ["vitest.config.ts", "tests/setup.ts"], importance: 7 },
      { type: "file_edit", title: "Add snapshot testing for API responses", subtitle: "Snapshot tests", facts: ["Added toMatchSnapshot for API response shapes", "Snapshot updates require --update flag", "Catches unintended breaking changes in API responses"], narrative: "Added snapshot testing for API response shapes to catch unintended breaking changes. Response bodies are compared against stored snapshots. Snapshots must be explicitly updated with the --update flag when intentional changes are made.", concepts: ["snapshot-testing", "api-testing", "regression-testing", "vitest"], files: ["tests/integration/api.test.ts", "tests/integration/__snapshots__/"], importance: 4 },
    ],
  },
  {
    sessionRange: [25, 29],
    daysAgoRange: [4, 0],
    project: "webapp",
    observations: [
      { type: "file_edit", title: "Create multi-stage Dockerfile", subtitle: "Docker", facts: ["Multi-stage build: deps → build → production", "Final image size 180MB (down from 1.2GB)", "Runs as non-root user with UID 1001"], narrative: "Created a multi-stage Dockerfile for the Next.js application. Stage 1 installs dependencies, stage 2 builds the app, stage 3 copies only production artifacts. Final image is 180MB (down from 1.2GB). Application runs as a non-root user for security.", concepts: ["docker", "multi-stage-build", "containerization", "security", "image-optimization"], files: ["Dockerfile", ".dockerignore"], importance: 7 },
      { type: "file_edit", title: "Set up GitHub Actions CI/CD pipeline", subtitle: "CI/CD", facts: ["Matrix build: Node 18 and 20", "Jobs: lint, test, build, deploy", "Auto-deploy to Vercel on main branch push"], narrative: "Created a comprehensive GitHub Actions CI/CD pipeline with matrix builds for Node 18 and 20. Pipeline runs lint, test (with coverage), build, and deploy jobs. Merges to main automatically trigger Vercel deployment.", concepts: ["github-actions", "ci-cd", "deployment", "vercel", "automation"], files: [".github/workflows/ci.yml", ".github/workflows/deploy.yml"], importance: 8 },
      { type: "file_edit", title: "Configure Kubernetes deployment manifests", subtitle: "K8s", facts: ["Created Deployment, Service, Ingress, HPA resources", "HPA: min 2, max 10 replicas, CPU target 70%", "Health checks: liveness on /healthz, readiness on /readyz"], narrative: "Created Kubernetes deployment manifests including Deployment, Service, Ingress, and HorizontalPodAutoscaler. HPA scales between 2 and 10 replicas targeting 70% CPU utilization. Added liveness and readiness probes for health monitoring.", concepts: ["kubernetes", "deployment", "hpa", "autoscaling", "health-checks", "ingress"], files: ["k8s/deployment.yaml", "k8s/service.yaml", "k8s/ingress.yaml", "k8s/hpa.yaml"], importance: 8 },
      { type: "file_edit", title: "Add Terraform for AWS infrastructure", subtitle: "IaC", facts: ["VPC with public/private subnets across 3 AZs", "RDS PostgreSQL with Multi-AZ failover", "ElastiCache Redis cluster with 2 replicas"], narrative: "Created Terraform modules for AWS infrastructure. VPC spans 3 availability zones with public and private subnets. RDS PostgreSQL instance with Multi-AZ failover for high availability. ElastiCache Redis cluster with 2 read replicas.", concepts: ["terraform", "aws", "infrastructure-as-code", "vpc", "rds", "elasticache"], files: ["terraform/main.tf", "terraform/vpc.tf", "terraform/rds.tf", "terraform/redis.tf"], importance: 8 },
      { type: "command_run", title: "Debug Kubernetes pod crash loop", subtitle: "K8s debugging", facts: ["Pods in CrashLoopBackOff status", "Root cause: DATABASE_URL secret not mounted correctly", "Fixed: Secret key name was 'database-url' but env var expected 'DATABASE_URL'"], narrative: "Debugged pods stuck in CrashLoopBackOff. The application was failing to start because the DATABASE_URL environment variable was empty. Root cause: the Kubernetes secret had the key 'database-url' (kebab-case) but the secretKeyRef expected 'DATABASE_URL' (uppercase).", concepts: ["kubernetes", "debugging", "crashloopbackoff", "secrets", "environment-variables"], files: ["k8s/deployment.yaml", "k8s/secrets.yaml"], importance: 8 },
      { type: "file_edit", title: "Set up Datadog monitoring and alerting", subtitle: "Monitoring", facts: ["Deployed Datadog agent as DaemonSet", "Custom metrics: request latency, error rate, DB query time", "Alerts: p99 latency > 500ms, error rate > 1%"], narrative: "Deployed the Datadog monitoring agent as a Kubernetes DaemonSet. Created custom metrics for request latency, error rate, and database query time. Set up alerts that trigger when p99 latency exceeds 500ms or error rate exceeds 1%.", concepts: ["datadog", "monitoring", "alerting", "observability", "kubernetes"], files: ["k8s/datadog-agent.yaml", "src/lib/metrics.ts"], importance: 7 },
      { type: "file_edit", title: "Implement blue-green deployment strategy", subtitle: "Deployment", facts: ["Two identical environments: blue and green", "Health check must pass before traffic switch", "Instant rollback by switching back to previous color"], narrative: "Implemented blue-green deployment strategy. Two identical environments run simultaneously — deploy to the inactive one, run health checks, then switch traffic via Kubernetes service selector update. Rollback is instant by pointing traffic back to the previous color.", concepts: ["blue-green", "deployment-strategy", "zero-downtime", "rollback", "kubernetes"], files: ["k8s/blue-deployment.yaml", "k8s/green-deployment.yaml", "scripts/deploy.sh"], importance: 7 },
      { type: "file_edit", title: "Add Prometheus metrics and Grafana dashboards", subtitle: "Observability", facts: ["Exported custom metrics via /metrics endpoint", "Metrics: http_request_duration, db_query_duration, cache_hit_ratio", "Created Grafana dashboard with request rate, latency, error panels"], narrative: "Added Prometheus metrics export on a /metrics endpoint. Custom metrics include HTTP request duration histogram, database query duration, and cache hit ratio. Created a Grafana dashboard with panels for request rate, latency percentiles, error rate, and cache performance.", concepts: ["prometheus", "grafana", "metrics", "observability", "dashboards"], files: ["src/lib/metrics.ts", "grafana/dashboard.json"], importance: 6 },
    ],
  },
];

export function generateDataset(): {
  observations: CompressedObservation[];
  queries: LabeledQuery[];
  sessions: Map<string, string[]>;
} {
  const observations: CompressedObservation[] = [];
  const sessions = new Map<string, string[]>();

  for (const group of RAW_SESSIONS) {
    const [sStart, sEnd] = group.sessionRange;
    const [dStart, dEnd] = group.daysAgoRange;

    for (let s = sStart; s <= sEnd; s++) {
      const sessionId = `ses_${s.toString().padStart(3, "0")}`;
      const daysAgo = dStart - ((s - sStart) / Math.max(1, sEnd - sStart)) * (dStart - dEnd);
      const obsIds: string[] = [];

      const obsPerSession = Math.min(group.observations.length, OBS_PER_SESSION);
      for (let o = 0; o < obsPerSession; o++) {
        const idx = ((s - sStart) * obsPerSession + o) % group.observations.length;
        const raw = group.observations[idx];
        const obsId = `obs_${sessionId}_${o.toString().padStart(2, "0")}`;
        const hourOffset = o * 0.5;

        observations.push({
          id: obsId,
          sessionId,
          timestamp: ts(daysAgo - hourOffset / 24),
          ...raw,
        });
        obsIds.push(obsId);
      }
      sessions.set(sessionId, obsIds);
    }
  }

  const queries: LabeledQuery[] = [
    {
      query: "How did we set up authentication?",
      relevantObsIds: observations.filter(o => o.concepts.some(c => ["nextauth", "authentication", "oauth", "jwt", "login", "signup"].includes(c))).map(o => o.id),
      description: "Should find all auth-related observations across sessions 5-9",
      category: "semantic",
    },
    {
      query: "JWT token validation middleware",
      relevantObsIds: observations.filter(o => o.concepts.includes("jwt") || (o.concepts.includes("middleware") && o.concepts.includes("authentication"))).map(o => o.id),
      description: "Exact match on JWT middleware setup",
      category: "exact",
    },
    {
      query: "PostgreSQL connection issues",
      relevantObsIds: observations.filter(o => o.concepts.some(c => ["postgresql", "pgbouncer", "connection-pooling", "database"].includes(c))).map(o => o.id),
      description: "Should find database connection and pooling observations",
      category: "semantic",
    },
    {
      query: "Playwright test configuration",
      relevantObsIds: observations.filter(o => o.concepts.includes("playwright") || (o.concepts.includes("e2e-testing"))).map(o => o.id),
      description: "E2E testing setup with Playwright",
      category: "exact",
    },
    {
      query: "Why did the production deployment fail?",
      relevantObsIds: observations.filter(o => o.concepts.some(c => ["debugging", "production", "crashloopbackoff", "timeout", "migration-drift"].includes(c))).map(o => o.id),
      description: "Cross-session: find all production debugging incidents",
      category: "cross-session",
    },
    {
      query: "rate limiting implementation",
      relevantObsIds: observations.filter(o => o.concepts.includes("rate-limiting")).map(o => o.id),
      description: "Rate limiting across auth and API modules",
      category: "exact",
    },
    {
      query: "What security measures did we add?",
      relevantObsIds: observations.filter(o => o.concepts.some(c => ["security", "csrf", "bcrypt", "rate-limiting", "rbac", "password-hashing"].includes(c))).map(o => o.id),
      description: "Broad semantic: all security-related work",
      category: "semantic",
    },
    {
      query: "database performance optimization",
      relevantObsIds: observations.filter(o => o.concepts.some(c => ["n+1", "query-optimization", "database-index", "performance", "eager-loading", "caching"].includes(c))).map(o => o.id),
      description: "Performance optimizations across database and caching",
      category: "semantic",
    },
    {
      query: "Kubernetes pod crash debugging",
      relevantObsIds: observations.filter(o => o.concepts.some(c => ["crashloopbackoff", "kubernetes"].includes(c)) && o.concepts.includes("debugging")).map(o => o.id),
      description: "Specific K8s debugging incident",
      category: "entity",
    },
    {
      query: "Docker containerization setup",
      relevantObsIds: observations.filter(o => o.concepts.some(c => ["docker", "multi-stage-build", "containerization", "dockerfile"].includes(c))).map(o => o.id),
      description: "Docker-related observations",
      category: "entity",
    },
    {
      query: "How does caching work in the app?",
      relevantObsIds: observations.filter(o => o.concepts.some(c => ["redis", "caching", "cache-aside", "ioredis", "elasticache"].includes(c))).map(o => o.id),
      description: "All caching-related observations",
      category: "semantic",
    },
    {
      query: "test infrastructure and factories",
      relevantObsIds: observations.filter(o => o.concepts.some(c => ["test-factories", "testing-infrastructure", "fixtures", "mocking"].includes(c))).map(o => o.id),
      description: "Test setup infrastructure",
      category: "exact",
    },
    {
      query: "What happened with the OAuth callback error?",
      relevantObsIds: observations.filter(o => o.concepts.some(c => ["oauth-debugging", "callback-url"].includes(c))).map(o => o.id),
      description: "Specific debugging incident recall",
      category: "cross-session",
    },
    {
      query: "monitoring and observability setup",
      relevantObsIds: observations.filter(o => o.concepts.some(c => ["datadog", "prometheus", "grafana", "monitoring", "observability", "alerting", "metrics", "logging", "pino"].includes(c))).map(o => o.id),
      description: "All monitoring/observability observations",
      category: "semantic",
    },
    {
      query: "Prisma ORM configuration",
      relevantObsIds: observations.filter(o => o.concepts.includes("prisma")).map(o => o.id),
      description: "All Prisma-related observations",
      category: "entity",
    },
    {
      query: "CI/CD pipeline configuration",
      relevantObsIds: observations.filter(o => o.concepts.some(c => ["ci-cd", "github-actions", "deployment", "ci"].includes(c))).map(o => o.id),
      description: "CI/CD related observations",
      category: "exact",
    },
    {
      query: "memory leak debugging",
      relevantObsIds: observations.filter(o => o.concepts.includes("memory-leak")).map(o => o.id),
      description: "Memory leak incidents (WebSocket handler, test suite)",
      category: "cross-session",
    },
    {
      query: "API design decisions",
      relevantObsIds: observations.filter(o => o.concepts.some(c => ["rest-api", "api-design", "api-versioning", "pagination", "openapi", "error-handling"].includes(c))).map(o => o.id),
      description: "API design and architecture decisions",
      category: "semantic",
    },
    {
      query: "zod validation schemas",
      relevantObsIds: observations.filter(o => o.concepts.includes("zod")).map(o => o.id),
      description: "Where zod is used for validation",
      category: "entity",
    },
    {
      query: "infrastructure as code Terraform",
      relevantObsIds: observations.filter(o => o.concepts.some(c => ["terraform", "infrastructure-as-code", "aws", "vpc", "rds", "elasticache"].includes(c))).map(o => o.id),
      description: "Terraform/IaC observations",
      category: "entity",
    },
  ];

  return { observations, queries, sessions };
}

export function generateScaleDataset(count: number): CompressedObservation[] {
  const base = generateDataset().observations;
  const result: CompressedObservation[] = [];

  for (let i = 0; i < count; i++) {
    const src = base[i % base.length];
    result.push({
      ...src,
      id: `obs_scale_${i.toString().padStart(6, "0")}`,
      sessionId: `ses_${Math.floor(i / 8).toString().padStart(4, "0")}`,
      timestamp: ts(Math.random() * 90),
      title: `${src.title} (iteration ${i})`,
      narrative: `${src.narrative} [Scale test variant ${i}, session group ${Math.floor(i / 8)}]`,
    });
  }
  return result;
}
