import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Live updates (/api/live, Server-Sent Events). Pages subscribe to change kinds ("monitor",
 * "status", "incident") and reload what they show; a slow fallback poll covers dropped connections.
 *
 * Browsers allow only 6 connections per server over HTTP/1.1, and each EventSource keeps one open.
 * With a connection per tab, a few open Fudo tabs used up the limit and every other request
 * (saving a setting, loading a page) waited. So the tabs of one browser share a single connection
 * per scope: the tab holding a Web Lock opens it and forwards events to the others through a
 * BroadcastChannel; when it closes, another tab takes the lock over. Without those browser features,
 * a tab closes its connection while hidden instead.
 */
type Listener = (kinds: string[]) => void;
interface Live { connected: boolean; subscribe: (fn: Listener) => () => void }
const LiveContext = createContext<Live>({ connected: false, subscribe: () => () => {} });

/** Sent after a (re)connection: events may have been missed, so every page reloads once. */
export const ALL_KINDS = "*";

type Msg = { type: "change"; kinds: string[] } | { type: "status"; connected: boolean } | { type: "hello" };
const canShare = () => typeof BroadcastChannel !== "undefined" && typeof navigator !== "undefined" && !!navigator.locks;

/** Opens the EventSource; returns a function that closes it. */
function openSource(scope: string, onChange: (kinds: string[]) => void, onStatus: (c: boolean) => void): () => void {
  const es = new EventSource(`/api/live?scope=${encodeURIComponent(scope)}`);
  let readyBefore = false;
  es.addEventListener("ready", () => {
    onStatus(true);
    if (readyBefore) onChange([ALL_KINDS]); // reconnected: catch up
    readyBefore = true;
  });
  es.addEventListener("change", (e) => onChange((JSON.parse((e as MessageEvent).data) as { kinds: string[] }).kinds));
  es.onerror = () => onStatus(false);
  return () => { es.close(); onStatus(false); };
}

export function LiveProvider({ scope, children }: { scope: string | null; children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!scope) return;
    const emit = (kinds: string[]) => listeners.current.forEach((l) => l(kinds));

    if (!canShare()) {
      // fallback: one connection per tab, released while the tab is hidden
      let close: (() => void) | null = null;
      let opened = false;
      const sync = () => {
        if (document.hidden) { close?.(); close = null; }
        else if (!close) {
          close = openSource(scope, emit, setConnected);
          if (opened) emit([ALL_KINDS]); // back from the background: catch up on what happened meanwhile
          opened = true;
        }
      };
      sync();
      document.addEventListener("visibilitychange", sync);
      return () => { document.removeEventListener("visibilitychange", sync); close?.(); };
    }

    const name = `fudo-live:${scope}`;
    const channel = new BroadcastChannel(name);
    const stop = new AbortController();
    let leaderStatus: boolean | null = null; // set while this tab holds the connection
    const post = (m: Msg) => channel.postMessage(m);

    channel.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data;
      if (m.type === "change") emit(m.kinds);
      else if (m.type === "status") setConnected(m.connected);
      else if (m.type === "hello" && leaderStatus !== null) post({ type: "status", connected: leaderStatus });
    };
    post({ type: "hello" }); // ask the current connection holder for its status

    // whichever tab gets the lock holds the connection until it closes or changes scope
    const hold = async (takingOver: boolean) => {
      const status = (c: boolean) => { leaderStatus = c; setConnected(c); post({ type: "status", connected: c }); };
      const change = (kinds: string[]) => { emit(kinds); post({ type: "change", kinds }); };
      const close = openSource(scope, change, status);
      // taking over from a tab that closed: events may have been missed in between
      if (takingOver) change([ALL_KINDS]);
      await new Promise<void>((resolve) => stop.signal.addEventListener("abort", () => resolve(), { once: true }));
      close();
      leaderStatus = null;
    };
    // free now: this tab is the first for this scope, nothing was missed. Otherwise wait for it.
    void navigator.locks.request(name, { ifAvailable: true }, async (lock) => {
      if (lock) return hold(false);
      if (stop.signal.aborted) return;
      await navigator.locks.request(name, { signal: stop.signal }, () => hold(true)).catch(() => { /* closed or changed scope while waiting */ });
    });

    return () => { stop.abort(); channel.close(); setConnected(false); };
  }, [scope]);

  const value = useRef<Live>({ connected: false, subscribe: (fn) => { listeners.current.add(fn); return () => listeners.current.delete(fn); } });
  value.current = { ...value.current, connected };
  return <LiveContext.Provider value={value.current}>{children}</LiveContext.Provider>;
}

export const useLiveStatus = () => useContext(LiveContext).connected;

/** Runs `load` now, on relevant live events, and every `fallbackMs` as a safety net. */
export function useLiveReload(load: () => unknown, kinds: string[], fallbackMs = 60_000) {
  const live = useContext(LiveContext);
  const ref = useRef(load);
  ref.current = load;
  const key = kinds.join(",");
  useEffect(() => {
    void ref.current();
    const t = setInterval(() => void ref.current(), fallbackMs);
    const off = live.subscribe((changed) => { if (changed.includes(ALL_KINDS) || changed.some((k) => key.split(",").includes(k))) void ref.current(); });
    return () => { clearInterval(t); off(); };
  }, [live, key, fallbackMs, load]);
}
