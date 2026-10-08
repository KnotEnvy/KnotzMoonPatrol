# GitHub Pages deployment

The repository is public and Pages uses GitHub Actions. The site target is:

https://knotenvy.github.io/KnotzMoonPatrol/

The project URL requires the `/KnotzMoonPatrol/` asset base. The `pages` Vite mode sets it; ordinary development keeps `/`. See [Vite's Pages guide](https://vite.dev/guide/static-deploy.html#github-pages).

## Local release check

Use Node 24 (recorded in `.nvmrc`).

```powershell
npm ci
npm run format:check
npm test
npm run build:pages
npm run test:pages
```

The last command starts and stops its own production-preview server on port 4173. It checks the repository subpath, favicon and bundled assets, absence of developer controls, launch/movement/fire, pause/resume, and the mobile layout. It runs the normal renderer selection and forced WebGL fallback. On Windows it uses installed Edge; on Linux it uses Playwright Chromium.

For manual inspection:

```powershell
npm run preview:pages
```

Open http://127.0.0.1:4173/KnotzMoonPatrol/. This is a local preview, not the hosted production server.

## Workflow

`.github/workflows/pages.yml` runs formatting, regression tests, the Pages build, and the production browser check on pull requests and pushes to `main`.

Only `main` push/manual runs upload `dist/` and deploy it to the existing `github-pages` environment. Pull requests validate without publishing. Deployment waits for validation to succeed. A final read-only job checks the hosted game at the URL returned by Pages. Official GitHub actions are pinned to commit SHAs, with their release versions recorded alongside them.

Pages is already configured to use Actions. The build has read access to Pages metadata; only the deployment job has Pages write/OIDC permissions. The source repository, docs, tests, and development hooks are not included in the site artifact. [GitHub's custom-workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) describes the artifact/environment requirements.

Do not commit `dist/` or create a separate generated `gh-pages` branch.

## Live check

With the site already deployed:

```powershell
$env:PAGES_URL = 'https://knotenvy.github.io/KnotzMoonPatrol/'
npm run test:pages
Remove-Item Env:PAGES_URL
```

This checks the live site and does not start a local server. Build/browser results are generated under ignored `test-results/`.

If the repository name or hosting path changes, update the Vite Pages base and production-test URL together. New public assets must be loaded through `import.meta.env.BASE_URL`, or imported from `src` so Vite can rewrite their URLs. Root-only `/worlds/...` links break project Pages hosting.
