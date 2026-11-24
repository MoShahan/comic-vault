# Setup & builds

## Requirements

- Node.js 22+
- Phone with [Expo Go](https://expo.dev/go)
- Same Wi‑Fi as your computer (for Expo Go)

## Clone & run

```bash
git clone <your-repo-url>
cd ComicReader
npm install
npm start
```

Scan the QR code with Expo Go. On Android, use the Expo Go app; on iOS, the Camera app works with Expo Go installed.

| Command                           | What it does                   |
| --------------------------------- | ------------------------------ |
| `npm start`                       | Start Expo dev server          |
| `npm run android` / `ios` / `web` | Platform shortcuts             |
| `npm test`                        | Unit tests                     |
| `npm run lint`                    | ESLint (includes import order) |
| `npm run lint:fix`                | ESLint with auto-fix           |
| `npm run typecheck`               | TypeScript check               |

---

## Production build (EAS)

Logged-in Expo account + [`eas.json`](../eas.json) profiles. Android-first (folder import):

```bash
npx eas-cli build --platform android --profile production
```

Preview APK for sideload: `--profile preview`. iOS: `--platform ios` (Apple credentials required).

---

## Website (GitHub Pages)

A static marketing site lives in [`website/`](../website/) (plain HTML, CSS, and JS). GitHub Pages branch deploy only supports `/` or `/docs`, so this repo publishes `website/` with a GitHub Action ([`.github/workflows/pages.yml`](../.github/workflows/pages.yml)).

1. Open the repo on GitHub → **Settings** → **Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Push to `main` (the workflow uploads the `website` folder)

The site will be available at [https://MoShahan.github.io/comic-vault/](https://MoShahan.github.io/comic-vault/). Preview locally by opening `website/index.html` in a browser or serving the `website` folder with any static file server.

---

## Testing & CI

```bash
npm test
npm run lint
npm run typecheck
```

GitHub Actions:

| Workflow                                                          | When                         | Checks                                                                 |
| ----------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| [Comic Vault - CI](../.github/workflows/ci.yml)                   | Push to `main`/`master`, PRs | ESLint, TypeScript (`tsc`), and Jest (parallel jobs)                   |
| [Comic Vault - Build](../.github/workflows/build.yml)             | Every push and PR            | `npm ci`, `expo-doctor`, package version check, Android `expo export` |
| [Comic Vault - GitHub Pages](../.github/workflows/pages.yml)      | Docs/site paths on `main`    | Deploys `website/` to GitHub Pages                                     |

The Build workflow catches install/lockfile and production-bundle failures that can still break EAS even when lint and tests pass. Any failed job fails the workflow.

**Pre-commit:** [Husky](https://typicode.github.io/husky/) runs [lint-staged](https://github.com/lint-staged/lint-staged) on `git commit`. Staged `.js` / `.jsx` / `.ts` / `.tsx` files are passed through `eslint --fix` (import order, groups, and other auto-fixable rules). Remaining lint errors block the commit. After `npm install`, the hook is installed via the `prepare` script.
