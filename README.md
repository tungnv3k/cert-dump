# Quiz Studio

Import CSV/JSON question banks, combine them into quizzes, and practice in
learning or test mode. Built with React + Vite on the frontend and a
MongoDB-backed API (Mongoose) under `api/`, deployed together on Vercel.

## How data is stored

All question banks and quizzes are saved in MongoDB — nothing is kept in
browser storage. The frontend talks to serverless functions under `/api`:

- `GET/POST /api/banks`, `DELETE /api/banks/:id`
- `GET/POST /api/quizzes`, `DELETE /api/quizzes/:id`

Mongoose models live in `api/_lib/models.js`; the connection is cached
across warm serverless invocations in `api/_lib/db.js`. The first time that
connection is established (once per cold start), `api/_lib/seed-data.js`
checks each collection and creates a couple of `[MOCK]`-prefixed question
banks and a combined quiz if they're missing — so a fresh database has
something to look at without anyone running a script. It's idempotent
(checked by title before inserting), so it's safe on every deploy.

## MongoDB setup on Vercel

1. Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/atlas)
   (or use any reachable MongoDB instance) and grab its connection string
   (Database → Connect → Drivers).
2. In your Vercel project, go to **Settings → Environment Variables** and
   add a variable named:

   ```
   MONGODB_URI
   ```

   with your connection string as the value, e.g.
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/cert-dump?retryWrites=true&w=majority`.
   Add it for Production, Preview, and Development.
3. Redeploy. The API functions read `process.env.MONGODB_URI` on each
   request.

For local development, copy `.env.example` to `.env` and fill in your own
connection string, then run the API server and the UI dev server in two
terminals:

```bash
pnpm run dev:api   # vercel dev, serves /api on http://localhost:3001
pnpm dev           # vite, serves the UI and proxies /api to :3001
```

Start `dev:api` first so the proxy has something to talk to. Running plain
`pnpm dev` on its own will not serve `/api` routes.

## Verifying the connection / mock data

Once `MONGODB_URI` is set and the app is deployed (or run locally with
`pnpm run dev:api` + `pnpm dev`), just open it — the `[MOCK]` question banks
and quiz appear automatically on first connection, which confirms the
database is reachable and writable without running anything by hand.

`pnpm run seed:test` triggers the same check manually (useful if you want to
confirm connectivity from the command line) and prints the resulting
document counts. `pnpm run seed:test:clean` removes the `[MOCK]`-prefixed
documents again:
```bash
MONGODB_URI="mongodb+srv://..." pnpm run seed:test
MONGODB_URI="mongodb+srv://..." pnpm run seed:test:clean
```

## Mobile debugging (Eruda)

Setting `VITE_ENABLE_DEVTOOLS=true` at build time bundles
[Eruda](https://github.com/liriliri/eruda), an on-page devtools console, and
initializes it on load. It shows as a small floating button in the corner of
the screen — tap it to expand a console/network/elements panel, same idea as
Nuxt DevTools. Useful for debugging on a phone where you can't attach normal
browser devtools.

This is a Vite client env var, so it's baked into the JS bundle at build
time, not read at runtime — set it in Vercel's Environment Variables (for
whichever of Production/Preview/Development you want it in) and redeploy, or
export it before running `pnpm build` / `pnpm dev` locally. Leave it unset
for a normal deploy; Eruda is only fetched (as a separate chunk) when the
flag is on.

## Scripts

- `pnpm dev` — Vite dev server (frontend only, proxies `/api` to `:3001`)
- `pnpm run dev:api` — `vercel dev` on port 3001, serves the `/api`
  serverless functions locally
- `pnpm build` — production build
- `pnpm lint` — ESLint
- `pnpm run seed:test` / `pnpm run seed:test:clean` — manually trigger/remove
  the mock data seed (see above; it also runs automatically on first connect)
