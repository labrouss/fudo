import { t } from "../i18n";
import { useEffect, useRef, type ReactNode } from "react";

/** Modal built on <dialog>: focus trapping, Esc to close and inert background come from the browser. */
export function Dialog({ title, open, onClose, children, wide }: { title: string; open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // showModal() focuses the first control (the close button); a field marked data-autofocus takes the focus instead
    if (open && !d.open) { d.showModal(); d.querySelector<HTMLElement>("[data-autofocus]")?.focus(); }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={wide ? "dialog dialog--wide" : "dialog"} onClose={onClose} aria-labelledby="dialog-title">
      {open && (
        <>
          <header className="dialog__head">
            <h2 id="dialog-title">{title}</h2>
            <button type="button" className="icon-btn" aria-label={t("ui.close")} onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>
          <div className="dialog__body">{children}</div>
        </>
      )}
    </dialog>
  );
}
