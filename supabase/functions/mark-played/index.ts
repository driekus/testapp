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

    // ── Atomic mark-as-played ─────────────────────────────────────────────────
    // Filter on played=false in the update itself so concurrent calls cannot
    // both succeed. If another request already set played=true, no row is
    // matched and we return already_played without throwing.
    const { data: updated, error: updateError } = await supabase
      .from('payment_sessions')
      .update({
        played: true,
        player_name: String(player_name ?? '').trim() || null,
        player_phone: String(player_phone ?? '').trim() || null,
        letters_collected: Array.isArray(letters_collected) ? letters_collected : [],
        played_at: new Date().toISOString(),
      })
      .eq('id', session.id)
      .eq('played', false) // atomic guard — only one concurrent call wins
      .select('id')

    if (updateError) throw updateError

    // If no row was returned, a concurrent call already marked it as played
    if (!updated || updated.length === 0) {
      return Response.json({ ok: true, already_played: true }, { headers: CORS })
    }

    return Response.json({ ok: true }, { headers: CORS })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS })
  }
})
