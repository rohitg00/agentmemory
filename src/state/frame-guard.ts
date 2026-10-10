// The pinned engine rejects WebSocket frames over 16 MiB; an oversized
// function result drops the worker and 404s every endpoint. Refuse the
// payload as one clean error instead. The cap sits under the frame limit
// to leave headroom for the SDK's framing overhead.
const FRAME_LIMIT_BYTES = 16 * 1024 * 1024;
export const SAFE_PAYLOAD_BYTES = 15 * 1024 * 1024;

export type OversizedPayload = {
  success: false;
  error: string;
  oversized: true;
  bytes: number;
  limitBytes: number;
};

export function payloadByteLength(payload: unknown): number {
  return Buffer.byteLength(JSON.stringify(payload) ?? "", "utf8");
}

export function oversizedPayloadError(
  bytes: number,
  hint: string,
): OversizedPayload {
  const mib = (bytes / (1024 * 1024)).toFixed(1);
  return {
    success: false,
    error: `Response is ${mib} MiB, over the ~${SAFE_PAYLOAD_BYTES / (1024 * 1024)} MiB engine transport frame limit; ${hint}`,
    oversized: true,
    bytes,
    limitBytes: SAFE_PAYLOAD_BYTES,
  };
}

// Serializes once; callers that also return the payload pay a second
// serialization, acceptable on these cold export paths.
export function checkPayloadFrameSize(
  payload: unknown,
  hint: string,
): OversizedPayload | null {
  const bytes = payloadByteLength(payload);
  if (bytes <= SAFE_PAYLOAD_BYTES) return null;
  return oversizedPayloadError(bytes, hint);
}

export const FRAME_LIMIT_BYTES_FOR_TEST = FRAME_LIMIT_BYTES;
