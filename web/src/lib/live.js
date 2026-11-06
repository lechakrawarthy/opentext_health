import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

// One shared EventSource for the whole app; components subscribe to a throttled "version" counter.
let source = null;
const listeners = new Set();
let connected = false;
const statusListeners = new Set();

function ensureSource() {
  if (source) return;
  source = new EventSource('/api/stream');
  const fire = (e) => listeners.forEach((fn) => fn(e));
  for (const type of ['check', 'incident', 'monitor', 'data']) {
    source.addEventListener(type, (ev) => {
      try {
        fire(JSON.parse(ev.data));
      } catch {
        /* ignore */
      }
    });
  }
  source.addEventListener('hello', () => setConnected(true));
  source.onerror = () => setConnected(false);
}

function setConnected(v) {
  connected = v;
  statusListeners.forEach((fn) => fn(v));
}

export function closeLive() {
  source?.close();
  source = null;
  setConnected(false);
}

export function useLiveStatus() {
  const [c, setC] = useState(connected);
  useEffect(() => {
    ensureSource();
    statusListeners.add(setC);
    return () => statusListeners.delete(setC);
  }, []);
  return c;
}

/** Fetches `path`, then refetches when relevant live events arrive (throttled) and every `poll` ms as a fallback. */
export function useLiveQuery(path, { filter, throttle = 2500, poll = 20000, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const last = useRef(0);
  const pending = useRef(null);

  const load = useCallback(async () => {
    if (!path || !enabled) return;
    last.current = Date.now();
    try {
      const d = await api(path);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [path, enabled]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    ensureSource();
    const onEvent = (e) => {
      if (filterRef.current && !filterRef.current(e)) return;
      const wait = Math.max(0, throttle - (Date.now() - last.current));
      if (pending.current) return;
      pending.current = setTimeout(() => {
        pending.current = null;
        load();
      }, wait);
    };
    listeners.add(onEvent);
    const t = setInterval(load, poll);
    return () => {
      listeners.delete(onEvent);
      clearInterval(t);
      clearTimeout(pending.current);
      pending.current = null;
    };
  }, [load, throttle, poll, enabled]);

  return { data, error, loading, reload: load, setData };
}
