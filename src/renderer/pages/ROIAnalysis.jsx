import { useState, useCallback, useMemo, useEffect } from 'react';
import forgeLogo from '../forge_logo.png';
import { tokens } from '../styles/theme';
import {
  BarChart3, Upload, FileText, Download, CheckCircle2, AlertCircle, Info,
  BookMarked, Save, Trash2, Sun, Moon,
} from 'lucide-react';
import ThemedSelect from '../components/ThemedSelect';

// ─── Field definitions ────────────────────────────────────────────────────────

const FILE_TYPE_CONFIGS = {
  'ROI Eligibility': {
    fields: [
      'chief_client_id', 'member_id', 'eph_id', 'health_plan_member_id',
      'member_first_name', 'member_last_name', 'dob', 'gender',
      'relationship', 'coverage_start_date', 'coverage_end_date',
    ],
    defaultNonOptional: ['member_first_name', 'member_last_name', 'dob'],
  },
  'ROI Claims': {
    fields: [
      'chief_client_id', 'claim_id', 'member_id', 'eph_id',
      'member_first_name', 'member_last_name', 'member_dob', 'member_gender',
      'relationship', 'subscriber_id', 'subscriber_first_name', 'subscriber_last_name',
      'subscriber_birth_date', 'claim_date', 'service_start_date', 'service_end_date',
      'paid_amt', 'type_of_service', 'revenue_code', 'provider_tin_code', 'provider_specialty_code',
      'diagnosis_code_1', 'diagnosis_code_2', 'diagnosis_code_3', 'diagnosis_code_4', 'diagnosis_code_5',
      'diagnosis_code_6', 'diagnosis_code_7', 'diagnosis_code_8', 'diagnosis_code_9', 'diagnosis_code_10',
      'procedure_code_1', 'procedure_code_2', 'procedure_code_3', 'procedure_code_4', 'procedure_code_5',
      'procedure_code_6',
    ],
    defaultNonOptional: ['member_first_name', 'member_last_name', 'member_dob'],
  },
};

const DELIMITER_OPTIONS = [
  { label: 'Comma (,)', value: ',' },
  { label: 'Pipe (|)',  value: '|' },
  { label: 'Tab',       value: '\t' },
];

const RELATIONSHIP_VALUES = [
  { value: 'employee',  label: 'Employee' },
  { value: 'spouse',    label: 'Spouse' },
  { value: 'dependent', label: 'Dependent' },
];

const GENDER_VALUES = [
  { value: 'm', label: 'M' },
  { value: 'f', label: 'F' },
];

const GENDER_FIELDS = new Set(['gender', 'member_gender']);

// ─── Small renderer-side helpers (only used for preview transforms) ───────────

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

function transformValue(field, raw, valueMappings) {
  if (['dob','coverage_start_date','coverage_end_date','member_dob','subscriber_birth_date','claim_date','service_start_date','service_end_date'].includes(field)) return toYMD(raw);
  if (field === 'relationship') return valueMappings?.relationship?.[raw] ?? raw;
  if (GENDER_FIELDS.has(field)) return valueMappings?.gender?.[raw] ?? raw;
  return raw;
}

function csvCell(val) {
  const s = val ?? '';
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page: { animation: 'fadeIn 0.3s ease' },
  title: { fontSize: tokens.fontSize.xl, fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  subtitle: { fontSize: tokens.fontSize.sm, color: 'var(--text-muted)', marginBottom: 20 },
  card: {
    background: 'var(--bg-card)', borderRadius: tokens.radius.lg,
    border: '1px solid var(--border)', marginBottom: 14, overflow: 'hidden',
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 18px', background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
  },
  cardTitle: { fontSize: tokens.fontSize.sm, fontWeight: 700, color: 'var(--text-primary)' },
  cardBody: { padding: '16px 20px' },
  label: {
    display: 'block', fontSize: 11, fontWeight: 600,
    color: 'var(--text-muted)', textTransform: 'uppercase',
    letterSpacing: '0.5px', marginBottom: 5,
  },
  input: {
    padding: '7px 10px', borderRadius: tokens.radius.md,
    border: '1px solid var(--border)', background: 'var(--bg-input)',
    color: 'var(--text-primary)', fontSize: tokens.fontSize.sm,
    outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  row: { display: 'flex', gap: 14, flexWrap: 'wrap' },
  field: (w = 220) => ({ flex: `1 1 ${w}px`, minWidth: 180 }),
  btn: (bg, disabled) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: tokens.radius.md,
    border: 'none', background: bg, color: '#fff',
    fontSize: tokens.fontSize.sm, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  }),
  mappingRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 240px) 1fr minmax(100px, 160px)',
    gap: 10, alignItems: 'center',
    padding: '6px 4px', borderBottom: '1px solid var(--border-light)',
  },
  mappingHeader: {
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 240px) 1fr minmax(100px, 160px)',
    gap: 10, padding: '6px 4px',
    fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    borderBottom: '1px solid var(--border)',
  },
  statusBanner: (type) => ({
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 14px', borderRadius: tokens.radius.md, marginTop: 12,
    fontSize: tokens.fontSize.sm,
    background: type === 'error'   ? 'rgba(231,76,60,0.10)'
              : type === 'success' ? 'rgba(39,174,96,0.10)'
              :                      'rgba(74,144,226,0.10)',
    border: `1px solid ${
      type === 'error'   ? 'rgba(231,76,60,0.3)'
    : type === 'success' ? 'rgba(39,174,96,0.3)'
    :                      'rgba(74,144,226,0.3)'}`,
    color: type === 'error'   ? 'var(--danger)'
         : type === 'success' ? 'var(--success)'
         :                      'var(--accent)',
  }),
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  modal: {
    background: 'var(--bg-card)', borderRadius: tokens.radius.lg,
    border: '1px solid var(--border)', width: '100%', maxWidth: 580,
    maxHeight: '80vh', overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    position: 'sticky', top: 0, zIndex: 1,
  },
  modalBody: { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 },
  modalFooter: {
    display: 'flex', gap: 10, justifyContent: 'flex-end',
    padding: '12px 20px', borderTop: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    position: 'sticky', bottom: 0, zIndex: 1,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8,
  },
  btnOutline: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: tokens.radius.md,
    border: '1px solid var(--border)', background: 'transparent',
    color: 'var(--text-secondary)', fontSize: tokens.fontSize.sm,
    fontWeight: 600, cursor: 'pointer',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ROIAnalysis() {
  // files now holds metadata objects: [{ name, columns, rowCount, uniqueValues, sampleRows }]
  const [files, setFiles]         = useState([]);
  const [delimiter, setDelimiter] = useState(',');
  const [hasHeader, setHasHeader] = useState(true);
  const [fileType, setFileType]   = useState('ROI Eligibility');
  const [mappingsByType, setMappingsByType]             = useState({});
  const [relMappingsByType, setRelMappingsByType]       = useState({});
  const [genderMappingsByType, setGenderMappingsByType] = useState({});

  const mappings             = mappingsByType[fileType]       ?? {};
  const relationshipMappings = relMappingsByType[fileType]    ?? {};
  const genderMappings       = genderMappingsByType[fileType] ?? {};

  const setMappings = useCallback((u) =>
    setMappingsByType(p => ({ ...p, [fileType]: typeof u === 'function' ? u(p[fileType] ?? {}) : u })),
    [fileType]);
  const setRelationshipMappings = useCallback((u) =>
    setRelMappingsByType(p => ({ ...p, [fileType]: typeof u === 'function' ? u(p[fileType] ?? {}) : u })),
    [fileType]);
  const setGenderMappings = useCallback((u) =>
    setGenderMappingsByType(p => ({ ...p, [fileType]: typeof u === 'function' ? u(p[fileType] ?? {}) : u })),
    [fileType]);

  const [exportFormat, setExportFormat]         = useState('csv');
  const [status, setStatus]                     = useState(null);
  const [validationData, setValidationData]     = useState(null);
  const [showHowTo, setShowHowTo]               = useState(false);
  const [darkMode, setDarkMode]                 = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : '');
  }, [darkMode]);
  const [lastValidationHadIssues, setLastValidationHadIssues] = useState(null);
  const [allowedRowIndices, setAllowedRowIndices] = useState(new Set());
  const [loadingProgress, setLoadingProgress] = useState(null); // null = idle, or { fileName, fileIndex, totalFiles, percent }
  const [exportRowCount, setExportRowCount]     = useState(0);

  // Presets
  const [presets, setPresets]               = useState({});
  const [selectedPreset, setSelectedPreset] = useState('');
  const [presetStatus, setPresetStatus]     = useState(null);
  const [presetModal, setPresetModal]       = useState(null); // { mode: 'save'|'edit', name: string }

  const cfg = FILE_TYPE_CONFIGS[fileType];

  // Derived from metadata — no heavy parsing in renderer
  const columns    = files[0]?.columns ?? [];
  const sampleRow  = files[0]?.sampleRows?.[0] ?? {};
  const previewRows = files[0]?.sampleRows ?? [];

  const fileRowCounts = files.map(f => f.rowCount);
  const totalRows     = fileRowCounts.reduce((a, b) => a + b, 0);

  // Column mismatches between files
  const fileWarnings = useMemo(() => {
    if (files.length < 2) return {};
    const refCols = files[0].columns;
    const warnings = {};
    for (let i = 1; i < files.length; i++) {
      const cols = files[i].columns;
      if (cols.length !== refCols.length) {
        warnings[i] = `Column count mismatch: expected ${refCols.length}, got ${cols.length}`;
        continue;
      }
      const mismatched = refCols.reduce((acc, c, j) => {
        if (c !== cols[j]) acc.push(`col ${j}: "${c}" vs "${cols[j]}"`);
        return acc;
      }, []);
      if (mismatched.length > 0) {
        const preview = mismatched.slice(0, 2).join(', ');
        const extra = mismatched.length > 2 ? ` +${mismatched.length - 2} more` : '';
        warnings[i] = `Column mismatch: ${preview}${extra}`;
      }
    }
    return warnings;
  }, [files]);

  // Unique relationship values from stored uniqueValues
  const uniqueRelValues = useMemo(() => {
    const col = mappings['relationship'];
    if (!col) return [];
    const seen = new Set();
    for (const f of files) {
      for (const v of (f.uniqueValues?.[col] ?? [])) {
        if (v) seen.add(v);
      }
    }
    return [...seen].sort();
  }, [files, mappings]);

  const genderFieldName = cfg.fields.find((f) => GENDER_FIELDS.has(f));
  const uniqueGenderValues = useMemo(() => {
    const col = genderFieldName && mappings[genderFieldName];
    if (!col) return [];
    const seen = new Set();
    for (const f of files) {
      for (const v of (f.uniqueValues?.[col] ?? [])) {
        if (v) seen.add(v);
      }
    }
    return [...seen].sort();
  }, [files, mappings, genderFieldName]);

  // Auto-fill gender values that are already f/m
  useEffect(() => {
    if (!uniqueGenderValues.length) return;
    setGenderMappings((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const val of uniqueGenderValues) {
        if (next[val]) continue;
        const lower = val.toLowerCase();
        if (lower === 'f' || lower === 'm') { next[val] = lower; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [uniqueGenderValues]);

  // Load presets on mount
  useEffect(() => {
    window.electronAPI.roiGetPresets().then(setPresets).catch(() => {});
  }, []);

  // Reparse when delimiter or hasHeader changes (if files are already loaded)
  useEffect(() => {
    if (!files.length) return;
    window.electronAPI.onFileProgress(setLoadingProgress);
    window.electronAPI.roiReparse({ delimiter, hasHeader })
      .then(result => {
        if (result?.files?.length) setFiles(result.files);
      })
      .catch(() => {})
      .finally(() => {
        window.electronAPI.offFileProgress();
        setLoadingProgress(null);
      });
  // We intentionally only re-run when delimiter/hasHeader change, not when files changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delimiter, hasHeader]);

  const handleUpload = useCallback(async () => {
    setStatus(null);
    window.electronAPI.onFileProgress(setLoadingProgress);
    try {
      const result = await window.electronAPI.roiOpenFiles({ delimiter, hasHeader });
      window.electronAPI.offFileProgress();
      setLoadingProgress(null);
      if (result?.canceled) return;
      setFiles(result.files);
      if (result.detectedDelimiter) setDelimiter(result.detectedDelimiter);
      setMappingsByType({});
      setRelMappingsByType({});
      setGenderMappingsByType({});
      setAllowedRowIndices(new Set());
      setExportRowCount(0);
      setValidationData(null);
    } catch (err) {
      window.electronAPI.offFileProgress();
      setLoadingProgress(null);
      setStatus({ type: 'error', text: `Failed to open files: ${err?.message || err}` });
    }
  }, [delimiter, hasHeader]);

  const handleAddFiles = useCallback(async () => {
    setStatus(null);
    window.electronAPI.onFileProgress(setLoadingProgress);
    try {
      const result = await window.electronAPI.roiAddFiles({ delimiter, hasHeader });
      window.electronAPI.offFileProgress();
      setLoadingProgress(null);
      if (result?.canceled) return;
      if (result.files?.length) {
        setFiles(prev => {
          const existingNames = new Set(prev.map(f => f.name));
          const newFiles = result.files.filter(f => !existingNames.has(f.name));
          return [...prev, ...newFiles];
        });
      }
    } catch (err) {
      window.electronAPI.offFileProgress();
      setLoadingProgress(null);
      setStatus({ type: 'error', text: `Failed to add files: ${err?.message || err}` });
    }
  }, [delimiter, hasHeader]);

  const updateMapping = (field, col) =>
    setMappings((m) => ({ ...m, [field]: col || undefined }));

  const handleLoadPreset = useCallback(() => {
    if (!selectedPreset || !presets[selectedPreset]) return;
    const p = presets[selectedPreset];
    if (p.delimiter) setDelimiter(p.delimiter);
    if (p.hasHeader !== undefined) setHasHeader(p.hasHeader);
    const type = p.fileType || fileType;
    if (p.fileType) setFileType(p.fileType);
    setMappingsByType(prev => ({ ...prev, [type]: p.mappings || {} }));
    setRelMappingsByType(prev => ({ ...prev, [type]: p.relationshipMappings || {} }));
    setGenderMappingsByType(prev => ({ ...prev, [type]: p.genderMappings || {} }));
    setPresetStatus({ type: 'success', text: `Loaded "${selectedPreset}"` });
  }, [selectedPreset, presets]);

  const handlePresetModalConfirm = useCallback(async () => {
    const name = presetModal?.name.trim();
    if (!name) return;
    const updated = { ...presets };
    if (presetModal.mode === 'edit' && selectedPreset && selectedPreset !== name) {
      delete updated[selectedPreset];
    }
    updated[name] = { fileType, delimiter, hasHeader, mappings, relationshipMappings, genderMappings };
    try {
      await window.electronAPI.roiSavePresets(updated);
      setPresets(updated);
      setSelectedPreset(name);
      setPresetModal(null);
      setPresetStatus({ type: 'success', text: presetModal.mode === 'edit' ? `Updated "${name}"` : `Saved "${name}"` });
    } catch (err) {
      setPresetStatus({ type: 'error', text: `Save failed: ${err?.message || err}` });
    }
  }, [presetModal, presets, selectedPreset, fileType, delimiter, hasHeader, mappings, relationshipMappings, genderMappings]);

  const handleDeletePreset = useCallback(async () => {
    if (!selectedPreset) return;
    const updated = { ...presets };
    delete updated[selectedPreset];
    try {
      await window.electronAPI.roiSavePresets(updated);
      setPresets(updated);
      setSelectedPreset('');
      setPresetStatus({ type: 'success', text: `Deleted "${selectedPreset}"` });
    } catch (err) {
      setPresetStatus({ type: 'error', text: `Delete failed: ${err?.message || err}` });
    }
  }, [selectedPreset, presets]);

  const mappedCount = cfg.fields.filter((f) => mappings[f]).length;
  const hasFile = files.length > 0 && (files[0]?.columns?.length ?? 0) > 0;

  useEffect(() => { setLastValidationHadIssues(null); setAllowedRowIndices(new Set()); }, [files, mappings]);

  const previewFields = cfg.fields.filter((f) => mappings[f]);

  const handleExport = useCallback(async () => {
    setStatus(null);
    if (!hasFile) return setStatus({ type: 'error', text: 'Upload a file first.' });
    if (!mappedCount) return setStatus({ type: 'error', text: 'Map at least one field.' });

    setAllowedRowIndices(new Set());
    try {
      const result = await window.electronAPI.roiValidate({
        mappings,
        relationshipMappings,
        genderMappings,
        fields: cfg.fields,
        allowedRowIndices: [],
      });
      const hasIssues =
        Object.keys(result.dateFieldIssues).length > 0 ||
        Object.keys(result.emptyRequiredFields).length > 0 ||
        result.dateLogicErrors.length > 0 ||
        Object.keys(result.unmappedValues).length > 0 ||
        result.paidAmtIssues.nonNumeric.length > 0 ||
        result.paidAmtIssues.negative.length > 0;
      setLastValidationHadIssues(hasIssues);
      setExportRowCount(result.exportRowCount ?? totalRows);
      setValidationData(result);
    } catch (err) {
      setStatus({ type: 'error', text: `Validation failed: ${err?.message || err}` });
    }
  }, [hasFile, mappedCount, mappings, cfg, relationshipMappings, genderMappings, totalRows]);

  const handleConfirmExport = useCallback(async () => {
    setValidationData(null);
    setStatus(null);
    setLastValidationHadIssues(false);

    const baseName = files[0]?.name.replace(/\.(csv|txt|tsv|xlsx|xls)$/i, '') ?? 'roi';

    try {
      let result;
      if (exportFormat === 'parquet') {
        result = await window.electronAPI.roiExportParquet({
          defaultFilename: `${baseName}_roi_export.parquet`,
          mappings,
          relationshipMappings,
          genderMappings,
          fields: cfg.fields,
          allowedRowIndices: [...allowedRowIndices],
        });
      } else {
        result = await window.electronAPI.roiExportMainCsv({
          defaultFilename: `${baseName}_roi_export.csv`,
          mappings,
          relationshipMappings,
          genderMappings,
          fields: cfg.fields,
          allowedRowIndices: [...allowedRowIndices],
        });
      }
      if (result?.canceled) return;
      setStatus({ type: 'success', text: `Saved: ${result.filePath}` });
    } catch (err) {
      setStatus({ type: 'error', text: `Export failed: ${err?.message || err}` });
    }
  }, [mappings, relationshipMappings, genderMappings, cfg, files, exportFormat, allowedRowIndices]);

  const handleAllowRow = useCallback((globalIdx) => {
    setAllowedRowIndices(prev => new Set([...prev, globalIdx]));
  }, []);

  const handleAllowAll = useCallback((indices) => {
    setAllowedRowIndices(prev => new Set([...prev, ...indices]));
  }, []);

  const handleExportIssueList = useCallback(async (filename, headers, rows) => {
    const content = [
      headers.join(','),
      ...rows.map(r => headers.map(h => csvCell(String(r[h] ?? ''))).join(',')),
    ].join('\n');
    try {
      await window.electronAPI.roiExportCsv({ defaultFilename: filename, content });
    } catch (err) {
      setStatus({ type: 'error', text: `Error export failed: ${err?.message || err}` });
    }
  }, []);

  const handleExportSkippedRows = useCallback(async () => {
    try {
      const result = await window.electronAPI.roiExportSkipped({
        defaultFilename: 'skipped_rows.csv',
        mappings,
        fields: cfg.fields,
        allowedRowIndices: [...allowedRowIndices],
      });
      if (result?.canceled) return;
      if (result?.skippedCount === 0) {
        setStatus({ type: 'info', text: 'No skipped rows to export.' });
      } else {
        setStatus({ type: 'success', text: `Skipped rows saved: ${result.filePath}` });
      }
    } catch (err) {
      setStatus({ type: 'error', text: `Export failed: ${err?.message || err}` });
    }
  }, [mappings, cfg, allowedRowIndices]);

  const handleExportDateErrors = useCallback(async (field, info) => {
    const rows = [
      ...info.outliers.map(u => ({ field, file: u.fileName ?? '', row: u.localRow, value: u.value, issue: 'minority_format', detected_format: u.fmt })),
      ...info.unparseable.map(u => ({ field, file: u.fileName ?? '', row: u.localRow, value: u.value, issue: 'unrecognized', detected_format: '' })),
    ].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.row - b.row));

    const header = 'field,file,row,value,issue,detected_format';
    const lines = rows.map(r =>
      [r.field, r.file, r.row, `"${r.value.replace(/"/g, '""')}"`, r.issue, r.detected_format].join(',')
    );
    const content = [header, ...lines].join('\n');

    try {
      await window.electronAPI.roiExportCsv({
        defaultFilename: `date_errors_${field}.csv`,
        content,
      });
    } catch (err) {
      setStatus({ type: 'error', text: `Error export failed: ${err?.message || err}` });
    }
  }, []);

  return (
    <div style={s.page}>
      {loadingProgress && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: tokens.radius.lg,
            border: '1px solid var(--border)', padding: '24px 28px',
            width: 340, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: tokens.fontSize.sm, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Loading {loadingProgress.fileName}
            </div>
            {loadingProgress.totalFiles > 1 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                File {loadingProgress.fileIndex + 1} of {loadingProgress.totalFiles}
              </div>
            )}
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginTop: 10 }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${loadingProgress.percent}%`,
                background: 'var(--accent)',
                transition: 'width 80ms linear',
              }} />
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
              {loadingProgress.percent}%
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ ...s.title, display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={forgeLogo} alt="" style={{ width: 64, height: 64, borderRadius: 10 }} />
          Data Forge
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setShowHowTo(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: tokens.radius.md,
              border: '1px solid var(--border)', background: 'var(--bg-input)',
              color: 'var(--text-secondary)', fontSize: tokens.fontSize.sm,
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Info size={13} /> How To
          </button>
          <button
            onClick={() => setDarkMode(d => !d)}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: tokens.radius.md,
              border: '1px solid var(--border)', background: 'var(--bg-input)',
              color: 'var(--text-secondary)', fontSize: tokens.fontSize.sm,
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            {darkMode ? <Sun size={13} /> : <Moon size={13} />}
            {darkMode ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      </div>

      {/* ── File Upload ────────────────────────────────────────── */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <Upload size={15} color="var(--accent)" />
          <span style={s.cardTitle}>File Upload</span>
        </div>
        <div style={s.cardBody}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: files.length ? 14 : 0 }}>
            <button onClick={handleUpload} style={s.btn('var(--success)', false)}>
              <Upload size={14} /> Upload Files
            </button>
            <button onClick={handleAddFiles} disabled={!hasFile} style={s.btn('var(--accent)', !hasFile)}>
              <Upload size={14} /> Add Files
            </button>
            <div>
              <label style={s.label}>File Type</label>
              <div style={{ display: 'flex', borderRadius: tokens.radius.md, border: '1px solid var(--border)', overflow: 'hidden' }}>
                {Object.keys(FILE_TYPE_CONFIGS).map((t, i, arr) => (
                  <button
                    key={t}
                    onClick={() => setFileType(t)}
                    style={{
                      padding: '7px 16px', fontSize: tokens.fontSize.sm, fontWeight: 600,
                      background: fileType === t ? 'var(--accent)' : 'var(--bg-input)',
                      color: fileType === t ? '#fff' : 'var(--text-muted)',
                      borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                      transition: 'background 150ms ease, color 150ms ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
              <div style={{ ...s.field(), maxWidth: 200 }}>
                <label style={s.label}>Delimiter</label>
                <ThemedSelect
                  value={delimiter}
                  onChange={(v) => setDelimiter(v)}
                  options={DELIMITER_OPTIONS}
                />
              </div>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, paddingBottom: 8,
                fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none',
                whiteSpace: 'nowrap',
              }}>
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                  style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                />
                First row is header
              </label>
            </div>
          </div>

          {files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {files.map((f, i) => {
                const rowCount = fileRowCounts[i];
                const warning = fileWarnings[i];
                return (
                  <div key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '6px 10px', borderRadius: tokens.radius.md,
                      background: 'var(--bg-input)',
                      border: `1px solid ${warning ? 'var(--danger)' : 'var(--border)'}`,
                    }}>
                      <FileText size={13} color={warning ? 'var(--danger)' : 'var(--accent)'} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: tokens.fontSize.sm, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.name}
                        {i === 0 && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>reference</span>}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                        {rowCount.toLocaleString()} rows
                      </span>
                      <button
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                        style={{ color: 'var(--text-muted)', padding: 2, lineHeight: 0, flexShrink: 0 }}
                        title="Remove"
                      >
                        x
                      </button>
                    </div>
                    {warning && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: tokens.radius.md, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', fontSize: 11, color: 'var(--danger)' }}>
                        <AlertCircle size={11} style={{ flexShrink: 0 }} />
                        {warning}
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {files.length} file{files.length !== 1 ? 's' : ''} — {totalRows.toLocaleString()} total rows
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Presets ───────────────────────────────────────────── */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <BookMarked size={15} color="var(--accent)" />
          <span style={s.cardTitle}>Presets</span>
        </div>
        <div style={s.cardBody}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', maxWidth: 300 }}>
              <ThemedSelect
                value={selectedPreset}
                onChange={setSelectedPreset}
                placeholder="Select a preset"
                options={[
                  { value: '', label: 'Select a preset' },
                  ...Object.keys(presets).map((n) => ({ value: n, label: n })),
                ]}
              />
            </div>
            <button onClick={handleLoadPreset} disabled={!selectedPreset} style={s.btn('var(--accent)', !selectedPreset)}>
              Load
            </button>
            <button
              onClick={() => selectedPreset && setPresetModal({ mode: 'edit', name: selectedPreset })}
              disabled={!selectedPreset}
              style={s.btn('var(--accent)', !selectedPreset)}
            >
              Edit
            </button>
            <button onClick={handleDeletePreset} disabled={!selectedPreset} style={s.btn('var(--danger)', !selectedPreset)}>
              <Trash2 size={13} /> Delete
            </button>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', margin: '0 2px' }} />
            <button onClick={() => setPresetModal({ mode: 'save', name: '' })} style={s.btn('var(--success)', false)}>
              <Save size={13} /> Save New Preset
            </button>
          </div>
          {presetStatus && (
            <div style={{ ...s.statusBanner(presetStatus.type), marginTop: 10 }}>
              {presetStatus.type === 'success' && <CheckCircle2 size={14} />}
              {presetStatus.type === 'error'   && <AlertCircle  size={14} />}
              <span>{presetStatus.text}</span>
            </div>
          )}
          {Object.keys(presets).length === 0 && (
            <p style={{ margin: '10px 0 0', fontSize: tokens.fontSize.sm, color: 'var(--text-muted)' }}>
              No presets saved yet. Configure your mappings and click "Save New Preset".
            </p>
          )}
        </div>
      </div>

      {/* ── Source Data Preview ────────────────────────────────── */}
      {hasFile && (
        <div style={s.card}>
          <div style={s.cardHeader}>
            <FileText size={15} color="var(--accent)" />
            <span style={s.cardTitle}>Source Data Preview (first {previewRows.length} rows)</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: tokens.fontSize.xs }}>
              <thead>
                <tr>
                  {columns.map((c, i) => (
                    <th key={c} style={{
                      padding: '8px 12px', textAlign: 'left',
                      background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                      fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                    }}>
                      {i}: {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, ri) => (
                  <tr key={ri}>
                    {columns.map((c) => (
                      <td key={c} style={{
                        padding: '6px 12px', borderBottom: '1px solid var(--border-light)',
                        whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
                        color: 'var(--text-primary)',
                      }} title={r[c]}>
                        {r[c] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Field Mapping ──────────────────────────────────────── */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <BarChart3 size={15} color="var(--accent)" />
          <span style={s.cardTitle}>Field Mapping</span>
          {mappedCount > 0 && (
            <span style={{
              marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)',
            }}>
              {mappedCount} of {cfg.fields.length} mapped
            </span>
          )}
        </div>
        <div style={s.cardBody}>
          {!hasFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: tokens.fontSize.sm }}>
              <Info size={13} /> Upload a file to begin mapping columns.
            </div>
          )}
          {hasFile && (
            <>
              <div style={s.mappingHeader}>
                <div>ROI Field</div>
                <div>Source Column</div>
                <div>Sample Value</div>
              </div>
              {cfg.fields.map((field) => {
                const isMapped = !!mappings[field];
                return (
                  <div key={field}>
                    <div style={{ ...s.mappingRow, opacity: isMapped ? 1 : 0.4 }}>
                      <div style={{ fontSize: tokens.fontSize.sm, color: 'var(--text-primary)' }}>
                        {field}
                      </div>
                      <ThemedSelect
                        value={mappings[field] || ''}
                        onChange={(v) => updateMapping(field, v)}
                        placeholder="Not Mapped"
                        options={[
                          { value: '', label: 'Not Mapped' },
                          ...columns.map((c, i) => ({
                            value: c,
                            label: `${i}: ${c}`,
                            searchLabel: c,
                            sublabel: sampleRow[c] ?? '',
                          })),
                        ]}
                      />
                      <div style={{
                        fontSize: 11, fontFamily: tokens.font.mono,
                        color: 'var(--text-muted)', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }} title={mappings[field] ? (sampleRow[mappings[field]] ?? '') : ''}>
                        {mappings[field] ? (sampleRow[mappings[field]] || '—') : ''}
                      </div>
                    </div>

                    {GENDER_FIELDS.has(field) && mappings[field] && uniqueGenderValues.length > 0 && (
                      <div style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-light)', padding: '10px 12px 10px 28px', maxWidth: 480 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <Info size={11} color="var(--accent)" />
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Value Conversion
                          </span>
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                            {uniqueGenderValues.filter((v) => genderMappings[v]).length} of {uniqueGenderValues.length} mapped
                          </span>
                        </div>
                        {uniqueGenderValues.map((val) => (
                          <div key={val} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,200px) minmax(160px,220px)', gap: 10, alignItems: 'center', padding: '4px 0' }}>
                            <div style={{ fontSize: 12, fontFamily: tokens.font.mono, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {val}
                            </div>
                            <ThemedSelect
                              value={genderMappings[val] || ''}
                              onChange={(v) => setGenderMappings((m) => ({ ...m, [val]: v || undefined }))}
                              placeholder="Not Mapped"
                              options={[
                                { value: '', label: 'Not Mapped' },
                                ...GENDER_VALUES,
                              ]}
                              minWidth={160}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {field === 'relationship' && mappings['relationship'] && uniqueRelValues.length > 0 && (
                      <div style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-light)', padding: '10px 12px 10px 28px', maxWidth: 480 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <Info size={11} color="var(--accent)" />
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Value Conversion
                          </span>
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                            {uniqueRelValues.filter((v) => relationshipMappings[v]).length} of {uniqueRelValues.length} mapped
                          </span>
                        </div>
                        {uniqueRelValues.map((val) => (
                          <div key={val} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,200px) minmax(160px,220px)', gap: 10, alignItems: 'center', padding: '4px 0' }}>
                            <div style={{ fontSize: 12, fontFamily: tokens.font.mono, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {val}
                            </div>
                            <ThemedSelect
                              value={relationshipMappings[val] || ''}
                              onChange={(v) => setRelationshipMappings((m) => ({ ...m, [val]: v || undefined }))}
                              placeholder="Not Mapped"
                              options={[
                                { value: '', label: 'Not Mapped' },
                                ...RELATIONSHIP_VALUES,
                              ]}
                              minWidth={160}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ── Output CSV Preview ─────────────────────────────────── */}
      {hasFile && previewFields.length > 0 && (
        <div style={s.card}>
          <div style={s.cardHeader}>
            <FileText size={15} color="var(--accent)" />
            <span style={s.cardTitle}>Output Preview (first {previewRows.length} rows)</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: tokens.fontSize.xs }}>
              <thead>
                <tr>
                  {previewFields.map((f) => (
                    <th key={f} style={{
                      padding: '8px 12px', textAlign: 'left',
                      background: 'var(--bg-secondary)', color: 'var(--accent)',
                      fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                    }}>
                      {f}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, ri) => (
                  <tr key={ri}>
                    {previewFields.map((f) => (
                      <td key={f} style={{
                        padding: '6px 12px', borderBottom: '1px solid var(--border-light)',
                        whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
                        color: 'var(--text-primary)',
                      }} title={r[mappings[f]]}>
                        {transformValue(f, r[mappings[f]] ?? '', { relationship: relationshipMappings, gender: genderMappings }) || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Export ────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', bottom: 0, zIndex: 10,
        background: 'var(--bg-card)', borderTop: '1px solid var(--border)',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.18)',
        padding: '12px 20px', marginTop: 8,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', borderRadius: tokens.radius.md, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {['csv', 'parquet'].map((fmt) => (
            <button
              key={fmt}
              onClick={() => setExportFormat(fmt)}
              style={{
                padding: '7px 14px', fontSize: tokens.fontSize.sm, fontWeight: 600,
                background: exportFormat === fmt ? 'var(--accent)' : 'var(--bg-input)',
                color: exportFormat === fmt ? '#fff' : 'var(--text-muted)',
                borderRight: fmt === 'csv' ? '1px solid var(--border)' : 'none',
                transition: 'background 150ms ease, color 150ms ease',
              }}
            >
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={handleExport}
          disabled={!hasFile || !mappedCount}
          style={s.btn('var(--accent)', !hasFile || !mappedCount)}
        >
          <Download size={14} />
          {lastValidationHadIssues === true && (
            <AlertCircle size={13} color="#fbbf24" style={{ marginRight: -2 }} />
          )}
          Export {hasFile && mappedCount ? `${exportRowCount.toLocaleString()} rows as ` : ''}{exportFormat.toUpperCase()}
        </button>
        {status && (
          <div style={{ ...s.statusBanner(status.type), marginTop: 0, flex: 1 }}>
            {status.type === 'success' && <CheckCircle2 size={14} />}
            {status.type === 'error'   && <AlertCircle  size={14} />}
            <span style={{ wordBreak: 'break-all' }}>{status.text}</span>
          </div>
        )}
      </div>

      {/* ── How To Modal ──────────────────────────────────────── */}
      {showHowTo && (
        <div style={s.overlay}>
          <div style={{ ...s.modal, maxWidth: 520 }}>
            <div style={s.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Info size={14} color="var(--accent)" />
                <span style={{ fontSize: tokens.fontSize.sm, fontWeight: 700, color: 'var(--text-primary)' }}>
                  How To Use Data Forge
                </span>
              </div>
              <button
                onClick={() => setShowHowTo(false)}
                style={{ color: 'var(--text-muted)', lineHeight: 0, padding: 4, fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                x
              </button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                {
                  step: 1,
                  title: 'Upload your file(s)',
                  desc: 'Click "Upload Files" to load one or more CSV, TSV, TXT, or Excel files. The delimiter is detected automatically. Use "Add Files" to append additional files to the same export.',
                },
                {
                  step: 2,
                  title: 'Select the file type',
                  desc: 'Choose ROI Eligibility or ROI Claims depending on the data you are mapping. This controls which output fields are available.',
                },
                {
                  step: 3,
                  title: 'Map your columns',
                  desc: 'In the Field Mapping section, match each ROI output field to the corresponding column in your source file. Unmapped fields are excluded from the export.',
                },
                {
                  step: 4,
                  title: 'Map value conversions',
                  desc: 'If your source data uses different values for gender (e.g. "Male" to "m") or relationship (e.g. "EE" to "employee"), use the inline conversion dropdowns that appear under those fields.',
                },
                {
                  step: 5,
                  title: 'Save a preset (optional)',
                  desc: 'Once your mapping is configured, click "Save New Preset" to store it for future files with the same layout. Load it next time to skip the mapping step.',
                },
                {
                  step: 6,
                  title: 'Export',
                  desc: 'Click Export CSV or Parquet. A validation summary appears first showing row counts, date format issues, unmapped values, and any data quality problems. Review warnings, then confirm to export.',
                },
                {
                  step: 7,
                  title: 'Handle skipped rows',
                  desc: 'Rows with unrecognized date values are automatically excluded from the export to protect the database. If any rows are skipped, an "Export Skipped Rows" button appears so you can review and fix them separately.',
                },
              ].map(({ step, title, desc }) => (
                <div key={step} style={{ display: 'flex', gap: 14 }}>
                  <div style={{
                    flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
                    background: 'var(--accent)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                  }}>
                    {step}
                  </div>
                  <div>
                    <div style={{ fontSize: tokens.fontSize.sm, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>
                      {title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      {desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              Found a bug or want a new feature? Reach out to <strong style={{ color: 'var(--text-secondary)' }}>Cody White</strong>.
            </div>
            <div style={{ ...s.modalFooter, justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                v1.10
              </span>
              <button onClick={() => setShowHowTo(false)} style={s.btn('var(--accent)', false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preset Modal ──────────────────────────────────────── */}
      {presetModal && (
        <div style={s.overlay}>
          <div style={{ ...s.modal, maxWidth: 360 }}>
            <div style={s.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BookMarked size={14} color="var(--accent)" />
                <span style={{ fontSize: tokens.fontSize.sm, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {presetModal.mode === 'save' ? 'Save New Preset' : 'Edit Preset'}
                </span>
              </div>
              <button
                onClick={() => setPresetModal(null)}
                style={{ color: 'var(--text-muted)', lineHeight: 0, padding: 4, fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                x
              </button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={s.label}>Preset Name</label>
                <input
                  style={s.input}
                  value={presetModal.name}
                  onChange={e => setPresetModal(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handlePresetModalConfirm()}
                  placeholder="Enter a name..."
                  autoFocus
                />
              </div>
              {presetModal.mode === 'edit' && (
                <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                  Current field mappings will be saved to this preset.
                </p>
              )}
            </div>
            <div style={s.modalFooter}>
              <button onClick={() => setPresetModal(null)} style={s.btnOutline}>Cancel</button>
              <button
                onClick={handlePresetModalConfirm}
                disabled={!presetModal.name.trim()}
                style={s.btn('var(--success)', !presetModal.name.trim())}
              >
                <Save size={13} /> {presetModal.mode === 'save' ? 'Save Preset' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Validation Modal ──────────────────────────────────── */}
      {validationData && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Info size={15} color="var(--accent)" />
                <span style={{ fontSize: tokens.fontSize.sm, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Export Validation
                </span>
              </div>
              <button
                onClick={() => setValidationData(null)}
                style={{ color: 'var(--text-muted)', lineHeight: 0, padding: 4, fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                x
              </button>
            </div>

            <div style={s.modalBody}>
              {/* Summary */}
              <div>
                <div style={s.sectionTitle}>Summary</div>
                <div style={{ fontSize: tokens.fontSize.sm, color: 'var(--text-primary)', marginBottom: 8 }}>
                  <strong>{totalRows.toLocaleString()}</strong> total rows across{' '}
                  <strong>{files.length}</strong> file{files.length !== 1 ? 's' : ''}
                </div>
                {files.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {files.map((f, i) => (
                      <div key={f.name} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        fontSize: 12, color: 'var(--text-muted)', padding: '4px 10px',
                        background: 'var(--bg-input)', borderRadius: tokens.radius.sm,
                      }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {f.name}
                        </span>
                        <span style={{ flexShrink: 0, marginLeft: 12, fontVariantNumeric: 'tabular-nums' }}>
                          {fileRowCounts[i].toLocaleString()} rows
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Date format issues */}
              {Object.keys(validationData.dateFieldIssues).length > 0 && (
                <div>
                  <div style={s.sectionTitle}>Date Format Analysis</div>
                  {Object.entries(validationData.dateFieldIssues).map(([field, info]) => {
                    const total = Object.values(info.formatCounts).reduce((a, b) => a + b, 0);
                    const hasUnparseable = info.unparseable.length > 0;
                    const hasExportableErrors = info.outliers.length + info.unparseable.length > 5;
                    return (
                      <div key={field} style={{
                        marginBottom: 10, padding: '10px 12px', borderRadius: tokens.radius.md,
                        background: 'var(--bg-input)',
                        border: `1px solid ${hasUnparseable ? 'rgba(231,76,60,0.35)' : 'rgba(251,191,36,0.35)'}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                          <AlertCircle size={12} color={hasUnparseable ? 'var(--danger)' : '#f59e0b'} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{field}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            {Object.keys(info.formatCounts).length} format{Object.keys(info.formatCounts).length !== 1 ? 's' : ''} detected
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {Object.entries(info.formatCounts)
                            .sort((a, b) => b[1] - a[1])
                            .map(([fmt, count]) => (
                              <div key={fmt} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{
                                  fontSize: 11, fontFamily: tokens.font.mono,
                                  color: fmt === 'Unrecognized' ? 'var(--danger)' : 'var(--text-secondary)',
                                  width: 130, flexShrink: 0,
                                }}>{fmt}</span>
                                <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                                  <div style={{
                                    height: '100%',
                                    width: `${(count / total) * 100}%`,
                                    background: fmt === 'Unrecognized' ? 'var(--danger)' : 'var(--accent)',
                                    borderRadius: 3,
                                  }} />
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 80, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                  {count.toLocaleString()} ({Math.round(count / total * 100)}%)
                                </span>
                              </div>
                            ))}
                        </div>
                        {info.outliers.length > 0 && (
                          <div style={{
                            marginTop: 10, padding: '7px 10px', borderRadius: tokens.radius.sm,
                            background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.3)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                              <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
                                {info.outliers.length.toLocaleString()} row{info.outliers.length !== 1 ? 's' : ''} with minority format
                                {info.outliers.length > 5 ? ' (showing first 5)' : ''}:
                              </div>
                              {info.outliers.length > 1 && (
                                <button
                                  onClick={() => handleAllowAll(info.outliers.map(u => u.globalIdx))}
                                  disabled={info.outliers.every(u => allowedRowIndices.has(u.globalIdx))}
                                  style={{
                                    fontSize: 10, fontWeight: 600, padding: '2px 8px', flexShrink: 0, marginLeft: 8,
                                    borderRadius: tokens.radius.sm, border: '1px solid rgba(39,174,96,0.5)',
                                    background: 'rgba(39,174,96,0.1)', color: 'var(--success)',
                                    cursor: info.outliers.every(u => allowedRowIndices.has(u.globalIdx)) ? 'default' : 'pointer',
                                  }}
                                >Allow All</button>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {info.outliers.slice(0, 5).map((u, i) => {
                                const isAllowed = allowedRowIndices.has(u.globalIdx);
                                return (
                                  <div key={i} style={{
                                    fontSize: 11, fontFamily: tokens.font.mono,
                                    color: isAllowed ? 'var(--success)' : '#f59e0b',
                                    background: isAllowed ? 'rgba(39,174,96,0.10)' : 'rgba(251,191,36,0.08)',
                                    padding: '3px 8px', borderRadius: 3,
                                    display: 'flex', gap: 8, alignItems: 'center',
                                  }}>
                                    <span style={{ flexShrink: 0, opacity: 0.8 }}>
                                      {u.fileName ? `${u.fileName} ` : ''}row {u.localRow}
                                    </span>
                                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>&#8212;</span>
                                    <span style={{ flex: 1 }}>"{u.value}"</span>
                                    <span style={{ opacity: 0.7, flexShrink: 0 }}>({u.fmt})</span>
                                    <button
                                      onClick={() => handleAllowRow(u.globalIdx)}
                                      disabled={isAllowed}
                                      style={{
                                        fontSize: 10, fontWeight: 700, padding: '1px 7px', flexShrink: 0,
                                        borderRadius: tokens.radius.sm,
                                        border: `1px solid ${isAllowed ? 'rgba(39,174,96,0.4)' : 'rgba(39,174,96,0.6)'}`,
                                        background: isAllowed ? 'rgba(39,174,96,0.15)' : 'rgba(39,174,96,0.1)',
                                        color: 'var(--success)', cursor: isAllowed ? 'default' : 'pointer',
                                        fontFamily: 'inherit',
                                      }}
                                    >{isAllowed ? '✓ Allowed' : 'Allow'}</button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {info.unparseable.length > 0 && (
                          <div style={{
                            marginTop: 10, padding: '7px 10px', borderRadius: tokens.radius.sm,
                            background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.25)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                              <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>
                                {info.unparseable.length.toLocaleString()} row{info.unparseable.length !== 1 ? 's' : ''} will be skipped (unrecognized date)
                                {info.unparseable.length > 5 ? ' (showing first 5)' : ''}:
                              </div>
                              {info.unparseable.length > 1 && (
                                <button
                                  onClick={() => handleAllowAll(info.unparseable.map(u => u.globalIdx))}
                                  disabled={info.unparseable.every(u => allowedRowIndices.has(u.globalIdx))}
                                  style={{
                                    fontSize: 10, fontWeight: 600, padding: '2px 8px', flexShrink: 0, marginLeft: 8,
                                    borderRadius: tokens.radius.sm, border: '1px solid rgba(39,174,96,0.5)',
                                    background: info.unparseable.every(u => allowedRowIndices.has(u.globalIdx)) ? 'rgba(39,174,96,0.15)' : 'rgba(39,174,96,0.1)',
                                    color: 'var(--success)', cursor: info.unparseable.every(u => allowedRowIndices.has(u.globalIdx)) ? 'default' : 'pointer',
                                  }}
                                >
                                  Allow All
                                </button>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {info.unparseable.slice(0, 5).map((u, i) => {
                                const isAllowed = allowedRowIndices.has(u.globalIdx);
                                return (
                                  <div key={i} style={{
                                    fontSize: 11, fontFamily: tokens.font.mono,
                                    color: isAllowed ? 'var(--success)' : 'var(--danger)',
                                    background: isAllowed ? 'rgba(39,174,96,0.10)' : 'rgba(231,76,60,0.12)',
                                    padding: '3px 8px', borderRadius: 3,
                                    display: 'flex', gap: 8, alignItems: 'center',
                                  }}>
                                    <span style={{ flexShrink: 0, opacity: 0.75 }}>
                                      {u.fileName ? `${u.fileName} ` : ''}row {u.localRow}
                                    </span>
                                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>&#8212;</span>
                                    <span style={{ flex: 1 }}>"{u.value}"</span>
                                    <button
                                      onClick={() => handleAllowRow(u.globalIdx)}
                                      disabled={isAllowed}
                                      style={{
                                        fontSize: 10, fontWeight: 700, padding: '1px 7px', flexShrink: 0,
                                        borderRadius: tokens.radius.sm,
                                        border: `1px solid ${isAllowed ? 'rgba(39,174,96,0.4)' : 'rgba(39,174,96,0.6)'}`,
                                        background: isAllowed ? 'rgba(39,174,96,0.15)' : 'rgba(39,174,96,0.1)',
                                        color: 'var(--success)', cursor: isAllowed ? 'default' : 'pointer',
                                        fontFamily: 'inherit',
                                      }}
                                    >
                                      {isAllowed ? '✓ Allowed' : 'Allow'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {hasExportableErrors && (
                          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {info.outliers.length + info.unparseable.length} total errors in <strong>{field}</strong>
                            </span>
                            <button
                              onClick={() => handleExportDateErrors(field, info)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                fontSize: 11, fontWeight: 600, padding: '4px 10px',
                                borderRadius: tokens.radius.sm, border: '1px solid var(--border)',
                                background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                                cursor: 'pointer',
                              }}
                            >
                              <Download size={11} /> Export Errors
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Date logic errors */}
              {validationData.dateLogicErrors.length > 0 && (
                <div>
                  <div style={s.sectionTitle}>Date Logic Errors</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {validationData.dateLogicErrors.map((issue) => {
                      const overLimit = issue.errors.length > 5;
                      return (
                        <div key={issue.key} style={{
                          padding: '10px 12px', borderRadius: tokens.radius.md,
                          background: 'var(--bg-input)', border: '1px solid rgba(231,76,60,0.35)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <AlertCircle size={12} color="var(--danger)" />
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{issue.label}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                              {issue.errors.length.toLocaleString()} row{issue.errors.length !== 1 ? 's' : ''}
                              {overLimit ? ' (showing first 5)' : ''}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {issue.errors.slice(0, 5).map((e, i) => {
                              const isAllowed = allowedRowIndices.has(e.globalIdx);
                              return (
                                <div key={i} style={{
                                  fontSize: 11, fontFamily: tokens.font.mono,
                                  color: isAllowed ? 'var(--success)' : 'var(--danger)',
                                  background: isAllowed ? 'rgba(39,174,96,0.10)' : 'rgba(231,76,60,0.10)',
                                  padding: '3px 8px', borderRadius: 3,
                                  display: 'flex', gap: 8, alignItems: 'center',
                                }}>
                                  <span style={{ flexShrink: 0, opacity: 0.75 }}>
                                    {e.fileName ? `${e.fileName} ` : ''}row {e.localRow}
                                  </span>
                                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>&#8212;</span>
                                  <span style={{ flex: 1 }}>{e.start ?? e.value}{e.end ? ` → ${e.end}` : ''}</span>
                                  <button
                                    onClick={() => handleAllowRow(e.globalIdx)}
                                    disabled={isAllowed}
                                    style={{
                                      fontSize: 10, fontWeight: 700, padding: '1px 7px', flexShrink: 0,
                                      borderRadius: tokens.radius.sm,
                                      border: `1px solid ${isAllowed ? 'rgba(39,174,96,0.4)' : 'rgba(39,174,96,0.6)'}`,
                                      background: isAllowed ? 'rgba(39,174,96,0.15)' : 'rgba(39,174,96,0.1)',
                                      color: 'var(--success)', cursor: isAllowed ? 'default' : 'pointer',
                                      fontFamily: 'inherit',
                                    }}
                                  >{isAllowed ? '✓ Allowed' : 'Allow'}</button>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {overLimit && (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  {issue.errors.length} total errors
                                </span>
                              )}
                              <button
                                onClick={() => handleAllowAll(issue.errors.map(e => e.globalIdx))}
                                disabled={issue.errors.every(e => allowedRowIndices.has(e.globalIdx))}
                                style={{
                                  fontSize: 10, fontWeight: 600, padding: '2px 8px',
                                  borderRadius: tokens.radius.sm, border: '1px solid rgba(39,174,96,0.5)',
                                  background: 'rgba(39,174,96,0.1)', color: 'var(--success)',
                                  cursor: issue.errors.every(e => allowedRowIndices.has(e.globalIdx)) ? 'default' : 'pointer',
                                }}
                              >Allow All</button>
                            </div>
                            {overLimit && (
                              <button
                                onClick={() => handleExportIssueList(
                                  `errors_${issue.key}.csv`,
                                  issue.errors[0]?.end !== undefined
                                    ? ['file', 'row', 'start', 'end']
                                    : ['file', 'row', 'value'],
                                  issue.errors.map(e => ({ file: e.fileName ?? '', row: e.localRow, start: e.start, end: e.end, value: e.value }))
                                )}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5,
                                  fontSize: 11, fontWeight: 600, padding: '4px 10px',
                                  borderRadius: tokens.radius.sm, border: '1px solid var(--border)',
                                  background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer',
                                }}
                              >
                                <Download size={11} /> Export Errors
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Unmapped values */}
              {Object.keys(validationData.unmappedValues).length > 0 && (
                <div>
                  <div style={s.sectionTitle}>Unmapped Values</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(validationData.unmappedValues).map(([field, info]) => (
                      <div key={field} style={{
                        padding: '10px 12px', borderRadius: tokens.radius.md,
                        background: 'var(--bg-input)', border: '1px solid rgba(251,191,36,0.35)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <AlertCircle size={12} color="#f59e0b" />
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{field}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                            {info.total.toLocaleString()} row{info.total !== 1 ? 's' : ''} will export as raw value
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {Object.entries(info.values).sort((a, b) => b[1] - a[1]).map(([val, count]) => (
                            <span key={val} style={{
                              fontSize: 11, fontFamily: tokens.font.mono, color: '#f59e0b',
                              background: 'rgba(251,191,36,0.1)', padding: '2px 8px', borderRadius: 3,
                            }}>
                              "{val}" x {count.toLocaleString()}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Paid amount issues */}
              {(validationData.paidAmtIssues.nonNumeric.length > 0 || validationData.paidAmtIssues.negative.length > 0) && (
                <div>
                  <div style={s.sectionTitle}>Paid Amount Issues</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { key: 'nonNumeric', label: 'Non-numeric values', list: validationData.paidAmtIssues.nonNumeric },
                      { key: 'negative',   label: 'Negative amounts',   list: validationData.paidAmtIssues.negative },
                    ].filter(g => g.list.length > 0).map(({ key, label, list }) => {
                      const overLimit = list.length > 5;
                      return (
                        <div key={key} style={{
                          padding: '10px 12px', borderRadius: tokens.radius.md,
                          background: 'var(--bg-input)', border: '1px solid rgba(231,76,60,0.35)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <AlertCircle size={12} color="var(--danger)" />
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                              {list.length.toLocaleString()} row{list.length !== 1 ? 's' : ''}
                              {overLimit ? ' (showing first 5)' : ''}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {list.slice(0, 5).map((e, i) => {
                              const isAllowed = allowedRowIndices.has(e.globalIdx);
                              return (
                                <div key={i} style={{
                                  fontSize: 11, fontFamily: tokens.font.mono,
                                  color: isAllowed ? 'var(--success)' : 'var(--danger)',
                                  background: isAllowed ? 'rgba(39,174,96,0.10)' : 'rgba(231,76,60,0.10)',
                                  padding: '3px 8px', borderRadius: 3,
                                  display: 'flex', gap: 8, alignItems: 'center',
                                }}>
                                  <span style={{ flexShrink: 0, opacity: 0.75 }}>
                                    {e.fileName ? `${e.fileName} ` : ''}row {e.localRow}
                                  </span>
                                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>&#8212;</span>
                                  <span style={{ flex: 1 }}>"{e.value}"</span>
                                  <button
                                    onClick={() => handleAllowRow(e.globalIdx)}
                                    disabled={isAllowed}
                                    style={{
                                      fontSize: 10, fontWeight: 700, padding: '1px 7px', flexShrink: 0,
                                      borderRadius: tokens.radius.sm,
                                      border: `1px solid ${isAllowed ? 'rgba(39,174,96,0.4)' : 'rgba(39,174,96,0.6)'}`,
                                      background: isAllowed ? 'rgba(39,174,96,0.15)' : 'rgba(39,174,96,0.1)',
                                      color: 'var(--success)', cursor: isAllowed ? 'default' : 'pointer',
                                      fontFamily: 'inherit',
                                    }}
                                  >{isAllowed ? '✓ Allowed' : 'Allow'}</button>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {overLimit && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{list.length} total errors</span>}
                              <button
                                onClick={() => handleAllowAll(list.map(e => e.globalIdx))}
                                disabled={list.every(e => allowedRowIndices.has(e.globalIdx))}
                                style={{
                                  fontSize: 10, fontWeight: 600, padding: '2px 8px',
                                  borderRadius: tokens.radius.sm, border: '1px solid rgba(39,174,96,0.5)',
                                  background: 'rgba(39,174,96,0.1)', color: 'var(--success)',
                                  cursor: list.every(e => allowedRowIndices.has(e.globalIdx)) ? 'default' : 'pointer',
                                }}
                              >Allow All</button>
                            </div>
                            {overLimit && (
                              <button
                                onClick={() => handleExportIssueList(
                                  `paid_amt_${key}.csv`,
                                  ['file', 'row', 'value'],
                                  list.map(e => ({ file: e.fileName ?? '', row: e.localRow, value: e.value }))
                                )}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5,
                                  fontSize: 11, fontWeight: 600, padding: '4px 10px',
                                  borderRadius: tokens.radius.sm, border: '1px solid var(--border)',
                                  background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer',
                                }}
                              >
                                <Download size={11} /> Export Errors
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty date fields */}
              {Object.keys(validationData.emptyRequiredFields).length > 0 && (
                <div>
                  <div style={s.sectionTitle}>Empty Date Fields</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(validationData.emptyRequiredFields).map(([field, rows]) => {
                      const overLimit = rows.length > 5;
                      return (
                        <div key={field} style={{
                          padding: '10px 12px', borderRadius: tokens.radius.md,
                          background: 'var(--bg-input)', border: '1px solid rgba(248,113,113,0.35)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <AlertCircle size={12} color="var(--danger)" />
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{field}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                              {rows.length.toLocaleString()} row{rows.length !== 1 ? 's' : ''} with empty values
                              {overLimit ? ' (showing first 5)' : ''}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {rows.slice(0, 5).map((e, i) => {
                              const isAllowed = allowedRowIndices.has(e.globalIdx);
                              return (
                                <div key={i} style={{
                                  fontSize: 11, fontFamily: tokens.font.mono,
                                  color: isAllowed ? 'var(--success)' : 'var(--danger)',
                                  background: isAllowed ? 'rgba(39,174,96,0.10)' : 'rgba(248,113,113,0.10)',
                                  padding: '3px 8px', borderRadius: 3,
                                  display: 'flex', gap: 8, alignItems: 'center',
                                }}>
                                  <span style={{ flex: 1, opacity: 0.75 }}>
                                    {e.fileName ? `${e.fileName} ` : ''}row {e.localRow}
                                  </span>
                                  <button
                                    onClick={() => handleAllowRow(e.globalIdx)}
                                    disabled={isAllowed}
                                    style={{
                                      fontSize: 10, fontWeight: 700, padding: '1px 7px', flexShrink: 0,
                                      borderRadius: tokens.radius.sm,
                                      border: `1px solid ${isAllowed ? 'rgba(39,174,96,0.4)' : 'rgba(39,174,96,0.6)'}`,
                                      background: isAllowed ? 'rgba(39,174,96,0.15)' : 'rgba(39,174,96,0.1)',
                                      color: 'var(--success)', cursor: isAllowed ? 'default' : 'pointer',
                                      fontFamily: 'inherit',
                                    }}
                                  >{isAllowed ? '✓ Allowed' : 'Allow'}</button>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {overLimit && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rows.length} total</span>}
                              <button
                                onClick={() => handleAllowAll(rows.map(e => e.globalIdx))}
                                disabled={rows.every(e => allowedRowIndices.has(e.globalIdx))}
                                style={{
                                  fontSize: 10, fontWeight: 600, padding: '2px 8px',
                                  borderRadius: tokens.radius.sm, border: '1px solid rgba(39,174,96,0.5)',
                                  background: 'rgba(39,174,96,0.1)', color: 'var(--success)',
                                  cursor: rows.every(e => allowedRowIndices.has(e.globalIdx)) ? 'default' : 'pointer',
                                }}
                              >Allow All</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* All clear */}
              {Object.keys(validationData.dateFieldIssues).length === 0 &&
               Object.keys(validationData.emptyRequiredFields).length === 0 &&
               validationData.dateLogicErrors.length === 0 &&
               Object.keys(validationData.unmappedValues).length === 0 &&
               validationData.paidAmtIssues.nonNumeric.length === 0 &&
               validationData.paidAmtIssues.negative.length === 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: tokens.radius.md,
                  background: 'rgba(39,174,96,0.08)', border: '1px solid rgba(39,174,96,0.25)',
                }}>
                  <CheckCircle2 size={14} color="var(--success)" />
                  <span style={{ fontSize: tokens.fontSize.sm, color: 'var(--success)' }}>
                    No formatting issues detected.
                  </span>
                </div>
              )}
            </div>

            <div style={s.modalFooter}>
              <button onClick={() => setValidationData(null)} style={s.btnOutline}>
                Cancel
              </button>
              {Object.values(validationData.dateFieldIssues).some(i => i.unparseable.length > 0) && (
                <button onClick={handleExportSkippedRows} style={s.btnOutline}>
                  <Download size={13} /> Export Skipped Rows
                </button>
              )}
              <button onClick={handleConfirmExport} style={s.btn('var(--accent)', false)}>
                <Download size={13} /> Export {exportFormat.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}
