/**
 * Validates a payment token for a route when the game requires payment.
 * Returns null when access is allowed; otherwise returns an error payload
 * that can be returned directly as an HTTP response body/status.
 */
export async function verifyPaymentIfRequired(
  supabase: any,
  routeId: string,
  paymentToken?: string | null,
): Promise<{ error: string; status: number } | null> {
  const { data: routeMeta, error: routeMetaError } = await supabase
    .from('routes')
    .select('game_id')
    .eq('id', routeId)
    .maybeSingle();

  if (routeMetaError) {
    throw routeMetaError;
  }
  if (!routeMeta?.game_id) {
    return { error: 'Route not found', status: 404 };
  }

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('slug, requires_payment')
    .eq('id', routeMeta.game_id)
    .maybeSingle();

  if (gameError) {
    throw gameError;
  }
  if (!game) {
    return { error: 'Game not found', status: 404 };
  }
  if (!game.requires_payment) {
    return null;
  }

  if (!paymentToken) {
    return { error: 'Missing payment_token', status: 400 };
  }

  const { data: session, error: paymentError } = await supabase
    .from('payment_sessions')
    .select('id')
    .eq('game_slug', game.slug)
    .eq('payment_token', paymentToken)
    .eq('paid', true)
    .eq('played', false)
    .maybeSingle();

  if (paymentError) {
    throw paymentError;
  }
  if (!session) {
    return { error: 'Invalid or consumed payment token', status: 403 };
  }

  return null;
}

