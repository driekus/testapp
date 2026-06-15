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
    const { route_id } = await req.json()

    if (!route_id) {
      return Response.json({ error: 'Missing route_id' }, { status: 400, headers: CORS })
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
      }
    }, { headers: CORS })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS })
  }
})
