// @ts-nocheck
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function fromBase64Url(value: string): Uint8Array {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importSecretKey() {
  const secret = Deno.env.get('SCORE_SESSION_SECRET') || Deno.env.get('SERVICE_ROLE_KEY');
  if (!secret) {
    throw new Error('Missing SCORE_SESSION_SECRET or SERVICE_ROLE_KEY');
  }

  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function verifyScoreSessionToken(token: string): Promise<{
  game_id: string;
  player_id: string;
  player_session_id: string;
  issued_at: number;
} | null> {
  const rawToken = String(token || '').trim();
  if (!rawToken) return null;

  const parts = rawToken.split('.');
  if (parts.length !== 2) return null;

  try {
    const payloadBytes = fromBase64Url(parts[0]);
    const signatureBytes = fromBase64Url(parts[1]);
    const key = await importSecretKey();
    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, payloadBytes);
    if (!valid) return null;

    const claims = JSON.parse(textDecoder.decode(payloadBytes));
    if (!claims?.game_id || !claims?.player_id || !claims?.player_session_id) {
      return null;
    }

    return {
      game_id: String(claims.game_id),
      player_id: String(claims.player_id),
      player_session_id: String(claims.player_session_id),
      issued_at: Number(claims.issued_at) || Date.now(),
    };
  } catch {
    return null;
  }
}

export async function requireAuthorizedScoreSession({
  gameId,
  playerSessionId,
  sessionToken,
}: {
  gameId: string;
  playerSessionId: string;
  sessionToken: string;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const claims = await verifyScoreSessionToken(sessionToken);
  if (!claims) {
    return { ok: false, error: 'Invalid session_token', status: 403 };
  }

  if (claims.game_id !== String(gameId)) {
    return { ok: false, error: 'session_token does not match game_id', status: 403 };
  }

  if (claims.player_session_id !== String(playerSessionId)) {
    return { ok: false, error: 'session_token does not match player_session_id', status: 403 };
  }

  return { ok: true };
}

