# Saleem

Saleem is a refugee-support web and Android WebView application for people navigating daily life in Egypt. It combines Egyptian Arabic learning tools, a multilingual AI assistant, community Q&A, and a source-backed services directory.

The project is intentionally in-place: the existing Express/SQLite web app, Vercel deployment flow, and Android package identity are preserved.

## Architecture

- `server/`: Express API, SQLite persistence via `better-sqlite3`, JWT auth, rate limiting, AI/TTS proxy routes, resources, lessons, community, analytics, and admin APIs.
- `app.html`, `app.js`, `styles.css`: Vanilla web application served by Express and Vercel.
- `app/`: Existing Android app module, package `com.saleem.app`, wrapping the deployed web app in a hardened WebView.
- `tests/`: Node test-runner integration tests for core database/API flows.

## Data Policy

Saleem must not present invented people, reviews, institutions, statistics, or partnerships as real.

The public resources API hides demo records by default and currently exposes source-backed records for:

- UNHCR Egypt Reception Centre: `https://help.unhcr.org/egypt/en/contacts/`
- St. Andrew's Refugee Services: `https://stars-egypt.org/`
- Caritas Egypt refugee support: `https://caritas-egypt.org/en/immigrants/`

Each verified resource includes `source_name`, `source_url`, `source_checked_at`, and `trust_note`. Community posts and reviews marked as sample/demo data are filtered from public feeds.

## Environment

Copy `.env.example` to `.env` for local development. Important variables:

- `JWT_SECRET`: required in production.
- `DATABASE_PATH`: SQLite database path, defaults to `./data/saleem.db`.
- `CORS_ORIGIN`: set to the production origin in deployment.
- `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, or `OPENROUTER_API_KEY`: optional server-side AI providers.
- `ELEVENLABS_API_KEY`: optional server-side text-to-speech provider.

Never place API keys in client files or `vercel.json`. Configure production secrets in Vercel environment variables.

## Development

```bash
npm install
npm start
```

Open:

- Web app: `http://localhost:3000/app`
- Landing page: `http://localhost:3000/`

## Testing

```bash
npm test
```

On Windows PowerShell, use `npm.cmd test` if script execution policy blocks `npm.ps1`.

## Android

The existing Android app lives in `app/` and keeps:

- Application ID: `com.saleem.app`
- Version: `1.0.0`
- minSdk: `28`
- targetSdk: `34`

Build with an installed JDK and Gradle/Android tooling:

```bash
gradle :app:assembleDebug
```

This repository currently does not include a Gradle wrapper. Add one or install Gradle/JDK locally before building APKs.

## Deployment

The existing Vercel project should deploy from the connected GitHub repository:

`https://github.com/saleem19982003-cmd/Saleem`

Do not create a new repository or a second Vercel project. Push changes to the existing repository and let the configured Vercel Git integration deploy them.

## Security Notes

- AI and TTS provider keys stay server-side.
- Production requires `JWT_SECRET`.
- Public resource responses exclude demo data by default.
- Android WebView disallows mixed content and file/content access, and grants only microphone capture when requested.
