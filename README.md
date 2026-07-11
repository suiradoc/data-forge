# Data Forge

Data Forge is a desktop app (Electron + React) that takes arbitrary CSV/TSV/TXT/Excel files, maps their columns onto a standardized ROI schema, validates the data, and exports clean CSV or Parquet output ready to push into a data lake.

## What it does

- Loads one or more source files and infers delimiter, headers, and column stats without ever loading full files into memory (streaming parse, so multi-GB files are fine)
- Lets you map source columns to canonical ROI Eligibility or ROI Claims fields, including relationship/gender value remapping and date normalization
- Validates the mapped data before export: bad or ambiguous dates, date logic errors, empty required fields, unmapped values, invalid paid amounts, and duplicate rows
- Exports the validated data as CSV or Parquet in the standardized schema, plus supporting reports (skipped rows, per-file summary)
- Saves mapping presets so recurring file formats can be re-exported without redoing the setup

## Commands

```bash
npm run dev        # Start app in development mode (hot reload via Vite)
npm run package    # Package app into ./out/ without creating installers
npm run make       # Build distributable DMG + ZIP in ./out/make/
```

There are no tests and no lint scripts configured.
