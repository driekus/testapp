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
    const { slug } = await req.json();

    if (!slug) {
      return Response.json({ error: 'Missing slug' }, { status: 400, headers: CORS });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await supabase
      .from('games')
      .select('id, slug, display_name, logo_url, requires_payment, price_in_cents, supports_offline, routes(id, order_index, display_name, route)')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      return Response.json({ error: error.message }, { status: 500, headers: CORS });
    }
    if (!data) return Response.json({ game: null }, { headers: CORS });

    const sorted = (data.routes ?? []).sort((a: any, b: any) => a.order_index - b.order_index);

    // Route metadata only — no location data exposed for future routes
    const routesMeta = sorted.map((r: any) => ({
      id: r.id,
      order_index: r.order_index,
      display_name: r.display_name,
    }));

    // Only the first location of the first route
    const firstRoute = sorted[0];
    const firstLocation = firstRoute?.route?.[0];
    const startLocation = firstLocation ? {
      name: firstLocation.name,
      lat: firstLocation.lat,
      lng: firstLocation.lng,
      question: firstLocation.question ?? '',
      max_attempts: firstLocation.max_attempts ?? 0,
      description: firstLocation.description ?? '',
    } : null;

    return Response.json(
      {
        game: {
          id: data.id,
          slug: data.slug,
          display_name: data.display_name,
          logo_url: data.logo_url ?? '',
          requires_payment: data.requires_payment ?? false,
          price_in_cents: data.price_in_cents ?? 0,
          supports_offline: data.supports_offline ?? false,
          routes: routesMeta,
          start_location: startLocation,
        },
      },
      { headers: CORS },
    );
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS });
  }
});
