import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';
import { tokens } from '../styles/theme';

/**
 * Drop-in themed replacement for native <select>. Same closed appearance,
 * but the open popover matches the rest of the app's themed menus
 * (var(--bg-card), var(--border), var(--bg-hover) on hover) so it doesn't
 * fall back to the grey OS-rendered list.
 *
 * Props:
 *   value        — current value (string | number | null)
 *   onChange(v)  — called with the picked value
 *   options      — Array of { value, label, disabled? } or { type: 'separator' }
 *   placeholder  — text shown when nothing is selected
 *   disabled     — when true, the trigger is non-interactive
 *   style        — extra styles applied to the trigger
 *   minWidth     — minimum width in px (default 180)
 *   searchable   — when true, shows a filter input at the top of the popover
 */
export default function ThemedSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  disabled = false,
  style = {},
  minWidth = 180,
  searchable = false,
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const itemRefs = useRef([]);
  const searchInputRef = useRef(null);
  const searchBuf = useRef('');
  const searchTimer = useRef(null);
  const activeIndexRef = useRef(-1);

  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);

  const isSelectable = (opt) => opt && opt.type !== 'separator' && !opt.disabled;

  const visibleOptions = useMemo(() => {
    if (!searchable || !searchQuery.trim()) return options;
    const q = searchQuery.trim().toLowerCase();
    return options.filter((opt) => {
      if (!opt || opt.type === 'separator') return false;
      return (
        String(opt.label ?? '').toLowerCase().includes(q) ||
        String(opt.value ?? '').toLowerCase().includes(q)
      );
    });
  }, [options, searchQuery, searchable]);

  const visibleOptionsRef = useRef(visibleOptions);
  useEffect(() => { visibleOptionsRef.current = visibleOptions; }, [visibleOptions]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
    setSearchQuery('');
    searchBuf.current = '';
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  }, []);

  const findMatch = useCallback((buf, fromIdx = 0) => {
    if (!buf) return -1;
    const lower = buf.toLowerCase();
    const list = visibleOptionsRef.current;
    const n = list.length;
    const getTarget = (opt) => String(opt.searchLabel ?? opt.label ?? '').toLowerCase();

    for (let i = 0; i < n; i++) {
      const idx = (fromIdx + i) % n;
      const opt = list[idx];
      if (!isSelectable(opt)) continue;
      if (getTarget(opt).startsWith(lower)) return idx;
    }
    for (let i = 0; i < n; i++) {
      const idx = (fromIdx + i) % n;
      const opt = list[idx];
      if (!isSelectable(opt)) continue;
      const toks = getTarget(opt).split(/[_\-\s/:.]+/).filter(Boolean);
      if (toks.some((t) => t.startsWith(lower))) return idx;
    }
    for (let i = 0; i < n; i++) {
      const idx = (fromIdx + i) % n;
      const opt = list[idx];
      if (!isSelectable(opt)) continue;
      if (getTarget(opt).includes(lower)) return idx;
    }
    return -1;
  }, []);

  const navigateActive = useCallback((dir) => {
    const list = visibleOptionsRef.current;
    const n = list.length;
    if (!n) return;
    let i = activeIndexRef.current;
    if (i < 0) i = dir > 0 ? -1 : n;
    for (let step = 0; step < n; step++) {
      i = (i + dir + n) % n;
      if (isSelectable(list[i])) { setActiveIndex(i); return; }
    }
  }, []);

  const selectActive = useCallback(() => {
    const idx = activeIndexRef.current;
    if (idx < 0) return;
    const opt = visibleOptionsRef.current[idx];
    if (opt && isSelectable(opt)) { onChange(opt.value); close(); }
  }, [onChange, close]);

  const handleTypeahead = useCallback((char) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const lower = char.toLowerCase();
    const extended = searchBuf.current + lower;
    let idx = findMatch(extended, 0);
    let nextBuf;
    if (idx >= 0) {
      nextBuf = extended;
    } else if (searchBuf.current.length > 0) {
      const startFrom = activeIndexRef.current >= 0 ? activeIndexRef.current + 1 : 0;
      idx = findMatch(lower, startFrom);
      nextBuf = idx >= 0 ? lower : '';
    } else {
      const startFrom = activeIndexRef.current >= 0 ? activeIndexRef.current + 1 : 0;
      idx = findMatch(lower, startFrom);
      nextBuf = idx >= 0 ? lower : '';
    }
    searchBuf.current = nextBuf;
    if (idx >= 0) setActiveIndex(idx);
    searchTimer.current = setTimeout(() => {
      searchBuf.current = '';
      searchTimer.current = null;
    }, 600);
  }, [findMatch]);

  // Auto-focus the search input when the popover opens in searchable mode.
  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open, searchable]);

  // Click outside / Escape / keyboard navigation while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (popRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab')    { close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); navigateActive(1); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); navigateActive(-1); return; }
      if (e.key === 'Home') {
        e.preventDefault();
        const list = visibleOptionsRef.current;
        for (let i = 0; i < list.length; i++) if (isSelectable(list[i])) { setActiveIndex(i); break; }
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        const list = visibleOptionsRef.current;
        for (let i = list.length - 1; i >= 0; i--) if (isSelectable(list[i])) { setActiveIndex(i); break; }
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectActive();
        return;
      }
      // Skip typeahead when searchable — the input captures character keys directly.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !searchable) {
        e.preventDefault();
        handleTypeahead(e.key);
      }
    };
    const onScroll = (e) => {
      if (popRef.current?.contains(e.target)) return;
      close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close, navigateActive, handleTypeahead, selectActive, searchable]);

  // Scroll active item into view as it changes.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const toggle = useCallback(() => {
    if (disabled) return;
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const flipUp = spaceBelow < 240 && r.top > 240;
      setCoords({
        left: r.left,
        top: flipUp ? null : r.bottom + 4,
        bottom: flipUp ? window.innerHeight - r.top + 4 : null,
        width: r.width,
      });
      const list = visibleOptionsRef.current;
      const selIdx = list.findIndex((o) => o && o.value === value);
      setActiveIndex(selIdx >= 0 ? selIdx : (searchable ? -1 : list.findIndex(isSelectable)));
    }
    setOpen((o) => !o);
  }, [disabled, open, value, searchable]);

  // Closed-state keyboard handling on the trigger itself.
  const onTriggerKey = (e) => {
    if (disabled || open) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      toggle();
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (searchable) {
        toggle();
      } else {
        const lower = e.key.toLowerCase();
        const idx = findMatch(lower, 0);
        if (idx >= 0) {
          searchBuf.current = lower;
          if (searchTimer.current) clearTimeout(searchTimer.current);
          searchTimer.current = setTimeout(() => {
            searchBuf.current = '';
            searchTimer.current = null;
          }, 600);
          if (btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - r.bottom;
            const flipUp = spaceBelow < 240 && r.top > 240;
            setCoords({
              left: r.left,
              top: flipUp ? null : r.bottom + 4,
              bottom: flipUp ? window.innerHeight - r.top + 4 : null,
              width: r.width,
            });
          }
          setActiveIndex(idx);
          setOpen(true);
        } else {
          toggle();
        }
      }
    }
  };

  // Search input — stopPropagation on navigation keys so the document listener
  // doesn't also handle them.
  const onSearchKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') { e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowDown') { e.stopPropagation(); e.preventDefault(); navigateActive(1); return; }
    if (e.key === 'ArrowUp') { e.stopPropagation(); e.preventDefault(); navigateActive(-1); return; }
    if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); selectActive(); return; }
  };

  const selected = options.find((o) => o && o.value === value);

  const triggerStyle = {
    width: '100%',
    padding: '8px 36px 8px 12px',
    borderRadius: tokens.radius.md,
    border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
    background: 'var(--bg-input)',
    color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
    fontSize: 13,
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    textAlign: 'left',
    minWidth,
    position: 'relative',
    transition: 'border-color 150ms ease, background-color 150ms ease',
    fontFamily: 'inherit',
    opacity: disabled ? 0.6 : 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    ...style,
  };

  const popStyle = coords
    ? {
        position: 'fixed',
        left: coords.left,
        ...(coords.top != null ? { top: coords.top } : {}),
        ...(coords.bottom != null ? { bottom: coords.bottom } : {}),
        width: Math.max(coords.width, minWidth),
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: tokens.radius.md,
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        maxHeight: searchable ? 320 : 280,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 9999,
        animation: 'fadeIn 0.1s ease',
      }
    : null;

  const itemStyle = (isSelected, isDisabled, isActive) => ({
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%',
    padding: '8px 14px',
    fontSize: 13,
    color: isDisabled ? 'var(--text-muted)' : 'var(--text-primary)',
    background: isActive ? 'var(--bg-hover)' : 'transparent',
    border: 'none',
    cursor: isDisabled ? 'default' : 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    fontWeight: isSelected ? 600 : 400,
    opacity: isDisabled ? 0.5 : 1,
  });

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        onKeyDown={onTriggerKey}
        disabled={disabled}
        style={triggerStyle}
      >
        {selected?.label ?? placeholder}
        <ChevronDown
          size={14}
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
            color: 'var(--text-muted)',
            transition: 'transform 150ms ease',
          }}
        />
      </button>

      {open && coords && createPortal(
        <div ref={popRef} style={popStyle}>
          {searchable && (
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={12}
                  style={{
                    position: 'absolute',
                    left: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setActiveIndex(-1); }}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Search columns…"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '5px 8px 5px 26px',
                    borderRadius: tokens.radius.sm,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>
          )}
          <div style={{ overflowY: 'auto', padding: '4px 0', flex: '1 1 auto' }}>
            {visibleOptions.length === 0 && (
              <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>
                No options
              </div>
            )}
            {visibleOptions.map((opt, i) => {
              if (opt?.type === 'separator') {
                return (
                  <div
                    key={`sep-${i}`}
                    style={{ height: 1, background: 'var(--border-light)', margin: '4px 0' }}
                  />
                );
              }
              const isSelected = opt.value === value;
              const isActive = activeIndex === i;
              return (
                <button
                  key={opt.value ?? `opt-${i}`}
                  ref={(el) => { itemRefs.current[i] = el; }}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => {
                    if (opt.disabled) return;
                    onChange(opt.value);
                    close();
                  }}
                  onMouseEnter={(e) => {
                    if (!opt.disabled) {
                      e.currentTarget.style.background = 'var(--bg-hover)';
                      setActiveIndex(i);
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = activeIndexRef.current === i
                      ? 'var(--bg-hover)' : 'transparent';
                  }}
                  style={itemStyle(isSelected, opt.disabled, isActive)}
                >
                  <Check
                    size={12}
                    style={{
                      color: isSelected ? 'var(--accent)' : 'transparent',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {opt.label}
                    </span>
                    {opt.sublabel && (
                      <span style={{
                        display: 'block', fontSize: 11, color: 'var(--text-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        marginTop: 1, fontFamily: 'monospace',
                      }}>
                        {opt.sublabel}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
