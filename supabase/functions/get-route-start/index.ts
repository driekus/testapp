import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Payment verification is always enforced — the env toggle has been removed.
async function verifyPaymentIfRequired(supabase: any, routeId: string, paymentToken?: string | null) {
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
  if (!game.requires_payment) return null  // free game — no payment needed

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
    const { route_id, payment_token } = await req.json()

    if (!route_id) {
      return Response.json({ error: 'Missing route_id' }, { status: 400, headers: CORS })
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

    const first = data.route?.[0]
    if (!first) {
      return Response.json({ error: 'Route has no locations' }, { status: 400, headers: CORS })
    }

    return Response.json({
      location: {
        name: first.name,
        lat: first.lat,
        lng: first.lng,
        question: first.question ?? '',
        max_attempts: first.max_attempts ?? 0,
        description: first.description ?? '',
      }
    }, { headers: CORS })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS })
  }
})
