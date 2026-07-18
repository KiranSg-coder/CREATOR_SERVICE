/**
 * Parse flat CSV / XLSX curriculum files into nested day/slot JSON for
 * USP_IMPORT_ROWS_APPLY, with per-row validation errors.
 */

const { parse: parseCsv } = require("csv-parse/sync");
const { IMPORT_COLUMNS } = require("./importTemplate");

const SLOT_TYPE_ALIAS = {
  READING: "THEORY",
  THEORY: "THEORY",
  PRACTICE: "PRACTICE",
  REVISION: "REVISION",
  QUIZ: "QUIZ",
  ASSIGNMENT: "ASSIGNMENT",
  PROJECT: "PROJECT",
  CUSTOM: "CUSTOM",
};

const ALLOWED_TYPES = new Set(Object.values(SLOT_TYPE_ALIAS));

function normaliseKey(k) {
  return String(k || "")
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, "");
}

function pick(row, ...names) {
  for (const n of names) {
    const want = normaliseKey(n).toLowerCase();
    for (const [k, v] of Object.entries(row)) {
      if (normaliseKey(k).toLowerCase() === want) {
        if (v == null || String(v).trim() === "") return null;
        return typeof v === "string" ? v.trim() : v;
      }
    }
  }
  return null;
}

function toInt(v) {
  if (v == null || v === "") return null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function normaliseSlotType(raw) {
  if (raw == null || String(raw).trim() === "") return "CUSTOM";
  const key = String(raw).trim().toUpperCase();
  return SLOT_TYPE_ALIAS[key] || key;
}

/**
 * @param {Array<Record<string, unknown>>} flatRows
 * @returns {{ days: object[], errors: object[], totalRows: number, successRows: number, failRows: number }}
 */
function flatRowsToNested(flatRows) {
  const errors = [];
  const dayMap = new Map(); // dayNumber → { dayNumber, title, notes, slots: [] }

  flatRows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-based data rows after header
    const dayNumber = toInt(pick(row, "dayNumber", "DayNumber", "day"));
    const dayTitle = pick(row, "dayTitle", "DayTitle", "title");
    const dayNotes = pick(row, "dayNotes", "DayNotes", "notes");
    const slotTitle = pick(row, "slotTitle", "SlotTitle", "slot_title");
    const slotDescription = pick(
      row,
      "slotDescription",
      "SlotDescription",
      "description",
      "content"
    );
    const estimatedMinutes = toInt(
      pick(row, "estimatedMinutes", "EstimatedMinutes", "minutes")
    );
    let sortOrder = toInt(pick(row, "sortOrder", "SortOrder", "order"));
    const topicId = toInt(pick(row, "topicId", "TopicId"));
    const contentId = toInt(pick(row, "contentId", "ContentId"));
    const contentFileUuid = pick(
      row,
      "contentFileUuid",
      "ContentFileUuid",
      "fileUuid"
    );
    const externalUrl = pick(row, "externalUrl", "ExternalUrl", "url");
    const slotTypeRaw = pick(row, "slotType", "SlotType", "type");
    const slotType = normaliseSlotType(slotTypeRaw);

    if (dayNumber == null || dayNumber < 1) {
      errors.push({
        row: rowNum,
        field: "dayNumber",
        message: "dayNumber must be a positive integer",
      });
      return;
    }

    if (!slotTitle) {
      errors.push({
        row: rowNum,
        field: "slotTitle",
        message: "slotTitle is required",
      });
      return;
    }

    if (!ALLOWED_TYPES.has(slotType)) {
      errors.push({
        row: rowNum,
        field: "slotType",
        message: `Invalid slotType "${slotTypeRaw}". Use THEORY, PRACTICE, REVISION, QUIZ, ASSIGNMENT, PROJECT, CUSTOM (or READING).`,
      });
      return;
    }

    if (!dayMap.has(dayNumber)) {
      dayMap.set(dayNumber, {
        dayNumber,
        title: dayTitle || `Day ${dayNumber}`,
        notes: dayNotes || null,
        slots: [],
      });
    } else {
      const existing = dayMap.get(dayNumber);
      if (dayTitle && !existing.title) existing.title = dayTitle;
      if (dayNotes && !existing.notes) existing.notes = dayNotes;
      // Prefer non-empty title/notes from later rows if earlier was placeholder
      if (dayTitle) existing.title = dayTitle;
      if (dayNotes) existing.notes = dayNotes;
    }

    if (sortOrder == null) {
      sortOrder = dayMap.get(dayNumber).slots.length;
    }

    dayMap.get(dayNumber).slots.push({
      slotType,
      title: String(slotTitle),
      description: slotDescription != null ? String(slotDescription) : null,
      estimatedMinutes,
      sortOrder,
      topicId,
      contentId,
      contentFileUuid:
        contentFileUuid != null ? String(contentFileUuid) : null,
      externalUrl: externalUrl != null ? String(externalUrl) : null,
    });
  });

  const days = [...dayMap.values()].sort((a, b) => a.dayNumber - b.dayNumber);
  for (const d of days) {
    d.slots.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  const totalRows = flatRows.length;
  const failRows = errors.length;
  const successRows = Math.max(0, totalRows - failRows);

  return { days, errors, totalRows, successRows, failRows };
}

function parseCsvBuffer(buffer) {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const records = parseCsv(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
  return flatRowsToNested(records);
}

async function parseXlsxBuffer(buffer) {
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  let sheet =
    wb.getWorksheet("Data") ||
    wb.worksheets.find((s) => s.name.toLowerCase() === "data") ||
    wb.worksheets.find((s) => s.rowCount > 1) ||
    wb.worksheets[0];

  if (!sheet) {
    return {
      days: [],
      errors: [{ row: 0, field: null, message: "Workbook has no sheets" }],
      totalRows: 0,
      successRows: 0,
      failRows: 1,
    };
  }

  const headerRow = sheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cell.value != null ? String(cell.value).trim() : "";
  });

  const records = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = {};
    let any = false;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (!key) return;
      let val = cell.value;
      if (val && typeof val === "object" && "text" in val) val = val.text;
      if (val && typeof val === "object" && "result" in val) val = val.result;
      if (val != null && String(val).trim() !== "") any = true;
      obj[key] = val;
    });
    if (any) records.push(obj);
  });

  // Soft-check that at least one known column exists
  const headerSet = new Set(
    headers.filter(Boolean).map((h) => normaliseKey(h).toLowerCase())
  );
  if (!headerSet.has("daynumber") || !headerSet.has("slottitle")) {
    return {
      days: [],
      errors: [
        {
          row: 1,
          field: "headers",
          message: `Missing required columns. Expected at least dayNumber and slotTitle. Got: ${headers.filter(Boolean).join(", ")}`,
        },
      ],
      totalRows: 0,
      successRows: 0,
      failRows: 1,
    };
  }

  return flatRowsToNested(records);
}

/**
 * Detect format from filename / mime and parse.
 * @param {Buffer} buffer
 * @param {{ filename?: string, mimetype?: string }} meta
 */
async function parseImportFile(buffer, meta = {}) {
  const name = (meta.filename || "").toLowerCase();
  const mime = (meta.mimetype || "").toLowerCase();

  const isXlsx =
    name.endsWith(".xlsx") ||
    name.endsWith(".xlsm") ||
    mime.includes("spreadsheetml") ||
    mime.includes("excel");

  const isCsv =
    name.endsWith(".csv") ||
    mime.includes("csv") ||
    mime.includes("text/plain");

  if (isXlsx) return parseXlsxBuffer(buffer);
  if (isCsv || !isXlsx) {
    // Default to CSV for unknown extensions that look like text
    try {
      return parseCsvBuffer(buffer);
    } catch (err) {
      if (isCsv) throw err;
      // retry as xlsx
      return parseXlsxBuffer(buffer);
    }
  }

  return parseXlsxBuffer(buffer);
}

module.exports = {
  IMPORT_COLUMNS,
  flatRowsToNested,
  parseCsvBuffer,
  parseXlsxBuffer,
  parseImportFile,
  normaliseSlotType,
};
