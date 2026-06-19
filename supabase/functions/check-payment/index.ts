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
    const body = await req.json();
    const { payment_request_token, payment_token, game_slug } = body;

    if (!payment_request_token && !payment_token) {
      return Response.json(
        { error: 'Missing payment_request_token or payment_token' },
        { status: 400, headers: CORS },
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    );

    let query = supabaseClient
      .from('payment_sessions')
      .select('paid, payment_token, played');

    query = payment_request_token
      ? query.eq('payment_request_token', payment_request_token)
      : query.eq('payment_token', payment_token);

    if (game_slug) {
      query = query.eq('game_slug', game_slug);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw error;
    if (!data) {
      return Response.json({ error: 'Payment session not found' }, { status: 404, headers: CORS });
    }

    return Response.json(
      { paid: data.paid, payment_token: data.payment_token, played: data.played },
      { headers: CORS },
    );
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS });
  }
});
