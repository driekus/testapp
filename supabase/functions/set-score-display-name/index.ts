// @ts-nocheck
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
    const { game_id, player_id, display_name } = await req.json()

    if (!game_id || !player_id) {
      return Response.json({ error: 'Missing game_id or player_id' }, { status: 400, headers: CORS })
    }

    const safeName = String(display_name ?? '').trim()
    if (!safeName) {
      return Response.json({ error: 'Missing display_name' }, { status: 400, headers: CORS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    )

    const { error } = await supabase
      .from('game_scores')
      .update({
        display_name: safeName,
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', game_id)
      .eq('player_id', player_id)

    if (error) throw error

    return Response.json({ ok: true }, { headers: CORS })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS })
  }
})

