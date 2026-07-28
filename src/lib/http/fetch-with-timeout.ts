const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Executa fetch com prazo máximo. Quando o chamador já fornece um signal,
 * ambos os cancelamentos (chamador e timeout) continuam válidos.
 */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;

  return fetch(input, { ...init, signal });
}
