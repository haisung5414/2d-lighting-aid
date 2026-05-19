# Deployment Checklist

Use this checklist before pushing a release candidate to `main`.

## Local Verification

- Run `npm run build` and confirm it completes successfully.
- Open the app locally and confirm fixture creation works for:
  - Fixed Ellipsoidal
  - Zoom Ellipsoidal
  - Fresnel
  - PAR
- Save a JSON file, reload it, and confirm the scene is restored.
- Drag the brightness Probe and confirm the value updates.
- Enable shutters on an ellipsoidal or zoom fixture and confirm the Probe value drops to zero outside the shutter cut.
- Check `git status --short` and commit only intentional files.

## GitHub Pages Setup

- Push this repository to GitHub.
- In the repository settings, open `Settings > Pages`.
- Set `Build and deployment > Source` to `GitHub Actions`.
- Push to `main`, or run `Deploy to GitHub Pages` manually from the `Actions` tab.

## Expected Workflow

The workflow in `.github/workflows/deploy.yml` runs on each push to `main`.

It will:

- install dependencies with `npm ci`
- run `npm run build`
- upload `dist/` as the Pages artifact
- deploy the artifact to GitHub Pages

## Notes

`vite.config.ts` automatically uses the GitHub repository name as the Pages base path during GitHub Actions builds. Local development still uses `/`, so `npm run dev` continues to work normally.
