# Project Structure

## Current (Scaffolded) Layout

```text
fight-club-app/
├── docs/
│   ├── architecture.md
│   ├── branding.md
│   ├── data-model.md
│   ├── dev-principles.md
│   ├── firebase-setup-checklist.md
│   ├── implementation-plan-v1.md
│   ├── integration-spec.md
│   ├── roadmap.md
│   └── user-flows.md
├── web/                          # React + Vite frontend
│   ├── src/
│   ├── public/
│   └── package.json
├── functions/                    # Firebase Functions (TypeScript)
│   ├── src/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── .env.example
├── .firebaserc
├── firebase.json
├── firestore.indexes.json
├── firestore.rules
├── package.json                  # Root orchestration scripts
└── README.md
```

## Directory Responsibilities

### `docs/`
- Product and implementation documentation.
- Source of truth for data model, flows, and integration boundaries.

### `web/`
- SPA frontend for kiosk and admin screens.
- Built output in `web/dist` for Firebase Hosting.

### `functions/`
- Backend boundary for privileged operations and webhook processing.
- Contains Firebase Cloud Functions written in TypeScript.

## Naming/Conventions

- Components: `PascalCase.tsx`
- Utilities/services: `kebab-case.ts` or domain-driven names
- Constants: `UPPER_SNAKE_CASE`
- All new app code in TypeScript

## Local Commands

```bash
# frontend only
npm run dev:web

# build frontend + functions
npm run build

# lint frontend + functions
npm run lint

# firebase local emulators
npm run emulators
```

## Planned Expansion

- `web/src/pages/kiosk/*` and `web/src/pages/admin/*`
- `functions/src/webhooks/*` and retry worker modules
- stricter Firestore rules + App Check guardrails
