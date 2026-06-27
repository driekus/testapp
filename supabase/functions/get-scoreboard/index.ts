// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function sortRows(a: any, b: any) {
  if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
  if ((a.total_answer_time_ms ?? 0) !== (b.total_answer_time_ms ?? 0)) {
    return (a.total_answer_time_ms ?? 0) - (b.total_answer_time_ms ?? 0);
  }
  return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
}

function toPublicRow(row: any, rank: number, playerId: string) {
  return {
    rank,
    display_name: row.display_name,
    score: Number(row.score || 0),
    total_answer_time_ms: Number(row.total_answer_time_ms || 0),
    is_me: Boolean(playerId) && row.player_id === playerId,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { game_id, player_id, player_session_id } = await req.json();

    if (!game_id) {
      return Response.json({ error: 'Missing game_id' }, { status: 400, headers: CORS });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await supabase
      .from('game_scores')
      .select('player_id, player_session_id, display_name, score, total_answer_time_ms, created_at')
      .eq('game_id', game_id);

    if (error) throw error;

    const ranked = (data ?? []).slice().sort(sortRows);

    const top = ranked.slice(0, 3).map((row, index) => toPublicRow(row, index + 1, String(player_id ?? '')));
    const me = player_session_id
      ? (() => {
          const index = ranked.findIndex((row) => row.player_session_id === player_session_id);
          return index === -1 ? null : toPublicRow(ranked[index], index + 1, String(player_id ?? ''));
        })()
      : null;
    const mine = player_id
      ? ranked
          .map((row, index) => ({ row, rank: index + 1 }))
          .filter(({ row }) => row.player_id === player_id)
          .slice(0, 3)
          .map(({ row, rank }) => toPublicRow(row, rank, String(player_id ?? '')))
      : [];

    return Response.json({ top, me, mine }, { headers: CORS });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS });
  }
});



