import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STRICT_PAYMENT_VERIFICATION = Deno.env.get('STRICT_PAYMENT_VERIFICATION') === 'true'

async function verifyPaymentIfRequired(supabase: any, routeId: string, paymentToken?: string | null) {
  if (!STRICT_PAYMENT_VERIFICATION) return null

  const { data: routeMeta, error: routeMetaError } = await supabase
    .from('routes')
    .select('game_id')
    .eq('id', routeId)
    .maybeSingle()

  if (routeMetaError) throw routeMetaError
  if (!routeMeta?.game_id) return { error: 'Route not found', status: 404 }

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('slug, requires_payment')
    .eq('id', routeMeta.game_id)
    .maybeSingle()

  if (gameError) throw gameError
  if (!game) return { error: 'Game not found', status: 404 }
  if (!game.requires_payment) return null

  if (!paymentToken) {
    return { error: 'Missing payment_token', status: 400 }
  }

  const { data: session, error: paymentError } = await supabase
    .from('payment_sessions')
    .select('id')
    .eq('game_slug', game.slug)
    .eq('payment_token', paymentToken)
    .eq('paid', true)
    .eq('played', false)
    .maybeSingle()

  if (paymentError) throw paymentError
  if (!session) {
    return { error: 'Invalid or consumed payment token', status: 403 }
  }

  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { route_id, location_index, payment_token } = await req.json()

    if (!route_id || location_index == null) {
      return Response.json({ error: 'Missing route_id or location_index' }, { status: 400, headers: CORS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    )

    const paymentValidation = await verifyPaymentIfRequired(supabase, route_id, payment_token)
    if (paymentValidation) {
      return Response.json({ error: paymentValidation.error }, { status: paymentValidation.status, headers: CORS })
    }

    const { data, error } = await supabase
      .from('routes')
      .select('route')
      .eq('id', route_id)
      .single()

    if (error || !data) {
      return Response.json({ error: 'Route not found' }, { status: 404, headers: CORS })
    }

    const route: any[] = data.route
    const location = route[location_index]

    if (!location) {
      return Response.json({ error: 'Location index out of bounds' }, { status: 400, headers: CORS })
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
        }
      : null

    return Response.json(
      { letter: location.letter, next_location: nextLocation },
      { headers: CORS },
    )
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS })
  }
})
