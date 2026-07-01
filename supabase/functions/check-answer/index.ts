import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuthorizedScoreSession } from './scoreSession.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Validates payment token for paid games. Returns null when access is allowed.
 */
async function verifyPaymentIfRequired(supabase: any, routeId: string, paymentToken?: string | null) {
  const { data: routeMeta, error: routeMetaError } = await supabase
    .from('routes')
    .select('game_id')
    .eq('id', routeId)
    .maybeSingle();

  if (routeMetaError) throw routeMetaError;
  if (!routeMeta?.game_id) return { error: 'Route not found', status: 404 };

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('slug, requires_payment')
    .eq('id', routeMeta.game_id)
    .maybeSingle();

  if (gameError) throw gameError;
  if (!game) return { error: 'Game not found', status: 404 };
  if (!game.requires_payment) return null;

  if (!paymentToken) return { error: 'Missing payment_token', status: 400 };

  const { data: session, error: paymentError } = await supabase
    .from('payment_sessions')
    .select('id')
    .eq('game_slug', game.slug)
    .eq('payment_token', paymentToken)
    .eq('paid', true)
    .eq('played', false)
    .maybeSingle();

  if (paymentError) throw paymentError;
  if (!session) return { error: 'Invalid or consumed payment token', status: 403 };

  return null;
}

async function readWrongAttempts(
  supabase: any,
  gameId: string,
  playerSessionId: string,
  routeId: string,
  locationIndex: number,
) {
  const { data, error } = await supabase
    .from('answer_attempts')
    .select('id, wrong_attempts')
    .eq('game_id', gameId)
    .eq('player_session_id', playerSessionId)
    .eq('route_id', routeId)
    .eq('location_index', locationIndex)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function bumpWrongAttempts(
  supabase: any,
  gameId: string,
  playerSessionId: string,
  routeId: string,
  locationIndex: number,
) {
  const existing = await readWrongAttempts(supabase, gameId, playerSessionId, routeId, locationIndex);
  if (!existing) {
    const { data, error } = await supabase
      .from('answer_attempts')
      .insert({
        game_id: gameId,
        player_session_id: playerSessionId,
        route_id: routeId,
        location_index: locationIndex,
        wrong_attempts: 1,
        updated_at: new Date().toISOString(),
      })
      .select('wrong_attempts')
      .single();
    if (error) throw error;
    return Number(data?.wrong_attempts || 1);
  }

  const nextWrongAttempts = Math.max(0, Number(existing.wrong_attempts || 0)) + 1;
  const { data, error } = await supabase
    .from('answer_attempts')
    .update({ wrong_attempts: nextWrongAttempts, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
    .select('wrong_attempts')
    .single();
  if (error) throw error;
  return Number(data?.wrong_attempts || nextWrongAttempts);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { route_id, location_index, answer, payment_token, player_session_id, session_token } = await req.json();

    if (!route_id || location_index == null || answer == null || !player_session_id || !session_token) {
      return Response.json({ error: 'Missing route_id, location_index, answer, player_session_id or session_token' }, { status: 400, headers: CORS });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    );

    const { data: routeMeta, error: routeMetaError } = await supabase
      .from('routes')
      .select('game_id')
      .eq('id', route_id)
      .maybeSingle();

    if (routeMetaError) {
      return Response.json({ error: routeMetaError.message }, { status: 500, headers: CORS });
    }
    if (!routeMeta?.game_id) {
      return Response.json({ error: 'Route not found' }, { status: 404, headers: CORS });
    }

    const sessionAuth = await requireAuthorizedScoreSession({
      gameId: String(routeMeta.game_id),
      playerSessionId: String(player_session_id),
      sessionToken: String(session_token),
    });
    if (!sessionAuth.ok) {
      return Response.json({ error: sessionAuth.error }, { status: sessionAuth.status, headers: CORS });
    }

    const paymentValidation = await verifyPaymentIfRequired(supabase, route_id, payment_token);
    if (paymentValidation) {
      return Response.json({ error: paymentValidation.error }, { status: paymentValidation.status, headers: CORS });
    }

    const { data, error } = await supabase
      .from('routes')
      .select('route')
      .eq('id', route_id)
      .single();

    if (error || !data) {
      return Response.json({ error: 'Route not found' }, { status: 404, headers: CORS });
    }

    const route: any[] = data.route;
    const location = route[location_index];

    if (!location) {
      return Response.json({ error: 'Location index out of bounds' }, { status: 400, headers: CORS });
    }

    const maxAttempts = Math.max(0, Number(location.max_attempts || 0));
    if (maxAttempts > 0) {
      const existingAttempts = await readWrongAttempts(
        supabase,
        String(routeMeta.game_id),
        String(player_session_id),
        String(route_id),
        Number(location_index),
      );
      const usedAttempts = Math.max(0, Number(existingAttempts?.wrong_attempts || 0));
      if (usedAttempts >= maxAttempts) {
        return Response.json(
          {
            correct: false,
            max_attempts_reached: true,
            attempts_used: usedAttempts,
            max_attempts: maxAttempts,
          },
          { headers: CORS },
        );
      }
    }

    const correct =
      String(answer).trim().toLowerCase() === String(location.answer ?? '').trim().toLowerCase();

    if (!correct) {
      if (maxAttempts > 0) {
        const attemptsUsed = await bumpWrongAttempts(
          supabase,
          String(routeMeta.game_id),
          String(player_session_id),
          String(route_id),
          Number(location_index),
        );
        return Response.json(
          {
            correct: false,
            max_attempts_reached: attemptsUsed >= maxAttempts,
            attempts_used: attemptsUsed,
            max_attempts: maxAttempts,
          },
          { headers: CORS },
        );
      }

      return Response.json({ correct: false }, { headers: CORS });
    }

    const nextLocation = route[location_index + 1]
      ? {
          name: route[location_index + 1].name,
          lat: route[location_index + 1].lat,
          lng: route[location_index + 1].lng,
          question: route[location_index + 1].question ?? '',
          max_attempts: route[location_index + 1].max_attempts ?? 0,
          image_url: route[location_index + 1].image_url ?? null,
          description: route[location_index + 1].description ?? '',
          question_hint: route[location_index + 1].question_hint ?? route[location_index + 1].description ?? '',
        }
      : null;

    return Response.json(
      { correct: true, letter: location.letter, next_location: nextLocation },
      { headers: CORS },
    );
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS });
  }
});
