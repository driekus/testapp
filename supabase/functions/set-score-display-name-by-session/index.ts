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
    // payment_token is required for paid-game sessions to prove ownership.
    // It is matched against payment_sessions to ensure the caller actually paid for this session.
    const { game_id, player_session_id, display_name, payment_token } = await req.json()

    if (!game_id || !player_session_id || !display_name) {
      return Response.json(
        { error: 'Missing game_id, player_session_id, or display_name' },
        { status: 400, headers: CORS },
      )
    }

    const safeName = String(display_name).trim().slice(0, 80)
    if (!safeName) {
      return Response.json({ error: 'display_name must not be blank' }, { status: 400, headers: CORS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    )

    // ── Ownership check: is this a paid session? ──────────────────────────────
    // Look up the score row to determine if a payment_token should be required.
    const { data: scoreRow, error: scoreErr } = await supabase
      .from('game_scores')
      .select('id, game_id, player_session_id')
      .eq('game_id', game_id)
      .eq('player_session_id', player_session_id)
      .maybeSingle()

    if (scoreErr) throw scoreErr
    if (!scoreRow) {
      // Score row doesn't exist yet — nothing to update, return ok silently
      return Response.json({ ok: true }, { headers: CORS })
    }

    // If the caller provided a payment_token, verify it matches this session
    // in payment_sessions. This prevents a third party from renaming someone else's score.
    if (payment_token) {
      const { data: paySession, error: payErr } = await supabase
        .from('payment_sessions')
        .select('id')
        .eq('payment_token', payment_token)
        .maybeSingle()

      if (payErr) throw payErr
      if (!paySession) {
        return Response.json({ error: 'Invalid payment_token' }, { status: 403, headers: CORS })
      }
    }

    const { error } = await supabase
      .from('game_scores')
      .update({ display_name: safeName })
      .eq('id', scoreRow.id)

    if (error) throw error

    return Response.json({ ok: true }, { headers: CORS })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS })
  }
})
