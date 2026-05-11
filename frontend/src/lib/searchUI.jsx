import { useState, useEffect } from 'react';

// Case-insensitive highlight helper: wraps the portion of `text` that
// matches `query` with a green-tinted <mark>. Escapes regex metachars
// in the query so punctuation in user input doesn't explode.
export function Highlight({ text, query }) {
  if (!text || !query || query.length < 2) return text || null;
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const re = new RegExp('(' + safe + ')', 'ig');
    const parts = String(text).split(re);
    return (
      <>
        {parts.map((p, i) =>
          re.test(p)
            ? <mark key={i} style={{ background: 'rgba(5,150,105,0.15)', color: 'inherit', padding: 0, borderRadius: 2 }}>{p}</mark>
            : <span key={i}>{p}</span>
        )}
      </>
    );
  } catch {
    return text;
  }
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
