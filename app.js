const API_BASE = "https://eduteach-textbook-api.onrender.com";
const INGEST_API_BASE = "https://eduteach-ingest-service.onrender.com";
// Only one school exists in Supabase right now ("Admin Test School") --
// hardcoded until a real school-selection/auth flow exists.
const SCHOOL_ID = "04b5b4aa-37cc-4790-955e-e995da9b80c7";
const POLL_INTERVAL_MS = 8000;

const boardSelect = document.getElementById("board");
const stateField = document.getElementById("stateField");
const stateSelect = document.getElementById("state");
const customBoardField = document.getElementById("customBoardField");
const customBoardInput = document.getElementById("customBoard");
const form = document.getElementById("selectorForm");
const resultBox = document.getElementById("result");

// Board display name -> possible strings the stored `board` field might
// actually contain. Only Telangana SCERT content is published so far, but
// this stays extensible as more boards/states get added. Matching is
// substring-based, case-insensitive, checked both directions, since the
// underlying board naming isn't fully standardized yet across ingested books.
const STATE_BOARD_ALIASES = {
  "Telangana": ["ts scert", "telangana"],
  "Andhra Pradesh": ["ap scert", "andhra pradesh", "ap "],
  "Karnataka": ["karnataka"],
  "Tamil Nadu": ["tamil nadu", "tn scert"],
  "Maharashtra": ["maharashtra"],
};

boardSelect.addEventListener("change", () => {
  const val = boardSelect.value;
  stateField.hidden = val !== "SSC (State Board)";
  customBoardField.hidden = val !== "__other__";
});

function resolveBoardQuery() {
  const board = boardSelect.value;
  if (board === "__other__") {
    return { display: customBoardInput.value.trim(), aliases: [customBoardInput.value.trim().toLowerCase()] };
  }
  if (board === "SSC (State Board)") {
    const state = stateSelect.value;
    const aliases = STATE_BOARD_ALIASES[state] || [state.toLowerCase()];
    return { display: `SSC (State Board) - ${state}`, aliases };
  }
  // CBSE / ICSE
  return { display: board, aliases: [board.toLowerCase()] };
}

// Opposite direction from STATE_BOARD_ALIASES: what board string to actually
// SEND when uploading a new book, so newly-published books use the same
// naming convention as the existing ones (e.g. "TS SCERT").
const STATE_TO_BOARD_STRING = {
  "Telangana": "TS SCERT",
  "Andhra Pradesh": "AP SCERT",
  "Karnataka": "Karnataka SCERT",
  "Tamil Nadu": "TN SCERT",
  "Maharashtra": "Maharashtra SCERT",
};

function resolveBoardForUpload() {
  const board = boardSelect.value;
  if (board === "__other__") return customBoardInput.value.trim();
  if (board === "SSC (State Board)") return STATE_TO_BOARD_STRING[stateSelect.value] || `${stateSelect.value} SCERT`;
  return board; // CBSE / ICSE
}

function boardMatches(storedBoard, aliases) {
  const stored = (storedBoard || "").toLowerCase();
  return aliases.some((a) => a && (stored.includes(a) || a.includes(stored)));
}

function gradeNumber(label) {
  const m = label.match(/\d+/);
  return m ? m[0] : null;
}

const uploadSection = document.getElementById("uploadSection");
const uploadBtn = document.getElementById("uploadBtn");
const pdfFileInput = document.getElementById("pdfFile");

// Set right before showing a "notfound" result, so the upload handler
// knows what metadata to publish the new book under.
let pendingUpload = null;

function showResult(html, cls) {
  resultBox.hidden = false;
  resultBox.className = `result ${cls}`;
  resultBox.innerHTML = html;
  if (cls !== "notfound") uploadSection.hidden = true;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Full unfiltered list from the last successful fetch -- filtering (below)
// works off this in memory rather than re-fetching per filter change.
let allBooks = [];

const filterToggle = document.getElementById("filterToggle");
const filterBar = document.getElementById("filterBar");
const filterBoard = document.getElementById("filterBoard");
const filterGrade = document.getElementById("filterGrade");
const filterSubject = document.getElementById("filterSubject");
const filterStatus = document.getElementById("filterStatus");

filterToggle.addEventListener("click", () => {
  const willShow = filterBar.hidden;
  filterBar.hidden = !willShow;
  filterToggle.classList.toggle("active", willShow);
  filterToggle.setAttribute("aria-expanded", String(willShow));
});

// Rebuilds each dropdown's option list from whatever boards/grades/subjects
// actually appear in the current data -- never hardcoded, so it can't drift
// out of sync as new boards or grades get published.
function populateFilterOptions(books) {
  const fill = (select, values) => {
    const current = select.value;
    const placeholder = select.querySelector("option[value='']");
    select.innerHTML = "";
    if (placeholder) select.appendChild(placeholder);
    [...new Set(values)].sort().forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
    if ([...select.options].some((o) => o.value === current)) select.value = current;
  };
  fill(filterBoard, books.map((b) => b.board));
  fill(filterGrade, books.map((b) => String(b.grade)));
  fill(filterSubject, books.map((b) => b.subject));
}

function bookStatus(b) {
  const total = b.total_chapters ?? b.chapter_count ?? 0;
  const published = b.chapters_published ?? total;
  return { total, published, complete: published >= total && total > 0 };
}

function applyFilters(books) {
  return books.filter((b) => {
    if (filterBoard.value && b.board !== filterBoard.value) return false;
    if (filterGrade.value && String(b.grade) !== filterGrade.value) return false;
    if (filterSubject.value && b.subject !== filterSubject.value) return false;
    if (filterStatus.value) {
      const { complete } = bookStatus(b);
      if (filterStatus.value === "complete" && !complete) return false;
      if (filterStatus.value === "partial" && complete) return false;
    }
    return true;
  });
}

function renderBooks(books) {
  const box = document.getElementById("availableNow");
  if (books.length === 0) {
    box.className = "library-list empty-filtered";
    box.innerHTML = "No books match these filters.";
    return;
  }
  box.className = "library-list";
  box.innerHTML = books.map((b) => {
    const { total, published, complete } = bookStatus(b);
    const chaptersUrl = `${API_BASE}/published/books/${b.book_id}/chapters`;
    const chapter1Url = `${chaptersUrl}/1`;
    const statusHtml = complete
      ? `<span class="status-pill complete">Complete &middot; ${published} ch.</span>`
      : `<span class="status-pill partial">In progress &middot; ${published}/${total} ch.</span>`;
    return `
      <div class="book-card">
        <div class="book-card-top">
          <div>
            <div class="book-title">${escapeHtml(b.subject)}, ${escapeHtml(b.board)} &mdash; Grade ${escapeHtml(b.grade)}</div>
            <div class="book-meta mono">${escapeHtml(b.book_id)}</div>
          </div>
          ${statusHtml}
        </div>
        <div class="book-links">
          <a href="${chaptersUrl}" target="_blank" rel="noopener">Chapters list &rarr;</a>
          <a href="${chapter1Url}" target="_blank" rel="noopener">Example: chapter 1 &rarr;</a>
        </div>
      </div>`;
  }).join("");
}

[filterBoard, filterGrade, filterSubject, filterStatus].forEach((el) =>
  el.addEventListener("change", () => renderBooks(applyFilters(allBooks)))
);

// Shown on page load so a visitor isn't guessing blindly at the form --
// fetched live, not hardcoded, so it never goes stale as more books get published.
// total_chapters/chapters_published are reported separately by the API: a book
// that's still mid-ingestion (or was stopped partway through) genuinely has
// fewer real chapters than the total detected in its PDF, and this is shown
// honestly rather than presented as if the book were already complete.
async function loadAvailableNow() {
  const box = document.getElementById("availableNow");
  box.hidden = false;
  box.className = "library-list loading";
  box.innerHTML = "Loading current textbook list&hellip;";

  try {
    const resp = await fetch(`${API_BASE}/published/books`);
    if (!resp.ok) throw new Error(`API returned ${resp.status}`);
    allBooks = await resp.json();

    if (allBooks.length === 0) {
      box.className = "library-list";
      box.innerHTML = `<div class="book-card">Nothing published yet.</div>`;
      filterToggle.hidden = true;
      return;
    }

    filterToggle.hidden = false;
    populateFilterOptions(allBooks);
    renderBooks(applyFilters(allBooks));
  } catch (err) {
    box.className = "library-list error";
    box.innerHTML = `Couldn't load the current list (${escapeHtml(err.message)}). You can still try the form.`;
  }
}

loadAvailableNow();

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const gradeLabel = document.getElementById("grade").value;
  const subject = document.getElementById("subject").value;
  const boardQuery = resolveBoardQuery();

  if (boardSelect.value === "SSC (State Board)" && !stateSelect.value) {
    showResult("Please select a state.", "error");
    return;
  }
  if (boardSelect.value === "__other__" && !customBoardInput.value.trim()) {
    showResult("Please enter a board name.", "error");
    return;
  }

  showResult("Looking this up&hellip; (the API may take up to 30s to wake up if it's been idle)", "loading");

  try {
    const resp = await fetch(`${API_BASE}/published/books`);
    if (!resp.ok) throw new Error(`API returned ${resp.status}`);
    const books = await resp.json();

    const grade = gradeNumber(gradeLabel);
    const match = books.find((b) =>
      String(b.grade) === String(grade) &&
      (b.subject || "").toLowerCase() === subject.toLowerCase() &&
      boardMatches(b.board, boardQuery.aliases)
    );

    if (match) {
      const total = match.total_chapters ?? match.chapter_count ?? 0;
      const published = match.chapters_published ?? total;
      const chaptersUrl = `${API_BASE}/published/books/${match.book_id}/chapters`;
      const statusLine = published >= total && total > 0
        ? `${published} chapter(s) published.`
        : `${published} of ${total} chapter(s) published so far &mdash; still being processed.`;
      showResult(
        `<strong>Found:</strong> ${escapeHtml(match.subject)}, Grade ${escapeHtml(match.grade)} (${escapeHtml(match.board)})<br>` +
        `${statusLine}<br>` +
        `<a href="${chaptersUrl}" target="_blank" rel="noopener">View chapters &rarr;</a>`,
        "found"
      );
    } else {
      showResult(
        `No textbook found yet for <strong>${escapeHtml(gradeLabel)}, ${escapeHtml(subject)}, ${escapeHtml(boardQuery.display)}</strong>.<br>` +
        `This combination hasn't been processed and published yet.`,
        "notfound"
      );
      pendingUpload = { grade, subject, board: resolveBoardForUpload() };
      uploadSection.hidden = false;
    }
  } catch (err) {
    showResult(`Something went wrong reaching the textbook service: ${err.message}`, "error");
  }
});

async function pollJob(jobId) {
  while (true) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let job;
    try {
      const resp = await fetch(`${INGEST_API_BASE}/jobs/${jobId}`);
      if (!resp.ok) throw new Error(`status check returned ${resp.status}`);
      job = await resp.json();
    } catch (err) {
      showResult(`Lost track of the job while processing (${err.message}). It may still be running -- try again in a few minutes.`, "error");
      return;
    }

    if (job.status === "done") {
      const chaptersUrl = `${API_BASE}/published/books/${job.book_id}/chapters`;
      showResult(
        `<strong>Done!</strong> Published ${job.chapter_count} chapter(s).<br>` +
        `<a href="${chaptersUrl}" target="_blank" rel="noopener">View chapters &rarr;</a>`,
        "found"
      );
      loadAvailableNow();
      return;
    }
    if (job.status === "failed") {
      const savedNote = job.chapter_count ? ` ${job.chapter_count} chapter(s) had already been published before this happened -- they're safe.` : "";
      showResult(`Processing failed: ${job.reason || "unknown error"}.${savedNote}`, "error");
      loadAvailableNow();
      return;
    }
    showResult(`Processing&hellip; (${job.stage || "starting"}${job.detail ? " -- " + job.detail : ""})<br>This can take up to ~20 minutes for a full book.`, "loading");
  }
}

uploadBtn.addEventListener("click", async () => {
  const file = pdfFileInput.files[0];
  if (!file) {
    showResult("Please choose a PDF file first.", "error");
    return;
  }
  if (!pendingUpload) return;

  uploadBtn.disabled = true;
  showResult("Uploading&hellip; (the ingest service may take up to 30s to wake up if it's been idle)", "loading");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("board", pendingUpload.board);
  formData.append("grade", pendingUpload.grade);
  formData.append("subject", pendingUpload.subject);
  formData.append("language", "en");
  formData.append("school_id", SCHOOL_ID);

  try {
    const resp = await fetch(`${INGEST_API_BASE}/jobs`, { method: "POST", body: formData });
    if (!resp.ok) throw new Error(`upload returned ${resp.status}`);
    const { job_id } = await resp.json();
    showResult("Upload received, processing started&hellip;", "loading");
    await pollJob(job_id);
  } catch (err) {
    showResult(`Upload failed: ${err.message}`, "error");
  } finally {
    uploadBtn.disabled = false;
  }
});
