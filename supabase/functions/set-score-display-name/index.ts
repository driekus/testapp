// @ts-nocheck
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
    const { game_id, player_id, player_session_id, display_name, session_token } = await req.json();

    if (!game_id || !player_id || !player_session_id || !session_token) {
      return Response.json(
        { error: 'Missing game_id, player_id, player_session_id, or session_token' },
        { status: 400, headers: CORS }
      );
    }

    const safeName = String(display_name ?? '').trim();
    if (!safeName || safeName.length > 80) {
      return Response.json({ error: 'Invalid display_name (blank or too long)' }, { status: 400, headers: CORS });
    }

    const normalizedSessionId = String(player_session_id ?? '').trim();
    const normalizedPlayerId = String(player_id ?? '').trim();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    );

    const sessionAuth = await requireAuthorizedScoreSession({
      gameId: game_id,
      playerId: normalizedPlayerId,
      playerSessionId: normalizedSessionId,
      sessionToken: String(session_token ?? '').trim(),
    });
    if (!sessionAuth.ok) {
      return Response.json({ error: sessionAuth.error }, { status: sessionAuth.status, headers: CORS });
    }

    // Ownership check: verify the score exists and belongs to this session
    const { data: scoreRow, error: lookupError } = await supabase
      .from('game_scores')
      .select('id')
      .eq('game_id', game_id)
      .eq('player_id', normalizedPlayerId)
      .eq('player_session_id', normalizedSessionId)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!scoreRow) {
      return Response.json({ error: 'Score entry not found' }, { status: 404, headers: CORS });
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

