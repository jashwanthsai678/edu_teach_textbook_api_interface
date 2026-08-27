# EduTeach Textbook Browser

The "Find a textbook" site: pick Board / Grade / Subject, see whether a
matching textbook is already published, browse the Library, upload a new
PDF if it isn't there yet, or delete a book. A static site with no backend
of its own -- everything it does is a call to one of the other two repos'
HTTP APIs.

## How the three repos fit together

```
                 uploads a PDF, polls job status
edu_teach_textbook_api_interface  ─────────────────►  eduteach-ingest-service
   (this repo)                                                │
         │                                                    │ writes books / chapters / images
         │ reads published content                            ▼
         └──────────────────────────────────────►         Supabase
                                                        (Postgres + Storage)
                                                                ▲
                                                                │ reads published content
                                                      eduteach-textbook-api
                                                    (read-only REST API)
```

This repo never touches Supabase directly -- no database credentials live
here at all. `app.js` talks to two base URLs, both hardcoded at the top of
the file:

- `INGEST_API_BASE` -> **`eduteach-ingest-service`** ([repo](https://github.com/jashwanthsai678/eduteach_ingest_service)) -- for `POST /jobs` (upload a PDF), `GET /jobs/{id}` (poll progress), and `DELETE /books/{book_id}` (delete a book).
- `API_BASE` -> **`eduteach-textbook-api`** ([repo](https://github.com/jashwanthsai678/eduteach-textbook-api)) -- for `GET /published/books` and `GET /published/books/{id}/chapters` (everything the Library list and lookup form show).

## How it works

1. `index.html` renders the selector form (Grade, Subject, Board -- with a
   State sub-dropdown when Board is "SSC (State Board)", and a free-text
   field with autocomplete + typo-tolerant "Did you mean...?" suggestions
   when Board is "Other").
2. On submit, `app.js` calls `GET /published/books` on `eduteach-textbook-api`
   and matches client-side against grade + subject + board (with fuzzy
   matching for a custom-typed board name).
3. If found: shows the book and a link to its chapters.
4. If not found: shows an upload box. Uploading calls `POST /jobs` on
   `eduteach-ingest-service` with the PDF plus board/grade/subject/language,
   then polls `GET /jobs/{id}` every few seconds until it's `done` or
   `failed`, showing live progress.
5. The Library panel lists every published book (collapsed to 4 by default,
   with a show-all toggle), with filter dropdowns and a per-book Delete
   button that opens a password-gated confirmation modal calling
   `eduteach-ingest-service`'s `DELETE /books/{book_id}`.
6. A "For developers & AI agents" section documents the read API directly
   on the page, plus `llms.txt` at the site root for agents/crawlers
   specifically.

No Supabase credentials, no backend, no build step -- static files only.

## What this repo depends on from the other two APIs

Since this repo has no database access, it only knows the schema through
the *response shape* of the two APIs it calls. If either API's response
fields change, these are the exact places in `app.js` that need updating
to match -- see `eduteach-ingest-service`'s and `eduteach-textbook-api`'s
READMEs for the underlying database schema those responses come from.

**From `eduteach-textbook-api`'s `GET /published/books`:** `book_id`,
`board`, `grade`, `subject`, `total_chapters`, `chapters_published` (used
by `bookStatus()` to compute the Complete/In-progress pill and by the
board/grade/subject filter dropdowns).

**From `GET /published/books/{id}/chapters/{n}`:** not fetched by this repo
directly today -- only linked to (opened in a new tab). If that ever
changes, the fields to know about are `content`, and each `images[]`
entry's `image_id`/`caption`/`url`/`usage`.

**From `eduteach-ingest-service`'s `POST /jobs`:** `job_id`. **From
`GET /jobs/{id}`:** `status`, `stage`, `detail`, `book_id`, `chapter_count`,
`reason`. **From `DELETE /books/{book_id}`:** just the HTTP status code
(`403` = wrong password, anything else non-2xx = shown as a generic
failure).

## Local preview

Just open `index.html` in a browser, or serve the folder with any static
file server (e.g. `python -m http.server`).

## Deploying on Render (free tier)

1. Push this repo to GitHub.
2. In Render: **New +** -> **Static Site**.
3. Connect the repo. Leave build command empty, publish directory `.`
   (this is plain static HTML/CSS/JS, nothing to build).
4. Deploy. Render gives you a `https://<name>.onrender.com` URL.

## Dependency on CORS in the other two repos

Both `eduteach-textbook-api` and `eduteach-ingest-service` need
`CORSMiddleware` with `allow_origins=["*"]` (and, for the ingest service,
`allow_methods` including `DELETE`) for this browser page to actually get
data back -- without it, every request fails with a CORS error in the
browser console, not because this front-end is broken, but because the API
it's calling doesn't send the right headers.

## Known limitation

Board-name matching (`app.js`, `STATE_BOARD_ALIASES`) is a best-effort,
substring-based match against whatever string is stored in each book's
`board` field in Supabase -- board naming isn't fully standardized across
ingested books yet. Extend `STATE_BOARD_ALIASES` as more states/boards get
real published content.
