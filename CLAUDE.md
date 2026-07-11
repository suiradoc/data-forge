# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start app in development mode (hot reload via Vite)
npm run package    # Package app into ./out/ without creating installers
npm run make       # Build distributable DMG + ZIP in ./out/make/
```

There are no tests and no lint scripts configured.

## Architecture

DataForge is an **Electron + React + Vite** desktop app (built with electron-forge) that maps arbitrary CSV/TSV/TXT/Excel files to a standardized ROI schema and exports them as CSV or Parquet.

### Process boundary

All file I/O, parsing, validation, and export run in the **main process** (`src/main/index.js`). The renderer never touches the filesystem directly.

The **preload** (`src/preload/preload.js`) bridges the two via `contextBridge`, exposing `window.electronAPI` to the renderer. Every user action that needs data goes through an IPC call (`ipcRenderer.invoke`).

The renderer (`src/renderer/`) is a single React page: `App.jsx` → `ROIAnalysis.jsx`. There is no router.

### Metadata-only memory model

The main process stores `parsedFiles` — an array of metadata objects per loaded file:

```js
{ name, filePath, delimiter, hasHeader, columns, rowCount, uniqueValues, sampleRows }
```

**No row data is ever held in memory.** Rows are streamed on demand by the `streamFileRows` async generator, which yields one row-object at a time. This is what makes multi-GB files feasible. `parseFilePath` does a single streaming pass to collect metadata (column names, row count, up to 200 unique values per column, 5 sample rows).

### IPC channel map

| Channel | Direction | Purpose |
|---|---|---|
| `roi:openFiles` | invoke | Open file picker, parse all selected files, return metadata |
| `roi:addFiles` | invoke | Append additional files to the current session |
| `roi:reparse` | invoke | Re-stream all files with new delimiter/hasHeader settings |
| `roi:validate` | invoke | Stream all files and return a validation report |
| `roi:exportMainCsv` | invoke | Stream → write CSV with field mapping + value transforms |
| `roi:exportParquet` | invoke | Stream → write Parquet with field mapping + value transforms |
| `roi:exportCsv` | invoke | Write pre-built CSV string (for error-list exports) |
| `roi:exportSkipped` | invoke | Export rows that were excluded due to bad dates |
| `roi:exportSummary` | invoke | Export per-file row counts + duplicate detail report |
| `roi:getPresets` | invoke | Load saved presets from electron-store |
| `roi:savePresets` | invoke | Persist presets to electron-store |
| `roi:fileProgress` | push (main→renderer) | Byte-level progress for large file parsing |

### Validation flow

`handleExport` in `ROIAnalysis.jsx` first calls `roi:validate`, which runs `validateStream()` in the main process. That function streams every file once and accumulates:

- **Date format issues** — per-field format distribution, outlier rows (minority format), unparseable rows
- **Date logic errors** — end before start, DOB in future or before 1900
- **Empty required fields**
- **Unmapped relationship/gender values**
- **Paid amount issues** — non-numeric or negative
- **Duplicate detection** — composite key across all mapped fields

The renderer shows this as a validation modal. The user can "allow" individual rows with date issues by adding their global index to `allowedRowIndices`, which is then passed along to the actual export IPC call. Rows with unrecognized dates are skipped by default; allowed rows bypass that check.

### Date normalization

`toYMD()` (defined in both main and renderer — renderer copy is preview-only) normalizes many formats to `YYYY-MM-DD`, including Excel serial dates (5-digit integers in the range 7305–54787). `DATE_FIELDS` in main defines which field names trigger this transform. `transformValue()` applies date normalization plus relationship/gender value mapping at export time.

### Field schema

`FILE_TYPE_CONFIGS` in `ROIAnalysis.jsx` defines the two supported schemas:
- **ROI Eligibility** — member demographics + coverage dates
- **ROI Claims** — member + subscriber info, claim/service dates, diagnosis/procedure codes, paid amount

The `mappings` state object maps each ROI field name → the source column name chosen by the user. `relationshipMappings` and `genderMappings` map raw source values to canonical values.

### Presets

Presets are persisted via `electron-store` (store name: `foundry`, key: `roiAnalysis.presets`). A preset stores `{ fileType, delimiter, hasHeader, mappings, relationshipMappings, genderMappings }`.

### Styling

All styles are inline, using the `tokens` object from `src/renderer/styles/theme.js` for spacing, radius, font, and font-size constants. Dark/light mode is toggled by setting `data-theme="dark"` on `<html>` — CSS custom properties in `global.css` do the rest. There is no CSS-in-JS library. The only non-standard UI component is `ThemedSelect` (`src/renderer/components/ThemedSelect.jsx`), a custom dropdown used for all select inputs.
