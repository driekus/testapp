// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type EventType = 'location_found' | 'arrival_confirmed' | 'answer_correct' | 'question_skipped'

function answerPointsForAttempt(attemptNumber: number) {
  if (attemptNumber <= 1) return 10
  if (attemptNumber === 2) return 5
  if (attemptNumber === 3) return 3
  if (attemptNumber === 4) return 2
  return 1
}

function timeBonus(answerTimeMs: number) {
  if (answerTimeMs < 0 || answerTimeMs >= 60000) return 0
  return Math.floor((60000 - answerTimeMs) / 1000)
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
    }
  }

  if (eventType === 'arrival_confirmed') {
    return {
      scoreDelta: 5,
      locationDelta: 0,
      arrivalDelta: 1,
      answeredDelta: 0,
      skippedDelta: 0,
      answerTimeDelta: 0,
    }
  }

  if (eventType === 'question_skipped') {
    return {
      scoreDelta: -10,
      locationDelta: 0,
      arrivalDelta: 0,
      answeredDelta: 0,
      skippedDelta: 1,
      answerTimeDelta: 0,
    }
  }

  const attemptPoints = answerPointsForAttempt(attemptNumber)
  const bonus = timeBonus(answerTimeMs)
  return {
    scoreDelta: attemptPoints + bonus,
    locationDelta: 0,
    arrivalDelta: 0,
    answeredDelta: 1,
    skippedDelta: 0,
    answerTimeDelta: Math.max(0, Math.round(answerTimeMs)),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
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
    } = await req.json()

    if (!game_id || !player_id || !player_session_id || !event_type || !event_key) {
      return Response.json(
        { error: 'Missing game_id, player_id, player_session_id, event_type, or event_key' },
        { status: 400, headers: CORS },
      )
    }

    const validTypes: EventType[] = ['location_found', 'arrival_confirmed', 'answer_correct', 'question_skipped']
    if (validTypes.indexOf(event_type) === -1) {
      return Response.json({ error: 'Unsupported event_type' }, { status: 400, headers: CORS })
    }

    const parsedAttempt = Math.max(1, Math.round(Number(attempt_number) || 1))
    const parsedTimeMs = Math.max(0, Math.round(Number(answer_time_ms) || 0))
    const delta = calculateDelta(event_type, parsedAttempt, parsedTimeMs)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    )

    const { error: insertEventError } = await supabase
      .from('score_events')
      .insert({
        game_id,
        player_id,
        player_session_id,
        event_key,
        event_type,
        points_delta: delta.scoreDelta,
        answer_time_ms: delta.answerTimeDelta,
      })

    if (insertEventError && insertEventError.code !== '23505') {
      throw insertEventError
    }

    const duplicate = insertEventError?.code === '23505'

    const { data: existingScore, error: existingScoreError } = await supabase
      .from('game_scores')
      .select('*')
      .eq('game_id', game_id)
      .eq('player_session_id', player_session_id)
      .maybeSingle()

    if (existingScoreError) throw existingScoreError

    const safeDisplayName = String(display_name ?? '').trim() || null

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
        .single()

      if (createScoreError) throw createScoreError

      return Response.json(
        {
          inserted: !duplicate,
          score: createdScore.score,
          total_answer_time_ms: createdScore.total_answer_time_ms,
        },
        { headers: CORS },
      )
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (safeDisplayName) updatePayload.display_name = safeDisplayName

    if (!duplicate) {
      updatePayload.score = Number(existingScore.score || 0) + delta.scoreDelta
      updatePayload.locations_found = Number(existingScore.locations_found || 0) + delta.locationDelta
      updatePayload.arrivals_confirmed = Number(existingScore.arrivals_confirmed || 0) + delta.arrivalDelta
      updatePayload.questions_answered = Number(existingScore.questions_answered || 0) + delta.answeredDelta
      updatePayload.questions_skipped = Number(existingScore.questions_skipped || 0) + delta.skippedDelta
      updatePayload.total_answer_time_ms =
        Number(existingScore.total_answer_time_ms || 0) + delta.answerTimeDelta
    }

    const { data: updatedScore, error: updateScoreError } = await supabase
      .from('game_scores')
      .update(updatePayload)
      .eq('id', existingScore.id)
      .select('*')
      .single()

    if (updateScoreError) throw updateScoreError

    return Response.json(
      {
        inserted: !duplicate,
        score: updatedScore.score,
        total_answer_time_ms: updatedScore.total_answer_time_ms,
      },
      { headers: CORS },
    )
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS })
  }
})




