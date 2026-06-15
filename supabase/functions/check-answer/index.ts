import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { route_id, location_index, answer } = await req.json()

    if (!route_id || location_index == null || answer == null) {
      return Response.json({ error: 'Missing route_id, location_index or answer' }, { status: 400, headers: CORS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    )

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

    const correct =
      String(answer).trim().toLowerCase() === String(location.answer ?? '').trim().toLowerCase()

    if (!correct) {
      return Response.json({ correct: false }, { headers: CORS })
    }

    const nextLocation = route[location_index + 1]
      ? {
          name: route[location_index + 1].name,
          lat: route[location_index + 1].lat,
          lng: route[location_index + 1].lng,
          question: route[location_index + 1].question ?? '',
          max_attempts: route[location_index + 1].max_attempts ?? 0,
        }
      : null

    return Response.json(
      { correct: true, letter: location.letter, next_location: nextLocation },
      { headers: CORS },
    )
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS })
  }
})
