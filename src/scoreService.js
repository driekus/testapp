import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabaseClient.js'

export const SCORE_EVENT_TYPES = {
  LOCATION_FOUND: 'location_found',
  ARRIVAL_CONFIRMED: 'arrival_confirmed',
  ANSWER_CORRECT: 'answer_correct',
  QUESTION_SKIPPED: 'question_skipped',
}

function createId() {
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function getPlayerId(slug) {
  if (!slug) return ''

  const key = `letter-quest-player-${slug}`
  try {
    const existing = localStorage.getItem(key)
    if (existing) return existing

    const created = createId()
    localStorage.setItem(key, created)
    return created
  } catch {
    return createId()
  }
}

export function createPlaySessionId() {
  return createId()
}

export function buildRankingsUrl(slug) {
  const params = new URLSearchParams()
  if (slug) params.set('slug', slug)
  const query = params.toString()
  return query ? `/rankings.html?${query}` : '/rankings.html'
}

function scoreFunctionUrl(name) {
  return `${SUPABASE_URL}/functions/v1/${name}`
}

async function callScoreFunction(name, payload) {
  const res = await fetch(scoreFunctionUrl(name), {
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

export function buildScoreEventKey(routeId, locationIndex, eventType) {
  return `${routeId}:${locationIndex}:${eventType}`
}

export async function recordScoreEvent(payload) {
  return callScoreFunction('record-score-event', payload)
}

export async function fetchScoreboard(payload) {
  return callScoreFunction('get-scoreboard', payload)
}



