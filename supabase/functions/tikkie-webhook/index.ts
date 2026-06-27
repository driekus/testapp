import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Signature verification ───────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

async function verifyHmacSignature(secret: string, body: string, signature: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const sigBytes = hexToBytes(signature);
    const bodyBytes = new TextEncoder().encode(body);
    return await crypto.subtle.verify('HMAC', key, sigBytes, bodyBytes);
  } catch {
    return false;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // Read raw body first so we can verify signature before parsing
    const rawBody = await req.text();

    const tikkieMock = String(Deno.env.get('TIKKIE_MOCK') ?? '').toLowerCase();
    const runtimeEnv = String(
      Deno.env.get('ENV')
      ?? Deno.env.get('DENO_ENV')
      ?? Deno.env.get('NODE_ENV')
      ?? Deno.env.get('VERCEL_ENV')
      ?? '',
    ).toLowerCase();
    const isProductionEnv = runtimeEnv === 'production' || runtimeEnv === 'prod';
    const isMock = tikkieMock === 'true' && !isProductionEnv;

    if (tikkieMock === 'true' && isProductionEnv) {
      return Response.json({ error: 'Mock payment is not allowed in production' }, { status: 400, headers: CORS });
    }

    if (!isMock) {
      // ── Production: verify HMAC-SHA256 signature from Tikkie ────────────────
      const webhookSecret = Deno.env.get('TIKKIE_WEBHOOK_SECRET');
      if (!webhookSecret) {
        console.error('tikkie-webhook: TIKKIE_WEBHOOK_SECRET is not set in production mode');
        return Response.json({ error: 'Webhook secret not configured' }, { status: 500, headers: CORS });
      }

      // Tikkie sends the signature as X-Tikkie-Signature (hex-encoded HMAC-SHA256 of raw body)
      const signature = req.headers.get('x-tikkie-signature') ?? req.headers.get('x-abnamro-signature');
      if (!signature) {
        return Response.json({ error: 'Missing webhook signature' }, { status: 401, headers: CORS });
      }

      const valid = await verifyHmacSignature(webhookSecret, rawBody, signature);
      if (!valid) {
        return Response.json({ error: 'Invalid webhook signature' }, { status: 401, headers: CORS });
      }
    }

    const body = JSON.parse(rawBody);
    const paymentRequestToken = body.paymentRequestToken ?? body.payment_request_token;
    const incomingPaymentToken = body.paymentToken ?? body.payment_token;

    if (!paymentRequestToken) {
      return Response.json({ error: 'Missing paymentRequestToken' }, { status: 400, headers: CORS });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    );

    const { data: session, error: fetchError } = await supabase
      .from('payment_sessions')
      .select('payment_token, paid')
      .eq('payment_request_token', paymentRequestToken)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!session) {
      return Response.json({ error: 'Payment session not found' }, { status: 404, headers: CORS });
    }

    // Idempotency: already paid → just return success with the existing token
    if (session.paid) {
      return Response.json({ ok: true, payment_token: session.payment_token }, { headers: CORS });
    }

    const paymentToken = session.payment_token ?? incomingPaymentToken ?? `mock_${crypto.randomUUID()}`;

    const { error: updateError } = await supabase
      .from('payment_sessions')
      .update({
        paid: true,
        payment_token: paymentToken,
        paid_at: new Date().toISOString(),
      })
      .eq('payment_request_token', paymentRequestToken)
      .eq('paid', false); // prevent double-update race

    if (updateError) throw updateError;

    return Response.json({ ok: true, payment_token: paymentToken }, { headers: CORS });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS });
  }
});
