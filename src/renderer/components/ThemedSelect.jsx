import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
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
 */
export default function ThemedSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  disabled = false,
  style = {},
  minWidth = 180,
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const itemRefs = useRef([]);
  const searchBuf = useRef('');
  const searchTimer = useRef(null);
  const activeIndexRef = useRef(-1);

  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);

  const isSelectable = (opt) => opt && opt.type !== 'separator' && !opt.disabled;

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
    searchBuf.current = '';
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  }, []);

  const findMatch = useCallback((buf, fromIdx = 0) => {
    if (!buf) return -1;
    const lower = buf.toLowerCase();
    const n = options.length;
    const getTarget = (opt) => String(opt.searchLabel ?? opt.label ?? '').toLowerCase();

    // Tier 1: startsWith on the full string — preserves the "press a letter to jump" feel.
    for (let i = 0; i < n; i++) {
      const idx = (fromIdx + i) % n;
      const opt = options[idx];
      if (!isSelectable(opt)) continue;
      if (getTarget(opt).startsWith(lower)) return idx;
    }
    // Tier 2: startsWith on any token (split on _ - space / : .) — catches "gndr" → EMP_GNDR_CD.
    for (let i = 0; i < n; i++) {
      const idx = (fromIdx + i) % n;
      const opt = options[idx];
      if (!isSelectable(opt)) continue;
      const tokens = getTarget(opt).split(/[_\-\s/:.]+/).filter(Boolean);
      if (tokens.some((t) => t.startsWith(lower))) return idx;
    }
    // Tier 3: plain substring anywhere.
    for (let i = 0; i < n; i++) {
      const idx = (fromIdx + i) % n;
      const opt = options[idx];
      if (!isSelectable(opt)) continue;
      if (getTarget(opt).includes(lower)) return idx;
    }
    return -1;
  }, [options]);

  const navigateActive = useCallback((dir) => {
    const n = options.length;
    if (!n) return;
    let i = activeIndexRef.current;
    for (let step = 0; step < n; step++) {
      i = (i + dir + n) % n;
      if (isSelectable(options[i])) {
        setActiveIndex(i);
        return;
      }
    }
  }, [options]);

  const handleTypeahead = useCallback((char) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const lower = char.toLowerCase();
    const extended = searchBuf.current + lower;
    let idx = findMatch(extended, 0);
    let nextBuf;
    if (idx >= 0) {
      nextBuf = extended;
    } else if (searchBuf.current.length > 0) {
      // Couldn't extend — restart with just this char, advance past current
      const startFrom = activeIndexRef.current >= 0 ? activeIndexRef.current + 1 : 0;
      idx = findMatch(lower, startFrom);
      nextBuf = idx >= 0 ? lower : '';
    } else {
      // Single char, same as buffer length 0 — search from after current
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

  // Click outside / Escape / keyboard navigation while open
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
        for (let i = 0; i < options.length; i++) if (isSelectable(options[i])) { setActiveIndex(i); break; }
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        for (let i = options.length - 1; i >= 0; i--) if (isSelectable(options[i])) { setActiveIndex(i); break; }
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const idx = activeIndexRef.current;
        if (idx >= 0) {
          const opt = options[idx];
          if (isSelectable(opt)) {
            onChange(opt.value);
            close();
          }
        }
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
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
  }, [open, close, navigateActive, handleTypeahead, options, onChange]);

  // Scroll active item into view as it changes
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const toggle = useCallback(() => {
    if (disabled) return;
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      // Flip up if there isn't room below.
      const spaceBelow = window.innerHeight - r.bottom;
      const flipUp = spaceBelow < 240 && r.top > 240;
      setCoords({
        left: r.left,
        top: flipUp ? null : r.bottom + 4,
        bottom: flipUp ? window.innerHeight - r.top + 4 : null,
        width: r.width,
      });
      // Initialize activeIndex to the current selection, or first selectable.
      const selIdx = options.findIndex((o) => o && o.value === value);
      setActiveIndex(selIdx >= 0 ? selIdx : options.findIndex(isSelectable));
    }
    setOpen((o) => !o);
  }, [disabled, open, options, value]);

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
      const lower = e.key.toLowerCase();
      const idx = findMatch(lower, 0);
      if (idx >= 0) {
        searchBuf.current = lower;
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
          searchBuf.current = '';
          searchTimer.current = null;
        }, 600);
        // Open popover anchored to trigger, with this item active.
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
        padding: '4px 0',
        maxHeight: 280,
        overflowY: 'auto',
        zIndex: 9999,
        animation: 'fadeIn 0.1s ease',
      }
    : null;

  const itemStyle = (selected, disabled, active) => ({
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%',
    padding: '8px 14px',
    fontSize: 13,
    color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
    background: active ? 'var(--bg-hover)' : 'transparent',
    border: 'none',
    cursor: disabled ? 'default' : 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    fontWeight: selected ? 600 : 400,
    opacity: disabled ? 0.5 : 1,
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
          {options.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>
              No options
            </div>
          )}
          {options.map((opt, i) => {
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
        </div>,
        document.body
      )}
    </>
  );
}
