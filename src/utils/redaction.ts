/** Shared browser/server diagnostics scrubber. Never retain credentials in flattened text. */
const sensitiveKey = /^(?:token|access[_-]?token|refresh[_-]?token|id[_-]?token|session[_-]?token|x-session-token|authorization|auth|password|passwd|pwd|api[_-]?key|secret|client[_-]?secret|cookie|set-cookie|session|sessionid)$/i;
export function redactText(text: string): string {
  return text
    .replace(/((?:\b)(?:x-session-token|session[_-]?token|access[_-]?token|refresh[_-]?token|id[_-]?token|token|authorization|password|passwd|pwd|api[_-]?key|client[_-]?secret|secret|cookie|set-cookie|sessionid|session)["']?\s*[:=]\s*)(["'])(?:\\.|(?!\2)[^\\])*?\2/gi, '$1"[REDACTED]"')
    .replace(/\b(?:Bearer|Api-Key)\s+[^\s,;"'<>]+/gi, '[REDACTED AUTH]')
    .replace(/((?:[?&#]|\b)(?:x-session-token|session[_-]?token|access[_-]?token|refresh[_-]?token|id[_-]?token|token|authorization|password|passwd|pwd|api[_-]?key|client[_-]?secret|secret|cookie|set-cookie|sessionid|session)\s*["']?\s*[:=]\s*["']?)[^\s&;,"'<>]+/gi, '$1[REDACTED]');
}
export function redactSensitive(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactText(value);
  if (value instanceof Error) return {name:value.name,message:redactText(value.message),stack:redactText(value.stack || '')};
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    if(value.length===2 && typeof value[0]==='string' && sensitiveKey.test(value[0]))return [value[0],'[REDACTED]'];
    return value.map(item=>redactSensitive(item,seen));
  }
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sensitiveKey.test(key)?'[REDACTED]':redactSensitive(item,seen)]));
}
