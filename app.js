const API_BASE = "https://eduteach-textbook-api.onrender.com";

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

function boardMatches(storedBoard, aliases) {
  const stored = (storedBoard || "").toLowerCase();
  return aliases.some((a) => a && (stored.includes(a) || a.includes(stored)));
}

function gradeNumber(label) {
  const m = label.match(/\d+/);
  return m ? m[0] : null;
}

function showResult(html, cls) {
  resultBox.hidden = false;
  resultBox.className = `result ${cls}`;
  resultBox.innerHTML = html;
}

// Shown on page load so a visitor isn't guessing blindly at the form --
// fetched live, not hardcoded, so it never goes stale as more books get published.
async function loadAvailableNow() {
  const box = document.getElementById("availableNow");
  const list = document.getElementById("availableList");
  box.hidden = false;
  box.className = "available loading";
  list.innerHTML = "<li>Loading current textbook list...</li>";

  try {
    const resp = await fetch(`${API_BASE}/published/books`);
    if (!resp.ok) throw new Error(`API returned ${resp.status}`);
    const books = await resp.json();

    if (books.length === 0) {
      box.className = "available";
      list.innerHTML = "<li>Nothing published yet.</li>";
      return;
    }

    box.className = "available";
    list.innerHTML = books
      .map((b) => `<li>${b.board}, Grade ${b.grade} &mdash; ${b.subject} (${b.chapter_count} chapter${b.chapter_count === 1 ? "" : "s"})</li>`)
      .join("");
  } catch (err) {
    box.className = "available error";
    list.innerHTML = `<li>Couldn't load the current list (${err.message}). You can still try the form below.</li>`;
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

  showResult("Looking this up... (the API may take up to 30s to wake up if it's been idle)", "loading");

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
      const chaptersUrl = `${API_BASE}/published/books/${match.book_id}/chapters`;
      showResult(
        `<strong>Found:</strong> ${match.subject}, Grade ${match.grade} (${match.board})<br>` +
        `${match.chapter_count} chapter(s) published.<br>` +
        `<a href="${chaptersUrl}" target="_blank" rel="noopener">View chapters &rarr;</a>`,
        "found"
      );
    } else {
      showResult(
        `No textbook found yet for <strong>${gradeLabel}, ${subject}, ${boardQuery.display}</strong>.<br>` +
        `This combination hasn't been processed and published yet.`,
        "notfound"
      );
    }
  } catch (err) {
    showResult(`Something went wrong reaching the textbook service: ${err.message}`, "error");
  }
});
