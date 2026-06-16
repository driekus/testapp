import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const {
      payment_token,
      game_slug,
      player_name,
      player_phone,
      letters_collected,
    } = await req.json()

    if (!payment_token || !game_slug) {
      return Response.json({ error: 'Missing payment_token or game_slug' }, { status: 400, headers: CORS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    )

    const { data: session, error: fetchError } = await supabase
      .from('payment_sessions')
      .select('id, game_slug, paid, played')
      .eq('payment_token', payment_token)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!session) {
      return Response.json({ error: 'Payment token not found' }, { status: 404, headers: CORS })
    }
    if (session.game_slug !== game_slug) {
      return Response.json({ error: 'Payment token does not belong to this game' }, { status: 400, headers: CORS })
    }
    if (!session.paid) {
      return Response.json({ error: 'Payment is not completed' }, { status: 400, headers: CORS })
    }
    if (session.played) {
      return Response.json({ ok: true, already_played: true }, { headers: CORS })
    }

    const { error: updateError } = await supabase
      .from('payment_sessions')
      .update({
        played: true,
        player_name: String(player_name ?? '').trim() || null,
        player_phone: String(player_phone ?? '').trim() || null,
        letters_collected: Array.isArray(letters_collected) ? letters_collected : [],
        played_at: new Date().toISOString(),
      })
      .eq('id', session.id)

    if (updateError) throw updateError

    return Response.json({ ok: true }, { headers: CORS })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS })
  }
})

