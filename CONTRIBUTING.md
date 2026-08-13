# Contributing to Ruckus

Thanks for helping build open conference program ops. This repo is intentionally small and demo-honest: prefer clarity over framework sprawl.

## Development setup

```sh
npm install
npm run dev          # API :8787 + Vite UI
npm test
npm run typecheck
npm run build
```

No API keys are required for the default mock path.

## Project conventions

### TypeScript

- **API / Worker** (`src/*.ts`, exclude `src/web`): `tsconfig.json`, NodeNext modules, import with `.js` extensions in relative paths.
- **Web** (`src/web/**`): `tsconfig.web.json`, bundler resolution, React JSX.
- Prefer explicit types at API boundaries; Zod is available for validation where used.

### React UI

- Routes live only in `src/web/main.tsx`.
- Shells (`OrganizerShell`, `ReviewerShell`, `PortalShell`, `PublicShell`) own chrome and persona alignment.
- Primitives are local shadcn/Radix-style components in `src/web/components/ui.tsx` (CVA + Tailwind + `@radix-ui/react-slot`). There is no shadcn CLI codegen step.
- Use `toast()` / `Dialog` for feedback — never `window.alert` / `window.confirm`.
- Persona headers are set in `src/web/lib/api.ts` (`x-demo-role`, `x-demo-speaker`).

### Backend

- **Lifecycle** state (CFP, reviews, tasks, comms, resources): `src/lifecycle.ts` store + helpers.
- **Schedule** canonical grid: `src/schedule.ts` + `MemoryRepository` in `src/repository.ts`.
- **Do not weaken** hard conflict detection (room/speaker) or turn capacity warnings into silent success.
- **Accelevents**: keep mock default; never claim production API compatibility without a confirmed contract. Mapping version string is `accelevents-v1-placeholder` for a reason.
- Demo auth is header-based only. Do not pretend it is production security.

### Tests

Add or extend tests under `test/` with Node’s built-in runner:

```sh
npm test
```

Categories we care about:

1. Lifecycle correctness (quota, rounds, uploads, embeds, ICS, ownership)
2. Schedule engine (overlaps, conflicts, warnings, projection)
3. Canonical accept → schedule → publish → sync path
4. Sync create/skip/update/retry without leaking secrets

## Pull request checklist

- [ ] `npm test` passes  
- [ ] `npm run typecheck` passes  
- [ ] `npm run build` passes  
- [ ] New user-facing behavior has a route or API pointer in docs if it maps to a requirement  
- [ ] No credentials, tokens, or real PII  
- [ ] Accelevents / email / file / AI claims stay accurate (mock vs configured)  
- [ ] Schedule conflict semantics unchanged unless tests and docs are updated together  

## What we will reject

- Silent network calls in default demo mode  
- Auto-accept from AI assist  
- Destructive remote deletes in the “one-way sync” path  
- Embedding arbitrary HTML/scripts as resource “embeds”  
- Refactors that drop the six-minute walkthrough path without replacing it  

## Reporting issues

Include: Node version, `npm test` output, whether you used mock or `ACCELEVENTS_LIVE`, and the UI route or API path involved.

## License

By contributing, you agree your contributions are licensed under the MIT License (see [LICENSE](LICENSE)).
