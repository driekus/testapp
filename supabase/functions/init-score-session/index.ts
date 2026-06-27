// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createScoreSessionToken } from './scoreSession.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isReasonableIdentity(value: unknown): boolean {
  const normalized = String(value ?? '').trim();
  return normalized.length >= 8 && normalized.length <= 128;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS });
  }

  try {
    const { game_id, player_id, payment_token } = await req.json();

    if (!game_id || !player_id) {
      return Response.json({ error: 'Missing game_id or player_id' }, { status: 400, headers: CORS });
    }
    if (!isReasonableIdentity(player_id)) {
      return Response.json({ error: 'Invalid player_id format' }, { status: 400, headers: CORS });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    );

    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, slug, requires_payment')
      .eq('id', game_id)
      .maybeSingle();

    if (gameError) {
      return Response.json({ error: gameError.message }, { status: 500, headers: CORS });
    }
    if (!game) {
      return Response.json({ error: 'Game not found' }, { status: 404, headers: CORS });
    }

    if (game.requires_payment) {
      if (!payment_token) {
        return Response.json({ error: 'Missing payment_token' }, { status: 400, headers: CORS });
      }

      const { data: session, error: paymentError } = await supabase
        .from('payment_sessions')
        .select('id')
        .eq('game_slug', game.slug)
        .eq('payment_token', payment_token)
        .eq('paid', true)
        .eq('played', false)
        .maybeSingle();

      if (paymentError) {
        return Response.json({ error: paymentError.message }, { status: 500, headers: CORS });
      }
      if (!session) {
        return Response.json({ error: 'Invalid or consumed payment token' }, { status: 403, headers: CORS });
      }
    }

    const playerSessionId = crypto.randomUUID();
    const session_token = await createScoreSessionToken({
      game_id: String(game.id),
      player_id: String(player_id).trim(),
      player_session_id: playerSessionId,
      issued_at: Date.now(),
    });

    return Response.json(
      {
        player_session_id: playerSessionId,
        session_token,
      },
      { headers: CORS },
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return Response.json({ error: errorMessage }, { status: 500, headers: CORS });
  }
});


