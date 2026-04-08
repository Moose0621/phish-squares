# Phish Squares — Project Guidelines

Phish song draft game: snake draft, real-time multiplayer via WebSocket, auto-scoring from Phish.net.

## Architecture

Monorepo (npm workspaces) with four packages:

| Package | Stack | Purpose |
|---------|-------|---------|
| `apps/api` | Express 4, Socket.io, Prisma (PostgreSQL) | REST API + WebSocket draft server |
| `apps/web` | React 19, Vite, React Router v6 | SPA client |
| `apps/mobile` | React Native, Expo 52, Expo Router | Mobile client |
| `packages/shared` | TypeScript, Zod | Types, validation schemas, snake draft logic |

**Key boundaries:**
- Shared types and Zod validation schemas live in `packages/shared` — import from `@phish-squares/shared`, never duplicate
- API routes are grouped under `/api` — auth, games, songs, admin, runs, users, leaderboard
- Real-time draft updates flow through Socket.io (namespace setup in `services/draft-socket.ts`)
- Game status lifecycle: `LOBBY → DRAFTING → LOCKED → SCORED`
- Snake draft: odd rounds pick forward, even rounds reverse; 11 rounds (10 normal + 1 bonus)

## Build and Test

```bash
# Development
npm run dev:api          # API watch mode (tsx)
npm run dev:web          # Vite dev server
npm run docker:up        # Full stack via Docker Compose (postgres + api + web)

# Build
npm run build            # All workspaces
npm run build:shared     # Build shared first if changing types

# Testing
npm run test             # All tests (Jest)
npm run test:unit        # Unit tests only
npm run test:integration # API integration tests
npm run test:e2e         # Playwright E2E (starts API automatically)

# Database
npm run db:migrate       # Deploy migrations (prisma migrate deploy)
npm run db:seed          # Seed data
npx prisma studio --schema=apps/api/prisma/schema.prisma  # DB browser

# Quality
npm run lint             # ESLint all workspaces
npm run typecheck        # TypeScript all workspaces
```

## Conventions

- **TypeScript strict mode** across all packages — target ES2022, CommonJS modules
- **Zod for validation** — schemas defined in `packages/shared/src/validation.ts`, used by both API middleware and clients
- **Unused variables**: prefix with `_` to suppress ESLint warnings (`argsIgnorePattern: '^_'`)
- **CSS Modules** for web styling — each page has a corresponding `.module.css` file
- **Express middleware pattern**: `validate.ts` for Zod request validation, `auth.ts` for JWT verification
- **Test organization**: unit tests in `__tests__/unit/`, integration in `__tests__/integration/`, E2E in `e2e/tests/`
- **Environment config**: centralized in `apps/api/src/config.ts` — all env vars with defaults

## Database

Prisma schema at `apps/api/prisma/schema.prisma`. Core models: User, Game, GamePlayer, Pick, Song, Run, RunPlayer, UserStats. Always create new migrations via `npx prisma migrate dev --schema=apps/api/prisma/schema.prisma`.

## Docker

Multi-stage Dockerfile: builds shared → API → web. Docker Compose runs postgres (v16), API (port 3000), web (port 5173), and a migrations service. Use `npm run docker:up` / `npm run docker:down`.
