# Push Alma Fina Command Hub to GitHub

## Recommendation
Push **only this folder** to a **private GitHub repo** first:
- `apps/alma-fina-b2b-command-hub`

Do **not** push the whole workspace yet.

## Why
- this app folder is already self-contained for deployment
- it already has `package.json`, `Procfile`, `.gitignore`, deploy docs, and auth example
- the wider workspace may contain unrelated files or sensitive material that should be reviewed before any full push

## On your laptop
Open a terminal inside the copied folder `alma-fina-b2b-command-hub` and run:

```bash
git init
git add .
git commit -m "Initial Alma Fina Command Hub"
git branch -M main
git remote add origin https://github.com/YOUR-USER/alma-fina-b2b-command-hub.git
git push -u origin main
```

## GitHub repo settings
- Visibility: **Private**
- Suggested repo name: `alma-fina-b2b-command-hub`

## If GitHub asks for auth
Either:
- sign in with GitHub Desktop, or
- use the GitHub CLI, or
- use a Personal Access Token when prompted by git

## After push
Deploy on Railway with:
- Root Directory: `.` if the repo contains only this app
- Start command: `npm start`
- Variables:
  - `AUTH_USERNAME`
  - `AUTH_PASSWORD`

## Alternative fallback
If you just want a backup first, keep this archive too:
- `exports/alma-fina-b2b-command-hub-pack-2026-04-23.zip`
