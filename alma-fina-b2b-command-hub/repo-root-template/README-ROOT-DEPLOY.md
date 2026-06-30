# Root-level Railway deploy wrapper

These files are meant to live at the **root of the GitHub repo** so Railway can deploy without needing the `Root Directory` UI field.

## What this wrapper does
- gives Railway a root `package.json`
- installs app dependencies from `alma-fina-b2b-command-hub/`
- starts the app from `alma-fina-b2b-command-hub/`
- provides a root `railway.json`
- provides a root `Dockerfile` fallback so deployment can work even if Railpack/root-directory detection is flaky

## Expected repo shape

```text
<repo-root>/
  package.json
  railway.json
  Dockerfile
  .dockerignore
  alma-fina-b2b-command-hub/
```

## Result
Once these root files are present in the GitHub repo, Railway can deploy directly from the repo root without requiring a visible `Root Directory` setting in the dashboard. If Railpack struggles, the Dockerfile path gives Railway a deterministic fallback.
