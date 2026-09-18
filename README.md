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
BACKUP_FORMAT.md      Binary archive backup contract
```

## Install and run

Requirements: a current Node.js release and npm (Node 20 or newer is recommended).

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To test on an iPhone, the phone must be able to reach the development computer over HTTPS or use a deployed preview; service workers and installation are restricted to secure contexts (localhost is allowed on the development computer).

## Local storage

`src/lib/database.ts` is the only module that knows IndexedDB details. Database `pantry-book`, schema version `3`, stores photo-free recipe documents in `recipes` and JPEG `Blob`s in `recipePhotos`. Each photo has a 1200px full image and a 256px thumbnail. The recipe list loads only metadata at startup; image blobs are fetched as cards approach the viewport.

The recipe store also contains indexes for modification date, tags, dish types, meal types, and normalized ingredient names. `ingredientNames` is derived from the ingredient objects and indexed with `multiEntry`, leaving room for more targeted ingredient queries later. During this early development phase, the version-3 upgrade recreates storage rather than carrying migration code.

## Backup and restore

Settings prepares a `.pantrybook` ZIP archive containing a JSON manifest and binary JPEG files, then enables a second explicit save action. That fresh click downloads `recipes-backup-YYYY-MM-DD.pantrybook` on desktop and opens the system share sheet on supported mobile devices.

Import validates the archive directory, manifest, recipes, expected image entries, and CRCs while writing into a separate staging database in small transactions. The staged library becomes active only after its recipe and photo counts are verified, so an interrupted restore leaves the current library untouched. Old JSON backups are intentionally unsupported. The format is documented in [BACKUP_FORMAT.md](./BACKUP_FORMAT.md).

## Local recipe webpage importer

The developer-only importer converts recipe webpage URLs into a Pantry Book backup. It uses schema.org Recipe JSON-LD first, falls back only to limited HTML metadata/itemprop fields, and does not add a backend or change the PWA.

```bash
# One recipe
pnpm recipe:import -- url "https://example.com/recipe" --out recipe-import-output

# One URL per nonblank line; # comments are allowed
pnpm recipe:import -- batch saved-recipe-urls.txt --out recipe-import-output

# Merge into an exported current backup before restoring it in the PWA
pnpm recipe:import -- batch saved-recipe-urls.txt --base-backup recipes-backup.pantrybook --out recipe-import-output
```

The output directory contains `pantry-book-import.pantrybook`, `review.md`, `report.json`, and raw JSON-LD artifacts for recipes needing review. The generated archive is validated against the same manifest and store-only ZIP rules used by PWA restore. **Restore replaces the whole collection**, so use `--base-backup` when adding to an existing library. Only current `.pantrybook` archives are accepted as base backups; legacy JSON backups are not supported.

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
