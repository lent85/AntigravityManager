# Feature Development Guide

This guide provides an end-to-end recipe for implementing or extending a feature in Antigravity Manager while adhering to the repository's strict architecture boundaries.

## 1. Feature Module Anatomy

All domain-specific code belongs under `src/modules/<feature-name>/`. A cohesive feature module typically contains the following directory layout:

```plaintext
src/modules/<feature-name>/
├── components/          # Feature-specific React UI components
│   └── MyFeatureView.tsx
├── hooks/               # React Query and local state hooks
│   └── useMyFeature.ts
├── ipc/                 # ORPC IPC definitions and handlers
│   ├── handler.ts       # Main-process implementation functions
│   └── router.ts        # Zod input/output schemas and ORPC router
├── persistence/         # Repositories, codecs, and data stores
│   └── my-feature-store.ts
├── services/            # Pure business logic and domain services
│   └── MyFeatureService.ts
└── types.ts             # Domain models and TypeScript contracts
```

### Boundary Rules

- **No Renderer Leaks**: Never import Electron main APIs, `better-sqlite3`, Node `fs`, or keyring modules in `components/` or `hooks/`.
- **No Shared Reverse Imports**: `src/shared/` must never import anything from `src/modules/<feature-name>/`.
- **Encapsulation**: Do not deep-import internal files from another feature module. If another module needs an interface, export a narrow public surface from the feature's entry.

---

## 2. Type-Safe IPC with ORPC

Antigravity Manager uses [oRPC](https://orpc.unnoq.com/) over Electron `MessagePort` for end-to-end type safety between the Electron main process and the React renderer.

### Step 2.1: Define Schemas and Router in `src/modules/<feature-name>/ipc/router.ts`

```typescript
import { os } from '@orpc/server';
import { z } from 'zod';
import { getFeatureData, updateFeatureStatus } from './handler';

export const MyFeatureInputSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
});

export const MyFeatureOutputSchema = z.object({
  id: z.string(),
  updatedAt: z.number(),
});

export const myFeatureRouter = os.router({
  getData: os
    .input(z.object({ id: z.string() }))
    .output(MyFeatureOutputSchema.nullable())
    .handler(async ({ input }) => {
      return getFeatureData(input.id);
    }),

  updateStatus: os
    .input(MyFeatureInputSchema)
    .output(MyFeatureOutputSchema)
    .handler(async ({ input }) => {
      return updateFeatureStatus(input.id, input.enabled);
    }),
});
```

### Step 2.2: Register in `src/ipc/router.ts`

Mount your feature router inside `src/ipc/router.ts`:

```typescript
import { myFeatureRouter } from '@/modules/my-feature/ipc/router';

export const router = os.use(logMiddleware).router({
  // ... existing modules
  myFeature: myFeatureRouter,
});
```

### Step 2.3: Consume in Renderer via `ipc.client`

In React components or custom hooks, invoke procedures directly through the typed client:

```typescript
import { ipc } from '@/ipc/manager';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useFeatureData(id: string) {
  return useQuery({
    queryKey: ['myFeature', id],
    queryFn: () => ipc.client.myFeature.getData({ id }),
  });
}

export function useUpdateFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; enabled: boolean }) =>
      ipc.client.myFeature.updateStatus(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myFeature'] });
    },
  });
}
```

---

## 3. UI, Routing, and Localization

### TanStack Router (`src/routes/`)

1. Create page routes in `src/routes/` (e.g. `src/routes/my-feature.tsx`).
2. **Never edit `src/routeTree.gen.ts` manually**. The Vite `@tanstack/router-plugin` automatically generates and updates this file during `npm start` or build.
3. Import feature views from `src/modules/<feature-name>/components/`.

### UI Primitives & Styling

- Use Radix UI primitives and Tailwind v4 utilities from `src/components/ui/`.
- Generic reusable layout widgets belong in `src/components/layout/` or `src/components/shared/`.
- Support both dark and light modes through semantic Tailwind classes (e.g., `bg-card`, `text-card-foreground`, `border-border`).

### Localization

User-visible copy must be translated in `src/localization/`:

- Add kebab-case keys to `src/localization/en.ts`, `src/localization/fr.ts`, and `src/localization/vi.ts`.
- Use the `useTranslation` hook in components: `const { t } = useTranslation(); return <div>{t('my-feature.title')}</div>;`.

---

## 4. Persistence and Credentials

- Shared database connection utilities live under `src/shared/persistence/database/`.
- Define feature-specific tables and queries in `src/modules/<feature-name>/persistence/`.
- Validate all rows read from SQLite using Zod or a dedicated codec before trusting the data in application logic.
- **Never store plaintext secrets or auth tokens in SQLite**. Use the OS keyring utilities (`src/modules/account/keyring.ts` or encrypted helpers).

---

## 5. Verification Checklist

Before considering a feature complete, run the following verification steps:

```powershell
# 1. Verify runtime boundaries and governance contracts
npm run check:governance

# 2. Check TypeScript types across main and renderer
npm run type-check

# 3. Run unit tests for your feature module
npm test -- src/modules/<feature-name>

# 4. Check formatting and linter
npm run lint
npm run format
```
