// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function sortRows(a: any, b: any) {
  if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0)
  if ((a.total_answer_time_ms ?? 0) !== (b.total_answer_time_ms ?? 0)) {
    return (a.total_answer_time_ms ?? 0) - (b.total_answer_time_ms ?? 0)
  }
  return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { game_id, player_id, player_session_id } = await req.json()

    if (!game_id) {
      return Response.json({ error: 'Missing game_id' }, { status: 400, headers: CORS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await supabase
      .from('game_scores')
      .select('player_id, player_session_id, display_name, score, total_answer_time_ms, created_at')
      .eq('game_id', game_id)

    if (error) throw error

    const ranked = (data ?? [])
      .slice()
      .sort(sortRows)
      .map((row, index) => ({
        rank: index + 1,
        player_id: row.player_id,
        player_session_id: row.player_session_id,
        display_name: row.display_name,
        score: Number(row.score || 0),
        total_answer_time_ms: Number(row.total_answer_time_ms || 0),
      }))

    const top = ranked.slice(0, 3)
    const me = player_session_id
      ? ranked.find((row) => row.player_session_id === player_session_id) ?? null
      : null
    const mine = player_id
      ? ranked.filter((row) => row.player_id === player_id).slice(0, 3)
      : []

    return Response.json({ top, me, mine }, { headers: CORS })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS })
  }
})



