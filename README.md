# Fight Club Attendance System

Web-based attendance and check-in system for Fight Club martial arts gym.

## Current Repository Structure

```text
windsurf-project/
├── docs/
├── web/                     # React + Vite frontend
├── functions/               # Firebase Functions (TypeScript)
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
└── package.json             # root orchestration scripts
```

## Local Setup

1. Install web dependencies:
   - `npm --prefix web install`
2. Install functions dependencies:
   - `npm --prefix functions install`
3. Copy `.env.example` values into local env files as needed.
4. Build everything:
   - `npm run build`
5. Run emulators:
   - `npm run emulators`

## Key Docs

- `docs/implementation-plan-v1.md`
- `docs/checkpoint-2026-02-10.md`
- `docs/firebase-setup-checklist.md`
- `docs/data-model.md`
- `docs/integration-spec.md`
- `docs/user-flows.md`

## Notes

- The project currently has baseline scaffolding and documentation-aligned config.
- Business logic for check-in, waiver flow, and webhook delivery worker is not fully implemented yet.
