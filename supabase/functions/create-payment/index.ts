import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { game_slug } = await req.json();
    if (!game_slug) {
      return Response.json({ error: 'Missing game_slug' }, { status: 400, headers: CORS });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    );

    const { data: game, error: gameError } = await supabaseClient
      .from('games')
      .select('display_name, price_in_cents, requires_payment')
      .eq('slug', game_slug)
      .maybeSingle();

    if (gameError) {
      return Response.json({ error: gameError.message }, { status: 500, headers: CORS });
    }
    if (!game) return Response.json({ error: 'Game not found' }, { status: 404, headers: CORS });
    if (!game.requires_payment) {
      return Response.json({ error: 'Game does not require payment' }, { status: 400, headers: CORS });
    }

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
    const amountInCents: number = game.price_in_cents ?? 0;

    let paymentRequestToken: string;
    let paymentUrl: string;

    if (isMock) {
      paymentRequestToken = crypto.randomUUID();
      const origin = req.headers.get('origin') || Deno.env.get('APP_BASE_URL') || '';
      paymentUrl = `${origin}/mock-payment.html?t=${paymentRequestToken}&slug=${encodeURIComponent(game_slug)}&amount=${amountInCents}`;
    } else {
      const apiKey = Deno.env.get('TIKKIE_API_KEY')!;
      const appToken = Deno.env.get('TIKKIE_APP_TOKEN')!;
      const baseUrl = Deno.env.get('TIKKIE_BASE_URL') ?? 'https://api.abnamro.com/v2/tikkie';

      const description = (game.display_name as string).slice(0, 35);
      const tikkieRes = await fetch(`${baseUrl}/paymentrequests`, {
        method: 'POST',
        headers: {
          'API-Key': apiKey,
          'X-App-Token': appToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description, amountInCents }),
      });
      if (!tikkieRes.ok) {
        const errText = await tikkieRes.text();
        return Response.json({ error: `Tikkie API error: ${errText}` }, { status: 502, headers: CORS });
      }
      const tikkieData = await tikkieRes.json();
      paymentRequestToken = tikkieData.paymentRequestToken;
      paymentUrl = tikkieData.url;
    }

    const { error: insertError } = await supabaseClient
      .from('payment_sessions')
      .insert({ game_slug, payment_request_token: paymentRequestToken, amount_in_cents: amountInCents });

    if (insertError) {
      return Response.json({ error: insertError.message }, { status: 500, headers: CORS });
    }

    return Response.json({ paymentRequestToken, url: paymentUrl }, { headers: CORS });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS });
  }
});
