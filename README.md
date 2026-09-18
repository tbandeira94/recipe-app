# Pantry Book

Pantry Book is a local-first recipe management PWA designed for iPhone Safari. It has no server, account, analytics, or external database: recipes stay in IndexedDB on the device. The production output is a static site suitable for GitHub Pages or another static host.

## Technology stack

- **React + TypeScript** provides small, understandable UI components and compile-time checks.
- **Vite** supplies a fast development server and a simple static production build.
- **Native IndexedDB** stores recipes. The app uses a small typed storage module instead of a database dependency so the persistence behavior stays visible and teachable.
- **A custom service worker + web manifest** provide offline caching, installation metadata, and an explicit update prompt.
- **Plain CSS** keeps the mobile-first design easy to customize without a component framework.

The app uses hash-free in-memory navigation because all screens live in one application shell. Vite's relative `base` and relative manifest/service-worker URLs make the build compatible with a GitHub Pages project subdirectory.

## Project structure

```text
src/
  components/       Shared navigation, icons, and recipe cards
  lib/              IndexedDB, backup, normalization, and search logic
  pages/            Library, combined search, form, details, and settings screens
  App.tsx            Screen state and data refresh coordination
  types.ts           Recipe and backup data types
  styles.css         Mobile-first design system and layouts
public/
  icons/             PWA and Apple Home Screen icons
  manifest.webmanifest
  sw.js              Offline cache and update lifecycle
scripts/
  generate_icons.py  Rebuilds PNG icons (requires Pillow)
BACKUP_FORMAT.md      Stable JSON backup contract
```

## Install and run

Requirements: a current Node.js release and npm (Node 20 or newer is recommended).

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To test on an iPhone, the phone must be able to reach the development computer over HTTPS or use a deployed preview; service workers and installation are restricted to secure contexts (localhost is allowed on the development computer).

## Local storage

`src/lib/database.ts` is the only module that knows IndexedDB details. Database `pantry-book`, schema version `2`, contains a `recipes` object store keyed by recipe ID. Each recipe is stored as one document, including structured ingredients, dish types, meal occasions, tags, and favorite status. This fits IndexedDB better than simulating relational tables and makes an entire recipe atomic to save and export.

The store also contains indexes for modification date, tags, dish types, meal types, and normalized ingredient names. `ingredientNames` is derived from the ingredient objects and indexed with `multiEntry`, leaving room for more targeted ingredient queries later. During this early development phase, the version-2 upgrade recreates the recipe store rather than carrying migration code.

## Backup and restore

Settings can export all recipes as formatted, human-readable JSON. On devices supporting file sharing through the Web Share API—including modern iOS Safari—the app opens the system share sheet. Other browsers download `recipes-backup-YYYY-MM-DD.json`.

Import parses and validates the complete file, format identifier, version, timestamps, recipes, and duplicate IDs before asking for confirmation. Only then does it clear and replace the recipe store in one read/write transaction. A failed transaction is rolled back by IndexedDB. The format is documented in [BACKUP_FORMAT.md](./BACKUP_FORMAT.md).

## Quality checks and production build

```bash
npm run typecheck
npm run lint
npm run build
npm run preview
```

`npm run build` writes the static application to `dist/`. Test the production build—not just the development server—when checking offline behavior, because service-worker registration is intentionally production-only.

## Deploy to GitHub Pages

1. Build with `npm run build`.
2. Publish the contents of `dist/` with a GitHub Actions Pages workflow or a deployment branch.
3. Serve it over HTTPS.
4. Open the deployed URL once online, then use Safari’s **Share → Add to Home Screen**.

No backend configuration or environment variables are required. A future deployment workflow can automate the build and Pages upload.

## iPhone and Safari notes

- IndexedDB is durable browser storage, but it is not a backup. Removing the Home Screen app, clearing website data, or some device-storage cleanup scenarios can remove local data. Export backups regularly.
- Private Browsing storage is temporary and should not be used for a permanent recipe collection.
- Home Screen installation must be initiated manually from Safari’s Share menu.
- Open the app online after a new deployment so the service worker can cache the current application files. When an update finishes downloading, the app shows an update banner rather than interrupting an active edit.
- The iOS share sheet is used for backups when supported. If file sharing is unavailable, Safari falls back to a normal file download.
- Data is local to the specific browser/origin. The same site opened under a different domain, subdomain, or browser has a separate database.
