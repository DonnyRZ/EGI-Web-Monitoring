"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconChevronDown } from "./icons";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
}

interface MenuPos {
  top: number;
  left: number;
  width: number;
  openUp: boolean;
}

export function Select({
  value,
  onChange,
  options,
  id,
  "aria-label": ariaLabel,
  disabled = false,
  className = "",
  style,
  placeholder = "Pilih…",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selected = options.find((o) => o.value === value);
  const selectedIndex = options.findIndex((o) => o.value === value);

  useEffect(() => {
    setMounted(true);
  }, []);

  function updatePos() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuMax = 260;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuMax + 12 && rect.top > spaceBelow;
    setPos({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      openUp,
    });
  }

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
    const idx = selectedIndex >= 0 ? selectedIndex : 0;
    setHighlight(idx);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;

    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onReposition() {
      updatePos();
    }

    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || highlight < 0) return;
    const el = listRef.current?.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  function commit(next: string) {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveHighlight(delta: number) {
    if (options.length === 0) return;
    setHighlight((prev) => {
      const base = prev < 0 ? (selectedIndex >= 0 ? selectedIndex : 0) : prev;
      return (base + delta + options.length) % options.length;
    });
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (e.key === "ArrowDown") moveHighlight(1);
      else if (e.key === "ArrowUp") moveHighlight(-1);
      else if (e.key === "Enter" || e.key === " ") {
        if (highlight >= 0 && options[highlight]) commit(options[highlight].value);
      }
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setHighlight(0);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setHighlight(options.length - 1);
    }
  }

  const menu =
    open && mounted && pos
      ? createPortal(
          <ul
            ref={listRef}
            id={listboxId}
            className={`select-menu ${pos.openUp ? "up" : ""}`}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            style={{
              top: pos.openUp ? "auto" : pos.top,
              bottom: pos.openUp ? window.innerHeight - pos.top : "auto",
              left: pos.left,
              width: pos.width,
            }}
          >
            {options.length === 0 ? (
              <li className="select-empty" role="presentation">
                Tidak ada pilihan
              </li>
            ) : (
              options.map((opt, i) => {
                const isSelected = opt.value === value;
                const isActive = i === highlight;
                const optionKey = `${i}:${opt.value || "empty"}`;
                return (
                  <li key={optionKey} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`select-option ${isSelected ? "selected" : ""} ${isActive ? "active" : ""}`}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => commit(opt.value)}
                    >
                      <span>{opt.label}</span>
                      {isSelected ? <IconCheck className="select-check" aria-hidden /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={`select ${open ? "open" : ""} ${disabled ? "disabled" : ""} ${className}`.trim()}
      style={style}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={`select-value ${selected ? "" : "placeholder"}`}>
          {selected?.label ?? placeholder}
        </span>
        <IconChevronDown className="select-chevron" aria-hidden />
      </button>
      {menu}
    </div>
  );
}
