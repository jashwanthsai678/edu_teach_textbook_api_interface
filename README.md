# EduTeach Textbook Browser

A small, static, read-only front-end: pick Board / Grade / Subject, and see
whether a matching textbook has already been published by the EduTeach
pipeline. No backend of its own -- it calls the already-live serving API
(`https://eduteach-textbook-api.onrender.com`) directly from the browser.

## How it works

1. `index.html` renders the selector form (Grade, Subject, Board -- with a
   State sub-dropdown when Board is "SSC (State Board)", and a free-text
   field when Board is "Other (custom)").
2. On submit, `app.js` calls `GET /published/books` on the serving API and
   filters the result client-side for a board+grade+subject match.
3. If found: shows the book and links to `GET /published/books/{id}/chapters`.
4. If not: shows "not available yet" -- this is expected and correct for
   any board/state/subject combination that hasn't been ingested yet. Only
   Telangana SCERT content is published as of this writing, so most other
   selections will correctly report nothing found.

No Supabase credentials, no backend, no build step -- three static files.

## Local preview

Just open `index.html` in a browser, or serve the folder with any static
file server (e.g. `python -m http.server`).

## Deploying on Render (free tier)

1. Push this repo to GitHub.
2. In Render: **New +** -> **Static Site**.
3. Connect the repo. Leave build command empty, publish directory `.`
   (this is plain static HTML/CSS/JS, nothing to build).
4. Deploy. Render gives you a `https://<name>.onrender.com` URL.

## Dependency on the serving API

This depends on `eduteach-textbook-api` having CORS enabled for browser
fetches -- that was added to `main.py` in that repo (`CORSMiddleware`,
`allow_origins=["*"]`, since everything it serves is already public
read-only content). **That change needs to be pushed and redeployed on
Render for this browser to actually get data back** -- until then, every
lookup will fail with a CORS/network error in the browser console, not
because this front-end is broken, but because the API it calls doesn't
send the right headers yet.

## Known limitation

Board-name matching (`app.js`, `STATE_BOARD_ALIASES`) is a best-effort,
substring-based match against whatever string is stored in each book's
`board` field in Supabase -- board naming isn't fully standardized across
ingested books yet. Extend `STATE_BOARD_ALIASES` as more states/boards get
real published content.
