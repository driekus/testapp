// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

function isMissingFinalQuestionAttemptsTable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as { code?: unknown }).code ?? '');
  const message = String((err as { message?: unknown }).message ?? '').toLowerCase();
  return code === 'PGRST205' || message.includes('public.final_question_attempts');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { game_id, player_id, player_session_id, answer, payment_token, check_only } = await req.json();
    const isCheckOnly = Boolean(check_only);

    if (!game_id || !player_id || !player_session_id || (!isCheckOnly && answer == null)) {
      return Response.json(
        { error: 'Missing game_id, player_id, player_session_id or answer' },
        { status: 400, headers: CORS },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    );

    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, slug, requires_payment, final_question')
      .eq('id', game_id)
      .maybeSingle();

    if (gameError) {
      return Response.json({ error: toErrorMessage(gameError) }, { status: 500, headers: CORS });
    }
    if (!game) {
      return Response.json({ error: 'Game not found' }, { status: 404, headers: CORS });
    }

    const { data: answerRow, error: answerError } = await supabase
      .from('game_final_answers')
      .select('final_answer')
      .eq('game_id', game_id)
      .maybeSingle();

    if (answerError) {
      return Response.json({ error: toErrorMessage(answerError) }, { status: 500, headers: CORS });
    }

    if (!String(game.final_question ?? '').trim() || !String(answerRow?.final_answer ?? '').trim()) {
      return Response.json({ error: 'No final question configured for this game' }, { status: 400, headers: CORS });
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
        .maybeSingle();

      if (paymentError) {
        return Response.json({ error: toErrorMessage(paymentError) }, { status: 500, headers: CORS });
      }
      if (!session) {
        return Response.json({ error: 'Invalid payment token' }, { status: 403, headers: CORS });
      }
    }

    const { data: existingAttempt, error: existingAttemptError } = await supabase
      .from('final_question_attempts')
      .select('is_correct')
      .eq('game_id', game_id)
      .eq('player_session_id', player_session_id)
      .maybeSingle();

    if (existingAttemptError) {
      if (isMissingFinalQuestionAttemptsTable(existingAttemptError)) {
        return Response.json(
          { error: 'Database migration missing: final_question_attempts. Run schema.sql and reload PostgREST schema cache.' },
          { status: 500, headers: CORS },
        );
      }
      return Response.json({ error: toErrorMessage(existingAttemptError) }, { status: 500, headers: CORS });
    }

    if (existingAttempt) {
      return Response.json(
        {
          accepted: false,
          already_answered: true,
          correct: Boolean(existingAttempt.is_correct),
        },
        { headers: CORS },
      );
    }

    if (isCheckOnly) {
      return Response.json(
        {
          accepted: false,
          already_answered: false,
          correct: false,
        },
        { headers: CORS },
      );
    }

    const submittedAnswer = String(answer ?? '').trim();
    const correct =
      submittedAnswer.toLowerCase() === String(answerRow?.final_answer ?? '').trim().toLowerCase();

    const { error: insertError } = await supabase
      .from('final_question_attempts')
      .insert({
        game_id,
        player_id,
        player_session_id,
        submitted_answer: submittedAnswer,
        is_correct: correct,
      });

    if (insertError) {
      if (isMissingFinalQuestionAttemptsTable(insertError)) {
        return Response.json(
          { error: 'Database migration missing: final_question_attempts. Run schema.sql and reload PostgREST schema cache.' },
          { status: 500, headers: CORS },
        );
      }
      if (insertError.code === '23505') {
        return Response.json(
          {
            accepted: false,
            already_answered: true,
            correct: false,
          },
          { headers: CORS },
        );
      }
      return Response.json({ error: toErrorMessage(insertError) }, { status: 500, headers: CORS });
    }

    return Response.json(
      {
        accepted: true,
        already_answered: false,
        correct,
      },
      { headers: CORS },
    );
  } catch (err) {
    const errorMessage = toErrorMessage(err);
    return Response.json({ error: errorMessage }, { status: 500, headers: CORS });
  }
});


