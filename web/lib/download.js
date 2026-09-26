'use client';
import { useState } from 'react';
import { api, openExternal } from './api';

// Shared by [8] library and [9] order history: both spend the same download quota.
export function useDownload(onDone) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState({});
  async function download(itemId) {
    setBusy(itemId); setError((e) => ({ ...e, [itemId]: null }));
    try {
      const r = await api(`/library/${itemId}/download`, { method: 'POST' });
      openExternal(r.url);
      onDone?.(itemId, r.downloadsLeft);
    } catch (e) {
      setError((x) => ({ ...x, [itemId]: e.message }));
    } finally {
      setBusy(null);
    }
  }
  return { download, busy, error };
}
