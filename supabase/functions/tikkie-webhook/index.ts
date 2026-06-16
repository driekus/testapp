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
    const body = await req.json()
    const paymentRequestToken = body.paymentRequestToken ?? body.payment_request_token
    const incomingPaymentToken = body.paymentToken ?? body.payment_token

    if (!paymentRequestToken) {
      return Response.json({ error: 'Missing paymentRequestToken' }, { status: 400, headers: CORS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    )

    const { data: session, error: fetchError } = await supabase
      .from('payment_sessions')
      .select('payment_token')
      .eq('payment_request_token', paymentRequestToken)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!session) {
      return Response.json({ error: 'Payment session not found' }, { status: 404, headers: CORS })
    }

    const paymentToken = session.payment_token ?? incomingPaymentToken ?? `mock_${crypto.randomUUID()}`

    const { error: updateError } = await supabase
      .from('payment_sessions')
      .update({
        paid: true,
        payment_token: paymentToken,
        paid_at: new Date().toISOString(),
      })
      .eq('payment_request_token', paymentRequestToken)

    if (updateError) throw updateError

    return Response.json({ ok: true, payment_token: paymentToken }, { headers: CORS })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS })
  }
})

