const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const Store = require('electron-store');

const store = new Store({ name: 'foundry' });
const ROI_PRESETS_KEY = 'roiAnalysis.presets';

let mainWindow;

// parsedFiles holds metadata only — NO rows array
// { name, filePath, delimiter, hasHeader, columns, rowCount, uniqueValues, sampleRows }
let parsedFiles = [];

const MAX_ERRORS = 10000;

// ─── Constants ────────────────────────────────────────────────────────────────

const DATE_FIELDS = new Set([
  'dob', 'coverage_start_date', 'coverage_end_date',
  'member_dob', 'subscriber_birth_date', 'claim_date', 'service_start_date', 'service_end_date',
]);
const GENDER_FIELDS = new Set(['gender', 'member_gender']);

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function splitLine(line, delim) {
  return line.split(delim).map((c) => c.replace(/^"|"$/g, '').trim());
}

function detectDelimiter(sampleLines) {
  const candidates = [',', '|', '\t'];
  let best = ',', bestScore = -1;
  for (const d of candidates) {
    const counts = sampleLines.map((l) => (l.match(new RegExp(d === '\t' ? '\\t' : `\\${d}`, 'g')) || []).length);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length || 0;
    if (avg <= 0) continue;
    const variance = counts.reduce((a, c) => a + (c - avg) ** 2, 0) / counts.length;
    const score = avg / (Math.sqrt(variance) + 1);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function toYMD(val) {
  const s = (val ?? '').trim();
  if (!s) return s;
  let m;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  m = s.match(/^(\d{4})[\/.](\d{2})[\/.](\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m) {
    const yr = parseInt(m[3]);
    const yyyy = yr >= 25 ? `19${m[3].padStart(2,'0')}` : `20${m[3].padStart(2,'0')}`;
    return `${yyyy}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  }
  if (/^\d{5}$/.test(s)) {
    const serial = parseInt(s);
    if (serial >= 7305 && serial <= 54787) {
      const d = new Date((serial - 25569) * 86400000);
      if (!isNaN(d)) return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    }
  }
  return '';
}

function csvCell(val) {
  const s = val ?? '';
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
    return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function detectDateFormat(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'YYYY-MM-DD';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return 'MM/DD/YYYY';
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) return 'MM-DD-YYYY';
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s)) return 'MM.DD.YYYY';
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return 'YYYY/MM/DD';
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(s)) return 'YYYY.MM.DD';
  if (/^\d{8}$/.test(s)) return 'YYYYMMDD';
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2}$/.test(s)) return 'MM/DD/YY';
  if (/^\d{5}$/.test(s)) return 'Excel Serial';
  return 'Unrecognized';
}

function transformValue(field, raw, valueMappings) {
  if (DATE_FIELDS.has(field)) return toYMD(raw);
  if (field === 'relationship') return valueMappings?.relationship?.[raw] ?? raw;
  if (GENDER_FIELDS.has(field)) return valueMappings?.gender?.[raw] ?? raw;
  return raw;
}

// ─── Streaming row generator ──────────────────────────────────────────────────
// Yields one row-object at a time; never holds all rows in memory.

async function* streamFileRows(filePath, delimiter, hasHeader) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.xlsx' || ext === '.xls') {
    // Excel: load once (Excel files are typically small)
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) return;
    const allValues = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      allValues.push(row.values.slice(1).map(v =>
        v == null ? '' : String(v && v.result !== undefined ? v.result : v)
      ));
    });
    let columns, startIdx;
    if (hasHeader && allValues.length) {
      columns = allValues[0];
      startIdx = 1;
    } else {
      columns = (allValues[0] ?? []).map((_, i) => `Col ${i + 1}`);
      startIdx = 0;
    }
    for (let i = startIdx; i < allValues.length; i++) {
      const cells = allValues[i];
      const row = {};
      columns.forEach((c, ci) => { row[c] = cells[ci] ?? ''; });
      yield row;
    }
    return;
  }

  // CSV / TXT / TSV — true line-by-line streaming
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let columns = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (columns === null) {
      if (hasHeader) {
        columns = splitLine(line, delimiter);
        continue;
      } else {
        const cells = splitLine(line, delimiter);
        columns = cells.map((_, i) => `Col ${i + 1}`);
        const row = {};
        columns.forEach((c, ci) => { row[c] = cells[ci] ?? ''; });
        yield row;
        continue;
      }
    }
    const cells = splitLine(line, delimiter);
    const row = {};
    columns.forEach((c, ci) => { row[c] = cells[ci] ?? ''; });
    yield row;
  }
}

// ─── Read first N lines from a text file (for delimiter detection) ────────────

async function readFirstLines(filePath, n) {
  const lines = [];
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) lines.push(line);
    if (lines.length >= n) break;
  }
  rl.close();
  fileStream.destroy();
  return lines;
}

// ─── Parse file path → metadata only (no rows stored) ────────────────────────

async function parseFilePath(filePath, delimiter, hasHeader, onProgress = null) {
  const stats = fs.statSync(filePath);
  if (stats.size > 1024 * 1024 * 1024) throw new Error(`${path.basename(filePath)} exceeds 1 GB limit`);

  const name = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  const uniqueValueSets = {};
  const sampleRows = [];
  let rowCount = 0;
  let columns = [];

  if (ext === '.xlsx' || ext === '.xls') {
    if (onProgress) onProgress(10);
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    if (onProgress) onProgress(60);
    const sheet = workbook.worksheets[0];
    if (sheet) {
      const allValues = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        allValues.push(row.values.slice(1).map(v => v == null ? '' : String(v && v.result !== undefined ? v.result : v)));
      });
      let startIdx;
      if (hasHeader && allValues.length) {
        columns = allValues[0];
        startIdx = 1;
      } else {
        columns = (allValues[0] ?? []).map((_, i) => `Col ${i + 1}`);
        startIdx = 0;
      }
      columns.forEach(c => { uniqueValueSets[c] = new Set(); });
      for (let i = startIdx; i < allValues.length; i++) {
        const cells = allValues[i];
        const row = {};
        columns.forEach((c, ci) => { row[c] = cells[ci] ?? ''; });
        rowCount++;
        if (sampleRows.length < 5) sampleRows.push(row);
        for (const col of columns) {
          const v = (row[col] ?? '').trim();
          if (v && uniqueValueSets[col].size < 200) uniqueValueSets[col].add(v);
        }
      }
    }
    delimiter = ',';
    if (onProgress) onProgress(100);
  } else {
    // Single streaming pass with byte-level progress tracking
    let bytesRead = 0;
    let lastReportedPct = 0;
    let isFirst = true;

    const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    if (onProgress) {
      fileStream.on('data', (chunk) => {
        bytesRead += chunk.length;
        const pct = Math.min(99, Math.round(bytesRead / stats.size * 100));
        if (pct >= lastReportedPct + 2) {
          lastReportedPct = pct;
          onProgress(pct);
        }
      });
    }
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      if (isFirst) {
        isFirst = false;
        if (hasHeader) {
          columns = splitLine(line, delimiter);
          columns.forEach(c => { uniqueValueSets[c] = new Set(); });
          continue;
        } else {
          const cells = splitLine(line, delimiter);
          columns = cells.map((_, i) => `Col ${i + 1}`);
          columns.forEach(c => { uniqueValueSets[c] = new Set(); });
          // fall through — treat this as a data row
        }
      }
      const cells = splitLine(line, delimiter);
      const row = {};
      columns.forEach((c, ci) => { row[c] = cells[ci] ?? ''; });
      rowCount++;
      if (sampleRows.length < 5) sampleRows.push(row);
      for (const col of columns) {
        const v = (row[col] ?? '').trim();
        if (v && uniqueValueSets[col].size < 200) uniqueValueSets[col].add(v);
      }
    }

    if (onProgress) onProgress(100);
  }

  const uniqueValues = {};
  columns.forEach(c => { uniqueValues[c] = [...uniqueValueSets[c]].sort(); });

  return { name, filePath, delimiter, hasHeader, columns, rowCount, uniqueValues, sampleRows };
}

// ─── Streaming validation ─────────────────────────────────────────────────────

async function validateStream(fileEntries, mappings, fields, valueMappings, allowedIndices) {
  const today = new Date().toISOString().slice(0, 10);
  const DATE_PAIRS = [
    ['coverage_start_date', 'coverage_end_date'],
    ['service_start_date',  'service_end_date'],
  ];
  const DOB_FIELDS_CHECK = ['dob', 'member_dob', 'subscriber_birth_date'];

  // Per-date-field tracking (format counts + capped row details)
  const dateFieldTracking = {};
  for (const f of fields) {
    if (DATE_FIELDS.has(f) && mappings[f])
      dateFieldTracking[f] = { formatCounts: {}, rowDetails: [] };
  }

  const emptyRequiredFields = {};
  const dateLogicErrorsMap = {};
  const unmappedValues = {};
  const paidAmtIssues = { nonNumeric: [], negative: [] };

  let globalIdx = 0;
  let exportRowCount = 0;
  const mappedDateFields = fields.filter(f => DATE_FIELDS.has(f) && mappings[f]);

  for (const { name: fileName, filePath, delimiter, hasHeader } of fileEntries) {
    let localRow = 0;

    for await (const row of streamFileRows(filePath, delimiter, hasHeader)) {
      localRow++;

      // ── Date format + empty checks
      for (const field of fields) {
        const col = mappings[field];
        if (!col || !DATE_FIELDS.has(field)) continue;
        const raw = (row[col] ?? '').trim();
        if (!raw) {
          if (!emptyRequiredFields[field]) emptyRequiredFields[field] = [];
          if (emptyRequiredFields[field].length < MAX_ERRORS)
            emptyRequiredFields[field].push({ fileName, localRow, globalIdx });
          continue;
        }
        const tracking = dateFieldTracking[field];
        if (!tracking) continue;
        const fmt = detectDateFormat(raw);
        tracking.formatCounts[fmt] = (tracking.formatCounts[fmt] || 0) + 1;
        if (tracking.rowDetails.length < MAX_ERRORS)
          tracking.rowDetails.push({ globalIdx, fileName, localRow, fmt, raw });
      }

      // ── Date logic checks
      for (const [startField, endField] of DATE_PAIRS) {
        const startCol = mappings[startField], endCol = mappings[endField];
        if (!startCol || !endCol) continue;
        const start = toYMD((row[startCol] ?? '').trim());
        const end   = toYMD((row[endCol]   ?? '').trim());
        if (!start || !end) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
        if (end < start) {
          const key = `${startField}_${endField}`;
          if (!dateLogicErrorsMap[key]) dateLogicErrorsMap[key] = { label: `${endField} before ${startField}`, errors: [] };
          if (dateLogicErrorsMap[key].errors.length < MAX_ERRORS)
            dateLogicErrorsMap[key].errors.push({ fileName, localRow, start, end, globalIdx });
        }
      }

      for (const dobField of DOB_FIELDS_CHECK) {
        const col = mappings[dobField];
        if (!col) continue;
        const converted = toYMD((row[col] ?? '').trim());
        if (!converted || !/^\d{4}-\d{2}-\d{2}$/.test(converted)) continue;
        if (converted > today) {
          const key = `future_${dobField}`;
          if (!dateLogicErrorsMap[key]) dateLogicErrorsMap[key] = { label: `${dobField} is in the future`, errors: [] };
          if (dateLogicErrorsMap[key].errors.length < MAX_ERRORS)
            dateLogicErrorsMap[key].errors.push({ fileName, localRow, value: converted, globalIdx });
        } else if (converted < '1900-01-01') {
          const key = `ancient_${dobField}`;
          if (!dateLogicErrorsMap[key]) dateLogicErrorsMap[key] = { label: `${dobField} before 1900`, errors: [] };
          if (dateLogicErrorsMap[key].errors.length < MAX_ERRORS)
            dateLogicErrorsMap[key].errors.push({ fileName, localRow, value: converted, globalIdx });
        }
      }

      // ── Unmapped value checks
      const genderField = fields.find(f => GENDER_FIELDS.has(f));
      if (genderField && mappings[genderField]) {
        const raw = (row[mappings[genderField]] ?? '').trim();
        if (raw && !(valueMappings?.gender ?? {})[raw]) {
          if (!unmappedValues[genderField]) unmappedValues[genderField] = { values: {}, total: 0 };
          unmappedValues[genderField].values[raw] = (unmappedValues[genderField].values[raw] || 0) + 1;
          unmappedValues[genderField].total++;
        }
      }
      if (fields.includes('relationship') && mappings['relationship']) {
        const raw = (row[mappings['relationship']] ?? '').trim();
        if (raw && !(valueMappings?.relationship ?? {})[raw]) {
          if (!unmappedValues['relationship']) unmappedValues['relationship'] = { values: {}, total: 0 };
          unmappedValues['relationship'].values[raw] = (unmappedValues['relationship'].values[raw] || 0) + 1;
          unmappedValues['relationship'].total++;
        }
      }

      // ── Paid amount checks
      if (fields.includes('paid_amt') && mappings['paid_amt']) {
        const raw = (row[mappings['paid_amt']] ?? '').trim();
        if (raw) {
          const num = Number(raw.replace(/[$,]/g, ''));
          if (isNaN(num)) {
            if (paidAmtIssues.nonNumeric.length < MAX_ERRORS)
              paidAmtIssues.nonNumeric.push({ fileName, localRow, value: raw, globalIdx });
          } else if (num < 0) {
            if (paidAmtIssues.negative.length < MAX_ERRORS)
              paidAmtIssues.negative.push({ fileName, localRow, value: raw, globalIdx });
          }
        }
      }

      // ── Export row count
      let skip = false;
      if (!allowedIndices.has(globalIdx)) {
        for (const f of mappedDateFields) {
          const raw = (row[mappings[f]] ?? '').trim();
          if (raw && toYMD(raw) === '') { skip = true; break; }
        }
      }
      if (!skip) exportRowCount++;

      globalIdx++;
    }
  }

  // Post-process date field tracking → dateFieldIssues
  const dateFieldIssues = {};
  for (const [field, { formatCounts, rowDetails }] of Object.entries(dateFieldTracking)) {
    if (!Object.keys(formatCounts).length) continue;
    const dominantFmt = Object.entries(formatCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const unparseable = [], outliers = [];
    for (const { globalIdx, fileName, localRow, fmt, raw } of rowDetails) {
      const converted = toYMD(raw);
      if (converted === '') unparseable.push({ fileName, localRow, value: raw, globalIdx });
      else if (fmt !== dominantFmt) outliers.push({ fileName, localRow, value: raw, fmt, globalIdx });
    }
    if (Object.keys(formatCounts).length > 1 || unparseable.length > 0)
      dateFieldIssues[field] = { formatCounts, dominantFmt, outliers, unparseable };
  }

  // Flatten dateLogicErrorsMap
  const dateLogicErrors = Object.entries(dateLogicErrorsMap)
    .filter(([, { errors }]) => errors.length)
    .map(([key, { label, errors }]) => ({ key, label, errors }));

  return { dateFieldIssues, emptyRequiredFields, dateLogicErrors, unmappedValues, paidAmtIssues, exportRowCount };
}

// ─── App setup ────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    title: 'Data Forge',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── Presets ──────────────────────────────────────────────────────────────────
ipcMain.handle('roi:getPresets',  () => store.get(ROI_PRESETS_KEY, {}));
ipcMain.handle('roi:savePresets', (_event, presets) => {
  store.set(ROI_PRESETS_KEY, presets);
  return { success: true };
});

// ─── Open files ───────────────────────────────────────────────────────────────
ipcMain.handle('roi:openFiles', async (_event, opts = {}) => {
  const { delimiter: hintDelim = ',', hasHeader = true } = opts;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Open ROI data files',
    filters: [
      { name: 'Data Files', extensions: ['csv', 'txt', 'tsv', 'xlsx', 'xls'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };

  // Detect delimiter from first few lines only
  let detectedDelimiter = hintDelim;
  try {
    const firstPath = result.filePaths[0];
    const ext = path.extname(firstPath).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      const sampleLines = await readFirstLines(firstPath, 5);
      if (sampleLines.length) detectedDelimiter = detectDelimiter(sampleLines);
    }
  } catch (_) {}

  parsedFiles = [];
  const totalFiles = result.filePaths.length;
  for (let i = 0; i < totalFiles; i++) {
    const fp = result.filePaths[i];
    const entry = await parseFilePath(fp, detectedDelimiter, hasHeader, (pct) => {
      mainWindow.webContents.send('roi:fileProgress', {
        fileName: path.basename(fp), fileIndex: i, totalFiles, percent: pct,
      });
    });
    parsedFiles.push(entry);
  }

  return {
    canceled: false,
    detectedDelimiter,
    files: parsedFiles.map(({ name, columns, rowCount, uniqueValues, sampleRows }) =>
      ({ name, columns, rowCount, uniqueValues, sampleRows })
    ),
  };
});

// ─── Add files ────────────────────────────────────────────────────────────────
ipcMain.handle('roi:addFiles', async (_event, opts = {}) => {
  const { delimiter = ',', hasHeader = true } = opts;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Add ROI data files',
    filters: [
      { name: 'Data Files', extensions: ['csv', 'txt', 'tsv', 'xlsx', 'xls'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };

  const existingNames = new Set(parsedFiles.map(f => f.name));
  const newPaths = result.filePaths.filter(fp => !existingNames.has(path.basename(fp)));
  if (!newPaths.length) return { canceled: false, files: [] };

  const newEntries = [];
  const totalFiles = newPaths.length;
  for (let i = 0; i < totalFiles; i++) {
    const fp = newPaths[i];
    const entry = await parseFilePath(fp, delimiter, hasHeader, (pct) => {
      mainWindow.webContents.send('roi:fileProgress', {
        fileName: path.basename(fp), fileIndex: i, totalFiles, percent: pct,
      });
    });
    newEntries.push(entry);
  }
  parsedFiles = [...parsedFiles, ...newEntries];

  return {
    canceled: false,
    files: newEntries.map(({ name, columns, rowCount, uniqueValues, sampleRows }) =>
      ({ name, columns, rowCount, uniqueValues, sampleRows })
    ),
  };
});

// ─── Reparse (delimiter or hasHeader changed) ─────────────────────────────────
ipcMain.handle('roi:reparse', async (_event, { delimiter, hasHeader }) => {
  if (!parsedFiles.length) return { files: [] };
  const totalFiles = parsedFiles.length;
  const reparsed = [];
  for (let i = 0; i < totalFiles; i++) {
    const { filePath } = parsedFiles[i];
    const entry = await parseFilePath(filePath, delimiter, hasHeader, (pct) => {
      mainWindow.webContents.send('roi:fileProgress', {
        fileName: path.basename(filePath), fileIndex: i, totalFiles, percent: pct,
      });
    });
    reparsed.push(entry);
  }
  parsedFiles = reparsed;
  return {
    files: parsedFiles.map(({ name, columns, rowCount, uniqueValues, sampleRows }) =>
      ({ name, columns, rowCount, uniqueValues, sampleRows })
    ),
  };
});

// ─── Validate ─────────────────────────────────────────────────────────────────
ipcMain.handle('roi:validate', async (_event, { mappings, relationshipMappings, genderMappings, fields, allowedRowIndices }) => {
  const valueMappings = { relationship: relationshipMappings, gender: genderMappings };
  const allowedSet = new Set(allowedRowIndices ?? []);
  return validateStream(parsedFiles, mappings, fields, valueMappings, allowedSet);
});

// ─── Export CSV (pre-built content — for small error-list exports) ─────────────
ipcMain.handle('roi:exportCsv', async (_event, { defaultFilename, content }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export CSV',
    defaultPath: defaultFilename || 'export.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }, { name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, content, 'utf-8');
  return { canceled: false, filePath: result.filePath };
});

// ─── Export main CSV (streaming write) ───────────────────────────────────────
ipcMain.handle('roi:exportMainCsv', async (_event, { defaultFilename, mappings, relationshipMappings, genderMappings, fields, allowedRowIndices }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export ROI CSV',
    defaultPath: defaultFilename || 'roi_export.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }, { name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  const valueMappings = { relationship: relationshipMappings, gender: genderMappings };
  const allowedSet = new Set(allowedRowIndices ?? []);
  const mapped = fields.filter(f => mappings[f]);

  const writeStream = fs.createWriteStream(result.filePath, { encoding: 'utf-8' });
  writeStream.write(mapped.map(csvCell).join(',') + '\n');

  let globalIdx = 0;
  for (const { filePath, delimiter, hasHeader } of parsedFiles) {
    for await (const row of streamFileRows(filePath, delimiter, hasHeader)) {
      let skip = false;
      if (!allowedSet.has(globalIdx)) {
        for (const f of mapped) {
          if (DATE_FIELDS.has(f)) {
            const raw = (row[mappings[f]] ?? '').trim();
            if (raw && toYMD(raw) === '') { skip = true; break; }
          }
        }
      }
      if (!skip) {
        writeStream.write(
          mapped.map(f => csvCell(transformValue(f, row[mappings[f]] ?? '', valueMappings))).join(',') + '\n'
        );
      }
      globalIdx++;
    }
  }

  await new Promise((resolve, reject) => {
    writeStream.end();
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  return { canceled: false, filePath: result.filePath };
});

// ─── Export Parquet (streaming) ───────────────────────────────────────────────
ipcMain.handle('roi:exportParquet', async (_event, { defaultFilename, mappings, relationshipMappings, genderMappings, fields, allowedRowIndices }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export ROI Parquet',
    defaultPath: defaultFilename || 'roi_export.parquet',
    filters: [{ name: 'Parquet', extensions: ['parquet'] }, { name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  const valueMappings = { relationship: relationshipMappings, gender: genderMappings };
  const allowedSet = new Set(allowedRowIndices ?? []);
  const mapped = fields.filter(f => mappings[f]);

  const parquet = require('parquetjs-lite');
  const schemaFields = {};
  for (const f of mapped) schemaFields[f] = { type: 'UTF8', optional: true };
  const schema = new parquet.ParquetSchema(schemaFields);
  const writer = await parquet.ParquetWriter.openFile(schema, result.filePath);

  let globalIdx = 0;
  for (const { filePath, delimiter, hasHeader } of parsedFiles) {
    for await (const row of streamFileRows(filePath, delimiter, hasHeader)) {
      let skip = false;
      if (!allowedSet.has(globalIdx)) {
        for (const f of mapped) {
          if (DATE_FIELDS.has(f)) {
            const raw = (row[mappings[f]] ?? '').trim();
            if (raw && toYMD(raw) === '') { skip = true; break; }
          }
        }
      }
      if (!skip) {
        const out = {};
        for (const f of mapped) out[f] = transformValue(f, row[mappings[f]] ?? '', valueMappings);
        await writer.appendRow(out);
      }
      globalIdx++;
    }
  }

  await writer.close();
  return { canceled: false, filePath: result.filePath };
});

// ─── Export skipped rows (streaming) ─────────────────────────────────────────
ipcMain.handle('roi:exportSkipped', async (_event, { defaultFilename, mappings, fields, allowedRowIndices }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Skipped Rows',
    defaultPath: defaultFilename || 'skipped_rows.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }, { name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  const allowedSet = new Set(allowedRowIndices ?? []);
  const mappedDateFields = fields.filter(f => DATE_FIELDS.has(f) && mappings[f]);
  const sourceCols = parsedFiles[0]?.columns ?? [];
  const headers = ['_file', '_row', '_skip_reason', ...sourceCols];

  const writeStream = fs.createWriteStream(result.filePath, { encoding: 'utf-8' });
  writeStream.write(headers.map(csvCell).join(',') + '\n');

  let globalIdx = 0;
  let skippedCount = 0;

  for (const { name: fileName, filePath, delimiter, hasHeader } of parsedFiles) {
    let localRow = 0;
    for await (const row of streamFileRows(filePath, delimiter, hasHeader)) {
      localRow++;
      if (!allowedSet.has(globalIdx)) {
        const reasons = [];
        for (const f of mappedDateFields) {
          const raw = (row[mappings[f]] ?? '').trim();
          if (raw && toYMD(raw) === '') reasons.push(`${f}: "${raw}"`);
        }
        if (reasons.length) {
          const outRow = { _file: fileName, _row: localRow, _skip_reason: reasons.join('; '), ...row };
          writeStream.write(headers.map(h => csvCell(String(outRow[h] ?? ''))).join(',') + '\n');
          skippedCount++;
        }
      }
      globalIdx++;
    }
  }

  await new Promise((resolve, reject) => {
    writeStream.end();
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  return { canceled: false, filePath: result.filePath, skippedCount };
});
