// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCATION_EVENT_TYPES = new Set(['location_found', 'arrival_confirmed', 'answer_correct', 'question_skipped']);

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message?: unknown }).message ?? 'Unknown error');
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

type EventType =
  | 'location_found'
  | 'arrival_confirmed'
  | 'answer_correct'
  | 'question_skipped'
  | 'final_question_correct'

function answerPointsForAttempt(attemptNumber: number) {
  if (attemptNumber <= 1) return 10;
  if (attemptNumber === 2) return 5;
  if (attemptNumber === 3) return 3;
  if (attemptNumber === 4) return 2;
  return 1;
}

function timeBonus(answerTimeMs: number) {
  if (answerTimeMs < 0 || answerTimeMs >= 60000) return 0;
  return Math.floor((60000 - answerTimeMs) / 1000);
}

function calculateDelta(eventType: EventType, attemptNumber: number, answerTimeMs: number) {
  if (eventType === 'location_found') {
    return {
      scoreDelta: 10,
      locationDelta: 1,
      arrivalDelta: 0,
      answeredDelta: 0,
      skippedDelta: 0,
      answerTimeDelta: 0,
    };
  }

  if (eventType === 'arrival_confirmed') {
    return {
      scoreDelta: 5,
      locationDelta: 0,
      arrivalDelta: 1,
      answeredDelta: 0,
      skippedDelta: 0,
      answerTimeDelta: 0,
    };
  }

  if (eventType === 'question_skipped') {
    return {
      scoreDelta: -10,
      locationDelta: 0,
      arrivalDelta: 0,
      answeredDelta: 0,
      skippedDelta: 1,
      answerTimeDelta: 0,
    };
  }

  if (eventType === 'final_question_correct') {
    return {
      scoreDelta: 50,
      locationDelta: 0,
      arrivalDelta: 0,
      answeredDelta: 0,
      skippedDelta: 0,
      answerTimeDelta: 0,
    };
  }

  const attemptPoints = answerPointsForAttempt(attemptNumber);
  const bonus = timeBonus(answerTimeMs);
  return {
    scoreDelta: attemptPoints + bonus,
    locationDelta: 0,
    arrivalDelta: 0,
    answeredDelta: 1,
    skippedDelta: 0,
    answerTimeDelta: Math.max(0, Math.round(answerTimeMs)),
  };
}

function isReasonableIdentity(value: unknown): boolean {
  const normalized = String(value ?? '').trim();
  return normalized.length >= 8 && normalized.length <= 128;
}

function parseLocationEventKey(eventKey: string, eventType: EventType) {
  const raw = String(eventKey ?? '').trim();
  const parts = raw.split(':');
  if (parts.length !== 3) return null;

  const [routeId, locationIndexRaw, keyEventType] = parts;
  if (!UUID_RE.test(routeId)) return null;
  if (keyEventType !== eventType) return null;
  if (!/^\d+$/.test(locationIndexRaw)) return null;

  const locationIndex = Number(locationIndexRaw);
  if (!Number.isInteger(locationIndex) || locationIndex < 0 || locationIndex > 500) return null;

  return { routeId, locationIndex };
}

async function resolveLocationContext(supabase: any, gameId: string, routeId: string, locationIndex: number) {
  const { data: routeRow, error: routeError } = await supabase
    .from('routes')
    .select('route')
    .eq('id', routeId)
    .eq('game_id', gameId)
    .maybeSingle();

  if (routeError) throw routeError;
  if (!routeRow || !Array.isArray(routeRow.route)) {
    return { ok: false, error: 'Invalid event_key route context', status: 403 };
  }

  const location = routeRow.route[locationIndex];
  if (!location) {
    return { ok: false, error: 'Invalid event_key location index', status: 403 };
  }

  return {
    ok: true,
    location,
    hasQuestion: Boolean(String(location.question ?? '').trim()),
  };
}

async function scoreEventExists(supabase: any, gameId: string, playerSessionId: string, eventKey: string) {
  const { data, error } = await supabase
    .from('score_events')
    .select('id')
    .eq('game_id', gameId)
    .eq('player_session_id', playerSessionId)
    .eq('event_key', eventKey)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

async function hasAnyArrivalEvent(supabase: any, gameId: string, playerSessionId: string) {
  const { data, error } = await supabase
    .from('score_events')
    .select('id')
    .eq('game_id', gameId)
    .eq('player_session_id', playerSessionId)
    .eq('event_type', 'arrival_confirmed')
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS });
  }

  try {
    const {
      game_id,
      player_id,
      player_session_id,
      event_type,
      event_key,
      attempt_number,
      answer_time_ms,
      display_name,
    } = await req.json();

    if (!game_id || !player_id || !player_session_id || !event_type || !event_key) {
      return Response.json(
        { error: 'Missing game_id, player_id, player_session_id, event_type, or event_key' },
        { status: 400, headers: CORS },
      );
    }

    const validTypes: EventType[] = [
      'location_found',
      'arrival_confirmed',
      'answer_correct',
      'question_skipped',
      'final_question_correct',
    ];
    if (validTypes.indexOf(event_type) === -1) {
      return Response.json({ error: 'Unsupported event_type' }, { status: 400, headers: CORS });
    }

    if (!isReasonableIdentity(player_id) || !isReasonableIdentity(player_session_id)) {
      return Response.json({ error: 'Invalid player identity format' }, { status: 400, headers: CORS });
    }

    const normalizedEventKey = String(event_key ?? '').trim();
    if (!normalizedEventKey || normalizedEventKey.length > 180) {
      return Response.json({ error: 'Invalid event_key' }, { status: 400, headers: CORS });
    }

    if (event_type === 'final_question_correct' && normalizedEventKey !== 'final-question') {
      return Response.json({ error: 'Invalid final question event_key' }, { status: 400, headers: CORS });
    }

    const parsedAttempt = Math.max(1, Math.round(Number(attempt_number) || 1));
    const parsedTimeMs = Math.max(0, Math.round(Number(answer_time_ms) || 0));
    if (parsedTimeMs > 10 * 60 * 1000) {
      return Response.json({ error: 'answer_time_ms is too large' }, { status: 400, headers: CORS });
    }
    const delta = calculateDelta(event_type, parsedAttempt, parsedTimeMs);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    );

    if (LOCATION_EVENT_TYPES.has(event_type)) {
      const parsed = parseLocationEventKey(normalizedEventKey, event_type);
      if (!parsed) {
        return Response.json({ error: 'Invalid event_key format for event_type' }, { status: 400, headers: CORS });
      }

      const routeContext = await resolveLocationContext(supabase, game_id, parsed.routeId, parsed.locationIndex);
      if (!routeContext.ok) {
        return Response.json({ error: routeContext.error }, { status: routeContext.status, headers: CORS });
      }

      const baseKey = `${parsed.routeId}:${parsed.locationIndex}`;
      const foundKey = `${baseKey}:location_found`;
      const arrivalKey = `${baseKey}:arrival_confirmed`;

      if (event_type === 'arrival_confirmed') {
        const hasFound = await scoreEventExists(supabase, game_id, player_session_id, foundKey);
        if (!hasFound) {
          return Response.json({ error: 'arrival_confirmed requires location_found first' }, { status: 409, headers: CORS });
        }
      }

      if (event_type === 'answer_correct' || event_type === 'question_skipped') {
        if (!routeContext.hasQuestion) {
          return Response.json({ error: 'Question event not allowed at this location' }, { status: 400, headers: CORS });
        }
        const hasArrival = await scoreEventExists(supabase, game_id, player_session_id, arrivalKey);
        if (!hasArrival) {
          return Response.json({ error: 'Question scoring requires arrival_confirmed first' }, { status: 409, headers: CORS });
        }
      }
    }

    if (event_type === 'final_question_correct') {
      const hasArrival = await hasAnyArrivalEvent(supabase, game_id, player_session_id);
      if (!hasArrival) {
        return Response.json({ error: 'Final question scoring requires route progress first' }, { status: 409, headers: CORS });
      }
    }

    const { error: insertEventError } = await supabase
      .from('score_events')
      .insert({
        game_id,
        player_id,
        player_session_id,
        event_key: normalizedEventKey,
        event_type,
        points_delta: delta.scoreDelta,
        answer_time_ms: delta.answerTimeDelta,
      });

    if (insertEventError && insertEventError.code !== '23505') {
      return Response.json({ error: toErrorMessage(insertEventError) }, { status: 500, headers: CORS });
    }

    const duplicate = insertEventError?.code === '23505';

    const { data: existingScore, error: existingScoreError } = await supabase
      .from('game_scores')
      .select('*')
      .eq('game_id', game_id)
      .eq('player_session_id', player_session_id)
      .maybeSingle();

    if (existingScoreError) {
      return Response.json({ error: toErrorMessage(existingScoreError) }, { status: 500, headers: CORS });
    }

    const safeDisplayName = String(display_name ?? '').trim() || null;

    if (!existingScore) {
      const { data: createdScore, error: createScoreError } = await supabase
        .from('game_scores')
        .insert({
          game_id,
          player_id,
          player_session_id,
          display_name: safeDisplayName,
          score: duplicate ? 0 : delta.scoreDelta,
          locations_found: duplicate ? 0 : delta.locationDelta,
          arrivals_confirmed: duplicate ? 0 : delta.arrivalDelta,
          questions_answered: duplicate ? 0 : delta.answeredDelta,
          questions_skipped: duplicate ? 0 : delta.skippedDelta,
          total_answer_time_ms: duplicate ? 0 : delta.answerTimeDelta,
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (createScoreError) {
        return Response.json({ error: toErrorMessage(createScoreError) }, { status: 500, headers: CORS });
      }

      return Response.json(
        {
          inserted: !duplicate,
          score: createdScore.score,
          total_answer_time_ms: createdScore.total_answer_time_ms,
        },
        { headers: CORS },
      );
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (safeDisplayName) updatePayload.display_name = safeDisplayName;

    if (!duplicate) {
      updatePayload.score = Number(existingScore.score || 0) + delta.scoreDelta;
      updatePayload.locations_found = Number(existingScore.locations_found || 0) + delta.locationDelta;
      updatePayload.arrivals_confirmed = Number(existingScore.arrivals_confirmed || 0) + delta.arrivalDelta;
      updatePayload.questions_answered = Number(existingScore.questions_answered || 0) + delta.answeredDelta;
      updatePayload.questions_skipped = Number(existingScore.questions_skipped || 0) + delta.skippedDelta;
      updatePayload.total_answer_time_ms =
        Number(existingScore.total_answer_time_ms || 0) + delta.answerTimeDelta;
    }

    const { data: updatedScore, error: updateScoreError } = await supabase
      .from('game_scores')
      .update(updatePayload)
      .eq('id', existingScore.id)
      .select('*')
      .single();

    if (updateScoreError) {
      return Response.json({ error: toErrorMessage(updateScoreError) }, { status: 500, headers: CORS });
    }

    return Response.json(
      {
        inserted: !duplicate,
        score: updatedScore.score,
        total_answer_time_ms: updatedScore.total_answer_time_ms,
      },
      { headers: CORS },
    );
  } catch (err) {
    return Response.json({ error: toErrorMessage(err) }, { status: 500, headers: CORS });
  }
});




