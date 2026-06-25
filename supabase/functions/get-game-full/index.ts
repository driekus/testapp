import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { slug, offline_download, payment_token } = await req.json();

    if (!slug) {
      return Response.json({ error: 'Missing slug' }, { status: 400, headers: CORS });
    }

    // Only allow full download if explicitly requested
    if (!offline_download) {
      return Response.json({ error: 'Offline download not requested' }, { status: 403, headers: CORS });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    );

    // Fetch game metadata
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, slug, display_name, logo_url, requires_payment, price_in_cents, supports_offline, final_question, routes(id, order_index, display_name, route)')
      .eq('slug', slug)
      .maybeSingle();

    if (gameError) {
      return Response.json({ error: gameError.message }, { status: 500, headers: CORS });
    }
    if (!game) {
      return Response.json({ error: 'Game not found', status: 404 }, { headers: CORS });
    }

    // Check if offline is supported for this game
    if (!game.supports_offline) {
      return Response.json(
        { error: 'This game does not support offline mode' },
        { status: 403, headers: CORS }
      );
    }

    // Verify payment if required
    if (game.requires_payment) {
      if (!payment_token) {
        return Response.json(
          { error: 'Missing payment_token for paid game' },
          { status: 400, headers: CORS }
        );
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
        return Response.json(
          { error: 'Invalid or consumed payment token' },
          { status: 403, headers: CORS }
        );
      }
    }

    // Sort and build full routes with all locations
    const sorted = (game.routes ?? []).sort((a: any, b: any) => a.order_index - b.order_index);
    const fullRoutes = sorted.map((route: any) => ({
      id: route.id,
      order_index: route.order_index,
      display_name: route.display_name,
      route: (route.route ?? []).map((loc: any) => ({
        name: loc.name ?? '',
        lat: loc.lat ?? 0,
        lng: loc.lng ?? 0,
        letter: loc.letter ?? '',
        question: loc.question ?? '',
        answer: loc.answer ?? '',
        max_attempts: loc.max_attempts ?? 0,
        description: loc.description ?? '',
        image_url: loc.image_url ?? '',
      })),
    }));

    const { data: finalAnswerRow } = await supabase
      .from('game_final_answers')
      .select('final_answer')
      .eq('game_id', game.id)
      .maybeSingle();

    return Response.json(
      {
        game: {
          id: game.id,
          slug: game.slug,
          display_name: game.display_name,
          logo_url: game.logo_url ?? '',
          requires_payment: game.requires_payment ?? false,
          price_in_cents: game.price_in_cents ?? 0,
          supports_offline: game.supports_offline ?? false,
          final_question: game.final_question ?? '',
          final_answer: finalAnswerRow?.final_answer ?? '',
          routes: fullRoutes,
        },
      },
      { headers: CORS }
    );
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS });
  }
});

