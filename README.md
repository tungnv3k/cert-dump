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
across warm serverless invocations in `api/_lib/db.js`.

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
connection string, then run `vercel dev` (via `npx vercel dev`) so both the
Vite frontend and the `/api` functions are served together. Running plain
`vite dev` alone will not serve `/api` routes.

## Scripts

- `pnpm dev` — Vite dev server (frontend only)
- `pnpm build` — production build
- `pnpm lint` — ESLint
