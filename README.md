# Hydro Journal

Personal hydroponics lab journal hosted on GitHub Pages.

## Features

- Browse experiments and diary entries with photos, notes, and measurements
- Submit new entries directly from the browser (commits via GitHub API)
- PWA — installable on Android and works offline
- Client-side image compression (~200KB per photo)
- Measurement tracking: pH, EC, water temperature

## Setup

1. Push this repo to GitHub
2. Settings > Pages > Source: Deploy from branch `main`, folder `/docs`
3. Create a fine-grained PAT: Settings > Developer settings > Fine-grained tokens > select this repo > Contents: Read and Write
4. Open the app's Settings page and enter your PAT

## Structure

- `docs/` — GitHub Pages site (browsing + submission PWA)
- `data/` — experiment metadata and diary entries (JSON)
- `images/` — compressed photos committed via the API
