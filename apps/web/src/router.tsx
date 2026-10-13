import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

/** Minimal history-based router (a full router arrives with the larger UI in Phase 2). */
const listeners = new Set<() => void>();

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  listeners.forEach((l) => l());
}

/** Called after in-app navigation, back/forward and hash changes; returns the unsubscribe function. */
export function onNavigate(fn: () => void): () => void {
  listeners.add(fn);
  window.addEventListener("popstate", fn);
  window.addEventListener("hashchange", fn);
  return () => { listeners.delete(fn); window.removeEventListener("popstate", fn); window.removeEventListener("hashchange", fn); };
}

export function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    listeners.add(update);
    window.addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return path;
}

export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  function handle(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(href);
  }
  return <a href={href} onClick={handle} {...rest} />;
}
