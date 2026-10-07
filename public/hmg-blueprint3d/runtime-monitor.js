// Loaded before the renderer bundle so startup exceptions are still observable.
// The parent independently checks source, opaque origin, channel, and nonce.
(() => {
  const [nonce] = location.hash.slice(1).split('|');
  const report = () => parent.postMessage({
    channel: 'hmg-blueprint-v1',
    nonce,
    type: 'runtime-error',
    message: 'The room renderer script failed during startup. Your design data is retained.',
  }, '*');
  window.addEventListener('error', report, true);
  window.addEventListener('unhandledrejection', report);
})();
