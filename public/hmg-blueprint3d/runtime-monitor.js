// Loaded before renderer scripts; parent verifies source, opaque origin and nonce.
(() => {
  const [nonce] = location.hash.slice(1).split('|');
  const recoverable = new Set();
  const warn = (message) => {
    if (recoverable.has(message)) return;
    recoverable.add(message);
    parent.postMessage({channel: 'hmg-blueprint-v1', nonce, type: 'status', message}, '*');
  };
  const report = (event) => {
    // Browser layout notifications are not script exceptions. Resize work is
    // coalesced separately by the runtime; never suppress unrelated errors.
    if (event.message === 'ResizeObserver loop completed with undelivered notifications.' ||
        event.message === 'ResizeObserver loop limit exceeded') {
      warn('The browser deferred a canvas resize; the room remains available.');
      return;
    }
    if (event.target?.tagName === 'IMG') {
      warn('A surface image could not load. The room remains available; reselect the material to retry.');
      return;
    }
    // Do not relay exception text, stacks, query strings or private object URLs.
    const name = event.error?.name || event.reason?.name;
    const kind = ['TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'Error'].includes(name) ? name : 'Error';
    let file = 'renderer';
    try {
      const candidate = new URL(event.filename || event.target?.src || '', 'https://renderer.invalid/').pathname.split('/').pop();
      if (['runtime.bundle.js','blueprint3d.js','three-r69.min.js','jquery-1.11.3.js','runtime-monitor.js'].includes(candidate)) file = candidate;
    } catch {}
    const line = Number.isSafeInteger(event.lineno) && event.lineno > 0 ? event.lineno : 0;
    const column = Number.isSafeInteger(event.colno) && event.colno > 0 ? event.colno : 0;
    parent.postMessage({
      channel: 'hmg-blueprint-v1', nonce, type: 'runtime-error',
      message: `The room renderer script failed (${kind}, ${file}:${line}:${column}). Your design data is retained.`,
    }, '*');
  };
  window.addEventListener('error', report, true);
  window.addEventListener('unhandledrejection', report);
})();
