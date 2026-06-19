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
    const { payment_token, game_slug, player_name, player_phone } = await req.json();

    if (!payment_token || !game_slug) {
      return Response.json({ error: 'Missing payment_token or game_slug' }, { status: 400, headers: CORS });
    }

    const name = String(player_name ?? '').trim();
    const phone = String(player_phone ?? '').trim();

    if (!name || !phone) {
      return Response.json({ error: 'player_name and player_phone are required' }, { status: 400, headers: CORS });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    );

    const { data: session, error: fetchError } = await supabase
      .from('payment_sessions')
      .select('id, game_slug, paid')
      .eq('payment_token', payment_token)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!session) {
      return Response.json({ error: 'Payment token not found' }, { status: 404, headers: CORS });
    }
    if (session.game_slug !== game_slug) {
      return Response.json({ error: 'Payment token does not belong to this game' }, { status: 400, headers: CORS });
    }
    if (!session.paid) {
      return Response.json({ error: 'Payment is not completed' }, { status: 400, headers: CORS });
    }

    // Save name + phone only — does NOT set played:true so the game can still be started
    const { error: updateError } = await supabase
      .from('payment_sessions')
      .update({ player_name: name, player_phone: phone })
      .eq('id', session.id);

    if (updateError) throw updateError;

    return Response.json({ ok: true }, { headers: CORS });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS });
  }
});

