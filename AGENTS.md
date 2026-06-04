# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js 14 TypeScript app with App Router APIs, Prisma, PostgreSQL, Tailwind, and an agent runtime. Routes and pages live in `app/`; UI in `components/`; server utilities in `lib/`; agent orchestration and tools in `agent/`; schema, seeds, and migrations in `prisma/`; tests in `tests/agent`, `tests/lib`, and `tests/server`. Deployment notes live in `docs/`, `Dockerfile`, and `docker-compose.yml`.

## Build, Test, and Development Commands

- `npm install`: install dependencies from `package-lock.json`.
- `npm run dev`: start the local Next.js development server.
- `npm run build`: run `prisma generate` and build the production app.
- `npm run start`: serve the built app.
- `npm run lint`: run the Next.js ESLint configuration.
- `npm test`: run Vitest once; use `npm run test:watch` while iterating.
- `npm run db:generate`: regenerate the Prisma client.
- `npm run db:seed`: seed local data with `prisma/seed.ts`.
- `npm run agent:worker`: run the agent task worker.
- Restart the deployed project with `docker compose build web agent-worker init` followed by `docker compose up -d`.

## Coding Style & Naming Conventions

Use strict TypeScript, ES modules, and the `@/*` path alias configured in `tsconfig.json`. Follow existing formatting: two-space indentation, double quotes, semicolons, and named exports where local files already use them. React components use PascalCase filenames such as `PasswordInput.tsx`; helpers and server modules use kebab-case filenames such as `room-snapshot.ts`; tests use `*.test.ts`.

## Testing Guidelines

Vitest runs in a Node environment and includes `tests/**/*.test.ts`. Add focused tests near the affected domain: agent behavior in `tests/agent/`, auth/API behavior in `tests/server/`, and utilities in `tests/lib/`. Run `npm test` before handing off changes; run `npm run lint` for UI or route-handler edits.

## Database & Configuration Notes

Copy `.env.example` to `.env` and do not commit secrets. Database schema changes must update `prisma/schema.prisma` and add a timestamped migration such as `prisma/migrations/20260604120000_add_example/migration.sql`. Database-related changes must account for the `init` container, which applies Prisma migrations during deployment. Keep migrations idempotent with `IF EXISTS` or `IF NOT EXISTS`; do not delete applied migrations.

## Agent-Specific Instructions

All assistant responses for this repository must be in Chinese.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit style, sometimes with scopes: `feat(agent): ...`, `feat(atlas): ...`, `docs: ...`. Keep commits focused and describe user-visible behavior. Pull requests should include a summary, test results, linked issues when applicable, screenshots for UI changes, and notes for schema, environment, or deployment changes.
