"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

type ElementRef = RefObject<HTMLElement | null>;

export type ViewportMode = "compact" | "medium" | "expanded";

function viewportMode(width: number): ViewportMode {
  if (width < 768) return "compact";
  if (width < 1100) return "medium";
  return "expanded";
}

/** Subscribe to layout capacity rather than guessing a device type. */
export function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>(() => typeof window === "undefined" ? "expanded" : viewportMode(window.innerWidth));
  useEffect(() => {
    const onResize = () => setMode(viewportMode(window.innerWidth));
    window.addEventListener("resize", onResize, { passive: true });
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return mode;
}

function focusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex='0']",
    ),
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
}

/** Lock the document behind a mobile drawer/modal while preserving prior state. */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [active]);
}

/** Keep keyboard focus inside a modal/drawer and return it to the trigger. */
export function useDialogFocus(
  active: boolean,
  containerRef: ElementRef,
  returnFocusRef?: ElementRef,
  onEscape?: () => void,
  initialFocusRef?: ElementRef,
) {
  useEffect(() => {
    if (!active || !containerRef.current) return;
    const previous = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const focusInitial = () => {
      const preferred = initialFocusRef?.current;
      const first = preferred || focusableElements(container)[0];
      first?.focus();
    };
    const frame = window.requestAnimationFrame(focusInitial);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onEscape?.();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusableElements(container);
      if (elements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      container.removeEventListener("keydown", onKeyDown);
      (returnFocusRef?.current || previous)?.focus?.();
    };
  }, [active, containerRef, initialFocusRef, onEscape, returnFocusRef]);
}

export function ResponsiveOverlay({
  title,
  eyebrow,
  children,
  footer,
  onClose,
  returnFocusRef,
  closeOnBackdrop = true,
  className = "",
  labelledBy,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  returnFocusRef?: ElementRef;
  closeOnBackdrop?: boolean;
  className?: string;
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const generatedId = useId();
  const titleId = labelledBy || `overlay-title-${generatedId}`;
  const handleEscape = useCallback(() => onClose(), [onClose]);

  useBodyScrollLock(true);
  useDialogFocus(true, panelRef, returnFocusRef, handleEscape, closeRef);

  return (
    <div
      className="responsive-overlay-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        className={`responsive-overlay ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="responsive-overlay-header">
          <div className="responsive-overlay-heading">
            {eyebrow ? <span className="drawer-kicker">{eyebrow}</span> : null}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label={`Tutup ${title}`}>
            ×
          </button>
        </header>
        <div className="responsive-overlay-content">{children}</div>
        {footer ? <footer className="responsive-overlay-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function FilterSheet({
  open,
  title,
  description,
  activeCount,
  children,
  onClose,
  onApply,
  onReset,
}: {
  open: boolean;
  title: string;
  description?: string;
  activeCount: number;
  children: ReactNode;
  onClose: () => void;
  onApply?: () => void;
  onReset?: () => void;
}) {
  if (!open) return null;
  return (
    <ResponsiveOverlay
      title={title}
      eyebrow="Filter"
      className="filter-sheet"
      onClose={onClose}
      footer={
        <>
          {onReset ? <button type="button" className="btn btn-neutral" onClick={onReset}>Reset semua</button> : null}
          <div className="responsive-overlay-footer-actions">
            <button type="button" className="btn" onClick={onClose}>Batal</button>
            <button type="button" className="btn btn-primary" onClick={onApply ?? onClose}>Terapkan{activeCount > 0 ? ` · ${activeCount}` : ""}</button>
          </div>
        </>
      }
    >
      {description ? <p className="responsive-overlay-description">{description}</p> : null}
      <p className="filter-sheet-count">{activeCount ? `${activeCount} filter aktif` : "Belum ada filter aktif"}</p>
      <div className="filter-sheet-fields">{children}</div>
    </ResponsiveOverlay>
  );
}
