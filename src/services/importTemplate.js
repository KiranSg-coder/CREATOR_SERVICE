/**
 * Canonical flat-row import schema + sample curriculum for CSV / XLSX templates.
 * One row = one slot. Multiple rows with the same dayNumber form a day.
 */

const IMPORT_COLUMNS = [
  "dayNumber",
  "dayTitle",
  "dayNotes",
  "slotType",
  "slotTitle",
  "slotDescription",
  "estimatedMinutes",
  "sortOrder",
  "topicId",
  "contentId",
  "contentFileUuid",
  "externalUrl",
];

/**
 * 7-day SDE interview prep sample.
 * Shows how to fill externalUrl with LeetCode links.
 * topicId / contentId / contentFileUuid are left blank on purpose — see FieldGuide.
 */
const SAMPLE_ROWS = [
  // Day 1 — Arrays
  {
    dayNumber: 1,
    dayTitle: "Arrays — fundamentals",
    dayNotes: "Warm up with classic array patterns. Solve Easy → Medium.",
    slotType: "THEORY",
    slotTitle: "Array patterns overview",
    slotDescription:
      "Review two-pointers, sliding window, and prefix sums. Take short notes before coding.",
    estimatedMinutes: 25,
    sortOrder: 0,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "https://leetcode.com/explore/learn/card/array-and-string/",
  },
  {
    dayNumber: 1,
    dayTitle: "Arrays — fundamentals",
    dayNotes: "Warm up with classic array patterns. Solve Easy → Medium.",
    slotType: "PRACTICE",
    slotTitle: "Two Sum (Easy)",
    slotDescription:
      "DSA: Hash map approach. Write brute force first, then O(n). Record time & space.",
    estimatedMinutes: 30,
    sortOrder: 1,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "https://leetcode.com/problems/two-sum/",
  },
  {
    dayNumber: 1,
    dayTitle: "Arrays — fundamentals",
    dayNotes: "Warm up with classic array patterns. Solve Easy → Medium.",
    slotType: "PRACTICE",
    slotTitle: "Best Time to Buy and Sell Stock (Easy)",
    slotDescription: "DSA: Track running minimum. One pass O(n).",
    estimatedMinutes: 25,
    sortOrder: 2,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "https://leetcode.com/problems/best-time-to-buy-and-sell-stock/",
  },

  // Day 2 — Strings / hashing
  {
    dayNumber: 2,
    dayTitle: "Strings & hashing",
    dayNotes: "Focus on frequency maps and anagrams.",
    slotType: "THEORY",
    slotTitle: "Hash map cheat-sheet",
    slotDescription: "When to use Map vs Set. Collision basics (optional reading).",
    estimatedMinutes: 20,
    sortOrder: 0,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "",
  },
  {
    dayNumber: 2,
    dayTitle: "Strings & hashing",
    dayNotes: "Focus on frequency maps and anagrams.",
    slotType: "PRACTICE",
    slotTitle: "Valid Anagram (Easy)",
    slotDescription: "DSA: Count characters; compare frequency maps.",
    estimatedMinutes: 20,
    sortOrder: 1,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "https://leetcode.com/problems/valid-anagram/",
  },
  {
    dayNumber: 2,
    dayTitle: "Strings & hashing",
    dayNotes: "Focus on frequency maps and anagrams.",
    slotType: "PRACTICE",
    slotTitle: "Group Anagrams (Medium)",
    slotDescription: "DSA: Key by sorted string or count tuple. Aim for clean code.",
    estimatedMinutes: 40,
    sortOrder: 2,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "https://leetcode.com/problems/group-anagrams/",
  },

  // Day 3 — Two pointers / sliding window
  {
    dayNumber: 3,
    dayTitle: "Two pointers & sliding window",
    dayNotes: "Core interview patterns for arrays/strings.",
    slotType: "PRACTICE",
    slotTitle: "Container With Most Water (Medium)",
    slotDescription: "DSA: Two pointers from both ends; move the shorter height.",
    estimatedMinutes: 35,
    sortOrder: 0,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "https://leetcode.com/problems/container-with-most-water/",
  },
  {
    dayNumber: 3,
    dayTitle: "Two pointers & sliding window",
    dayNotes: "Core interview patterns for arrays/strings.",
    slotType: "PRACTICE",
    slotTitle: "Longest Substring Without Repeating Characters (Medium)",
    slotDescription: "DSA: Sliding window + last-seen index map.",
    estimatedMinutes: 40,
    sortOrder: 1,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl:
      "https://leetcode.com/problems/longest-substring-without-repeating-characters/",
  },
  {
    dayNumber: 3,
    dayTitle: "Two pointers & sliding window",
    dayNotes: "Core interview patterns for arrays/strings.",
    slotType: "REVISION",
    slotTitle: "Pattern notes",
    slotDescription:
      "Write 5 bullet points: when to use two pointers vs sliding window. No new problems.",
    estimatedMinutes: 15,
    sortOrder: 2,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "",
  },

  // Day 4 — Linked lists / stacks
  {
    dayNumber: 4,
    dayTitle: "Linked lists & stacks",
    dayNotes: "Pointer manipulation + classic stack problems.",
    slotType: "PRACTICE",
    slotTitle: "Reverse Linked List (Easy)",
    slotDescription: "DSA: Iterative reverse (prev/curr/next). Then try recursive.",
    estimatedMinutes: 25,
    sortOrder: 0,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "https://leetcode.com/problems/reverse-linked-list/",
  },
  {
    dayNumber: 4,
    dayTitle: "Linked lists & stacks",
    dayNotes: "Pointer manipulation + classic stack problems.",
    slotType: "PRACTICE",
    slotTitle: "Valid Parentheses (Easy)",
    slotDescription: "DSA: Stack of opening brackets; match closing types.",
    estimatedMinutes: 20,
    sortOrder: 1,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "https://leetcode.com/problems/valid-parentheses/",
  },
  {
    dayNumber: 4,
    dayTitle: "Linked lists & stacks",
    dayNotes: "Pointer manipulation + classic stack problems.",
    slotType: "PRACTICE",
    slotTitle: "Merge Two Sorted Lists (Easy)",
    slotDescription: "DSA: Dummy head + compare pointers.",
    estimatedMinutes: 25,
    sortOrder: 2,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "https://leetcode.com/problems/merge-two-sorted-lists/",
  },

  // Day 5 — Trees / BFS-DFS
  {
    dayNumber: 5,
    dayTitle: "Binary trees (BFS / DFS)",
    dayNotes: "Traversal interview staples.",
    slotType: "THEORY",
    slotTitle: "BFS vs DFS mental model",
    slotDescription:
      "Queue for level-order; recursion/stack for DFS. Sketch each on paper first.",
    estimatedMinutes: 20,
    sortOrder: 0,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "https://leetcode.com/explore/learn/card/data-structure-tree/",
  },
  {
    dayNumber: 5,
    dayTitle: "Binary trees (BFS / DFS)",
    dayNotes: "Traversal interview staples.",
    slotType: "PRACTICE",
    slotTitle: "Maximum Depth of Binary Tree (Easy)",
    slotDescription: "DSA: DFS recursion or BFS levels.",
    estimatedMinutes: 20,
    sortOrder: 1,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "https://leetcode.com/problems/maximum-depth-of-binary-tree/",
  },
  {
    dayNumber: 5,
    dayTitle: "Binary trees (BFS / DFS)",
    dayNotes: "Traversal interview staples.",
    slotType: "PRACTICE",
    slotTitle: "Binary Tree Level Order Traversal (Medium)",
    slotDescription: "DSA: BFS with queue; collect each level into a list.",
    estimatedMinutes: 35,
    sortOrder: 2,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "https://leetcode.com/problems/binary-tree-level-order-traversal/",
  },

  // Day 6 — Graphs / DP intro
  {
    dayNumber: 6,
    dayTitle: "Graphs & intro DP",
    dayNotes: "Light graph + one DP classic.",
    slotType: "PRACTICE",
    slotTitle: "Number of Islands (Medium)",
    slotDescription: "DSA: DFS/BFS flood fill on grid. Mark visited cells.",
    estimatedMinutes: 40,
    sortOrder: 0,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "https://leetcode.com/problems/number-of-islands/",
  },
  {
    dayNumber: 6,
    dayTitle: "Graphs & intro DP",
    dayNotes: "Light graph + one DP classic.",
    slotType: "PRACTICE",
    slotTitle: "Climbing Stairs (Easy)",
    slotDescription: "DSA: DP — ways(n) = ways(n-1) + ways(n-2).",
    estimatedMinutes: 20,
    sortOrder: 1,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "https://leetcode.com/problems/climbing-stairs/",
  },
  {
    dayNumber: 6,
    dayTitle: "Graphs & intro DP",
    dayNotes: "Light graph + one DP classic.",
    slotType: "ASSIGNMENT",
    slotTitle: "Explain your Number of Islands solution",
    slotDescription:
      "Write complexity + edge cases (empty grid, all water) in your notes. Optional: paste a blog/doc URL in externalUrl later.",
    estimatedMinutes: 20,
    sortOrder: 2,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "",
  },

  // Day 7 — Mock + review
  {
    dayNumber: 7,
    dayTitle: "Mock interview & review",
    dayNotes: "Timed practice + reflection. No new topics.",
    slotType: "PROJECT",
    slotTitle: "90-minute mock set",
    slotDescription:
      "Pick 1 Easy + 2 Medium from this week. Timebox 90 minutes. Note which patterns you forgot.",
    estimatedMinutes: 90,
    sortOrder: 0,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "https://leetcode.com/problemset/",
  },
  {
    dayNumber: 7,
    dayTitle: "Mock interview & review",
    dayNotes: "Timed practice + reflection. No new topics.",
    slotType: "QUIZ",
    slotTitle: "Self-check quiz",
    slotDescription:
      "Answer: Which 3 patterns are weakest? Which 2 problems will you retry next week?",
    estimatedMinutes: 15,
    sortOrder: 1,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "",
  },
  {
    dayNumber: 7,
    dayTitle: "Mock interview & review",
    dayNotes: "Timed practice + reflection. No new topics.",
    slotType: "REVISION",
    slotTitle: "Wrong-answer review",
    slotDescription:
      "Re-open any failed LeetCode from this week via the links you saved. Re-solve without looking at old code.",
    estimatedMinutes: 30,
    sortOrder: 2,
    topicId: "",
    contentId: "",
    contentFileUuid: "",
    externalUrl: "",
  },
];

const FIELD_GUIDE = [
  ["Column", "Required?", "What to enter", "Example"],
  [
    "dayNumber",
    "Yes",
    "Day index in the plan (1, 2, 3…). Repeat the same number for multiple slots on that day.",
    "1",
  ],
  [
    "dayTitle",
    "Recommended",
    "Short name for the day. Same value on every row for that day.",
    "Arrays — fundamentals",
  ],
  [
    "dayNotes",
    "No",
    "Optional coaching note for the whole day.",
    "Warm up with classic array patterns.",
  ],
  [
    "slotType",
    "Yes",
    "THEORY | PRACTICE | REVISION | QUIZ | ASSIGNMENT | PROJECT | CUSTOM (READING → THEORY).",
    "PRACTICE",
  ],
  [
    "slotTitle",
    "Yes",
    "Name of the task / DSA problem shown to the learner.",
    "Two Sum (Easy)",
  ],
  [
    "slotDescription",
    "Recommended",
    "Instructions, hints, or what “done” looks like.",
    "Use a hash map; aim for O(n).",
  ],
  [
    "estimatedMinutes",
    "No",
    "Whole number of minutes for this slot.",
    "30",
  ],
  [
    "sortOrder",
    "No",
    "Order of slots within the day (0, 1, 2…). Leave blank to auto-order by row.",
    "0",
  ],
  [
    "externalUrl",
    "No — but use this for links",
    "Any https link learners should open: LeetCode, article, YouTube, Notion doc. Leave blank if none.",
    "https://leetcode.com/problems/two-sum/",
  ],
  [
    "topicId",
    "No — usually leave blank",
    "Numeric ID of a topic already created in Streakly Learning catalog. Only fill if you know the ID from Admin/Learning. Do NOT invent numbers.",
    "(leave empty)",
  ],
  [
    "contentId",
    "No — usually leave blank",
    "Numeric ID of a learning content item in Streakly. Only fill if ops/admin gave you an ID. Leave empty for normal plans.",
    "(leave empty)",
  ],
  [
    "contentFileUuid",
    "No — usually leave blank",
    "UUID returned after you upload a file (PDF/image) via Streakly File Document Service. Paste that UUID here to attach the file to the slot. Leave empty if you only use links.",
    "e.g. 550e8400-e29b-41d4-a716-446655440000",
  ],
];

function escapeCsv(value) {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows = SAMPLE_ROWS) {
  const header = IMPORT_COLUMNS.join(",");
  const lines = rows.map((row) =>
    IMPORT_COLUMNS.map((col) => escapeCsv(row[col] ?? "")).join(",")
  );
  return [header, ...lines].join("\n") + "\n";
}

async function buildXlsxBuffer(rows = SAMPLE_ROWS) {
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Streakly Creator Service";
  wb.created = new Date();

  const instructions = wb.addWorksheet("Instructions");
  instructions.getColumn(1).width = 100;
  const guide = [
    "Streakly plan import — 1-week SDE (DSA) sample",
    "",
    "Quick start",
    "1. Open the Data sheet. Keep the header row exactly as-is.",
    "2. Each row = one SLOT (task). Same dayNumber = same day.",
    "3. For LeetCode / articles / videos → put the full https URL in externalUrl.",
    "4. Leave topicId, contentId, and contentFileUuid EMPTY unless you have real IDs/UUIDs from Streakly.",
    "5. Save → in Creator plan editor (DRAFT) → Bulk import → Upload spreadsheet.",
    "6. Import REPLACE mode clears the current draft curriculum, then inserts your rows.",
    "",
    "What most creators fill",
    "  dayNumber, dayTitle, dayNotes, slotType, slotTitle, slotDescription, estimatedMinutes, sortOrder, externalUrl",
    "",
    "Advanced columns (safe to ignore)",
    "  topicId / contentId  → internal Learning catalog IDs (numbers). Leave blank.",
    "  contentFileUuid      → UUID after uploading a file in Streakly. Leave blank if you only use links.",
    "",
    "slotType values: THEORY, PRACTICE, REVISION, QUIZ, ASSIGNMENT, PROJECT, CUSTOM",
    "  (READING is accepted and stored as THEORY)",
    "",
    "See FieldGuide sheet for column-by-column examples.",
    "Sample Data sheet = 7-day SDE prep with real LeetCode problem links.",
  ];
  guide.forEach((line, i) => {
    instructions.getCell(i + 1, 1).value = line;
  });
  instructions.getCell(1, 1).font = { bold: true, size: 14 };

  const fieldGuide = wb.addWorksheet("FieldGuide");
  fieldGuide.columns = [
    { header: "Column", key: "col", width: 18 },
    { header: "Required?", key: "req", width: 28 },
    { header: "What to enter", key: "what", width: 72 },
    { header: "Example", key: "ex", width: 48 },
  ];
  // FIELD_GUIDE[0] is header — ExcelJS already set headers via columns; skip duplicate or use rows from index 1
  FIELD_GUIDE.slice(1).forEach((row) => {
    fieldGuide.addRow({
      col: row[0],
      req: row[1],
      what: row[2],
      ex: row[3],
    });
  });
  fieldGuide.getRow(1).font = { bold: true };

  // Highlight the four confusing columns
  fieldGuide.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const name = String(row.getCell(1).value || "");
    if (
      ["topicId", "contentId", "contentFileUuid", "externalUrl"].includes(name)
    ) {
      row.getCell(1).font = { bold: true };
    }
  });

  const sheet = wb.addWorksheet("Data");
  sheet.columns = IMPORT_COLUMNS.map((key) => ({
    header: key,
    key,
    width:
      key === "slotDescription" || key === "externalUrl" || key === "dayNotes"
        ? 42
        : Math.max(14, key.length + 2),
  }));
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));

  // Freeze header
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  fieldGuide.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

module.exports = {
  IMPORT_COLUMNS,
  SAMPLE_ROWS,
  FIELD_GUIDE,
  buildCsv,
  buildXlsxBuffer,
};
