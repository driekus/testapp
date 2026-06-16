import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabaseClient.js'

const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 120000

const euro = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const PAYMENT_KEY = (slug) => `letter-quest-payment-${slug}`

export function formatEuro(cents) {
  return euro.format((Number(cents) || 0) / 100)
}

export function getStoredPaymentToken(slug) {
  if (!slug) return null
  try {
    return localStorage.getItem(PAYMENT_KEY(slug))
  } catch {
    return null
  }
}

export function storePaymentToken(slug, token) {
  if (!slug || !token) return
  try {
    localStorage.setItem(PAYMENT_KEY(slug), token)
  } catch {
    // Ignore unavailable storage in private mode.
  }
}

export function clearStoredPaymentToken(slug) {
  if (!slug) return
  try {
    localStorage.removeItem(PAYMENT_KEY(slug))
  } catch {
    // Ignore unavailable storage in private mode.
  }
}

async function callFunction(name, payload) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? res.statusText)
  return json
}

export async function verifyPaymentToken(slug, token) {
  if (!slug || !token) return { paid: false, payment_token: null, played: false }
  return callFunction('check-payment', { game_slug: slug, payment_token: token })
}

export async function startPayment(slug) {
  const json = await callFunction('create-payment', { game_slug: slug })
  if (!json?.url) throw new Error('No payment URL returned')
  window.location.href = json.url
}

export async function pollUntilPaid(slug, paymentRequestToken, onPaid) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const json = await callFunction('check-payment', {
      game_slug: slug,
      payment_request_token: paymentRequestToken,
    })

    if (json.paid && json.payment_token) {
      if (onPaid) onPaid(json.payment_token)
      return json
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error('Payment confirmation timed out')
}

export async function markPlayed(paymentToken, slug, name, phone, letters) {
  return callFunction('mark-played', {
    payment_token: paymentToken,
    game_slug: slug,
    player_name: name,
    player_phone: phone,
    letters_collected: letters,
  })
}

