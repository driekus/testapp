import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuthorizedScoreSession } from './scoreSession.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS });
  }

  try {
    const { game_id, player_session_id, display_name, session_token } = await req.json();

    if (!game_id || !player_session_id || !display_name || !session_token) {
      return Response.json(
        { error: 'Missing game_id, player_session_id, display_name, or session_token' },
        { status: 400, headers: CORS }
      );
    }

    const safeName = String(display_name).trim().slice(0, 80);
    if (!safeName) {
      return Response.json({ error: 'display_name must not be blank' }, { status: 400, headers: CORS });
    }

    const normalizedSessionId = String(player_session_id ?? '').trim();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    );

    const sessionAuth = await requireAuthorizedScoreSession({
      gameId: game_id,
      playerSessionId: normalizedSessionId,
      sessionToken: String(session_token ?? '').trim(),
    });
    if (!sessionAuth.ok) {
      return Response.json({ error: sessionAuth.error }, { status: sessionAuth.status, headers: CORS });
    }

    // ── Ownership check: verify session exists for the authorized session id ──────────
    const { data: scoreRow, error: scoreErr } = await supabase
      .from('game_scores')
      .select('id, game_id, player_session_id')
      .eq('game_id', game_id)
      .eq('player_session_id', normalizedSessionId)
      .maybeSingle();

    if (scoreErr) throw scoreErr;
    if (!scoreRow) {
      // Score row doesn't exist yet — nothing to update, return ok silently
      return Response.json({ ok: true }, { headers: CORS });
    }


    const { error } = await supabase
      .from('game_scores')
      .update({
        display_name: safeName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scoreRow.id);

    if (error) throw error;

    return Response.json({ ok: true }, { headers: CORS });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return Response.json({ error: errorMessage }, { status: 500, headers: CORS });
  }
});
