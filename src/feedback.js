import './style.css'
import { getLanguage, t } from './i18n.js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js'
import { loadGameStyles } from './gameStyleService.js'
import { markPlayed } from './payment.js'
import { buildRankingsUrl, setScoreDisplayName, setScoreDisplayNameBySession } from './scoreService.js'

const language = getLanguage()
const tm = (key, params) => t(language, 'main', key, params)

// ─── Session data ─────────────────────────────────────────────────────────────

const data = (() => {
  try {
    const raw = sessionStorage.getItem('letter-quest-feedback')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
})()

const gameId          = data?.gameId || ''
const slug            = data?.slug || ''
const requiresPayment = Boolean(data?.requiresPayment)
const paymentToken    = data?.paymentToken || null
const finalScore      = Number(data?.score) || 0
const totalAnswerTimeMs = Number(data?.totalAnswerTimeMs) || 0
const playerId        = data?.playerId || ''
const winnerName      = String(data?.winnerName ?? '').trim()
const winnerPhone     = String(data?.winnerPhone ?? '').trim()

// ─── Load game styles ─────────────────────────────────────────────────────────

if (gameId) {
  loadGameStyles(gameId).catch((err) => {
    console.warn('feedback: error loading game styles', err)
  })
}

// ─── Populate page ────────────────────────────────────────────────────────────

if (data?.logoUrl) {
  const logo = document.querySelector('#game-logo')
  logo.src = data.logoUrl
  logo.classList.remove('hidden')
}

document.querySelector('#feedback-title').textContent = data?.displayName
  ? `🎉 ${data.displayName}`
  : tm('feedbackTitle')
document.querySelector('#feedback-subtitle').textContent = tm('feedbackSubtitle')
document.querySelector('#letters-label').textContent = tm('feedbackLetters')
document.querySelector('#collected-letters').textContent =
  data?.letters?.length ? data.letters.join('  ') : '—'
document.querySelector('#feedback-prompt').textContent = tm('feedbackPrompt')
document.querySelector('#feedback-text').placeholder = tm('feedbackPlaceholder')
document.querySelector('#submit-feedback-btn').textContent = tm('feedbackSubmit')
document.querySelector('#skip-feedback-btn').textContent = tm('feedbackSkip')
document.querySelector('#score-summary-title').textContent = tm('scoreSummaryTitle')
document.querySelector('#score-summary-points').textContent = tm('scoreSummaryPoints', { score: finalScore })
document.querySelector('#score-summary-time').textContent = tm('scoreSummaryTime', {
  seconds: (totalAnswerTimeMs / 1000).toFixed(2),
})
document.querySelector('#score-summary-time').classList.toggle('hidden', totalAnswerTimeMs <= 0)

// ─── Navigation ───────────────────────────────────────────────────────────────

function goToRankings() {
  window.location.href = buildRankingsUrl(slug)
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function doMarkPlayed() {
  if (!requiresPayment || !paymentToken || !slug) return
  try {
    await markPlayed(paymentToken, slug, winnerName, winnerPhone, data?.letters ?? [])
  } catch (err) {
    console.warn('feedback: could not mark played', err)
  }
}

async function doSetScoreDisplayName() {
  // Set display name for ALL games (both paid and free).
  // For paid games: use player_session_id (unique per play session) to avoid overwriting other plays
  // For free games: use player_id (one name per player per game)
  const name = winnerName  // already set correctly: paid uses winner name, free uses player name
  if (!name || !gameId) {
    return
  }

  try {
    if (requiresPayment) {
      // Paid game: set by session to allow different names per payment
      const playerSessionId = data?.playerSessionId
      if (!playerSessionId) return
      await setScoreDisplayNameBySession({ game_id: gameId, player_session_id: playerSessionId, display_name: name })
    } else {
      // Free game: set by player_id (one name per player)
      if (!playerId) return
      await setScoreDisplayName({ game_id: gameId, player_id: playerId, display_name: name })
    }
  } catch (err) {
    console.warn('feedback: could not set display name', err)
  }
}

// ─── Submit handler ───────────────────────────────────────────────────────────

const submitBtn = document.querySelector('#submit-feedback-btn')
const skipBtn   = document.querySelector('#skip-feedback-btn')
const textarea  = document.querySelector('#feedback-text')
const statusEl  = document.querySelector('#feedback-status')

submitBtn.addEventListener('click', async () => {
  const message = textarea.value.trim()
  if (!message) {
    // Treat empty submit as skip
    skipBtn.click()
    return
  }

  submitBtn.disabled = true
  skipBtn.disabled = true
  submitBtn.textContent = tm('feedbackSending')
  statusEl.classList.add('hidden')

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ slug, message }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? res.statusText)

    await Promise.allSettled([doMarkPlayed(), doSetScoreDisplayName()])
    goToRankings()
  } catch {
    submitBtn.disabled = false
    skipBtn.disabled = false
    submitBtn.textContent = tm('feedbackSubmit')
    statusEl.textContent = tm('feedbackError')
    statusEl.classList.remove('hidden')
  }
})

// ─── Skip handler ─────────────────────────────────────────────────────────────

skipBtn.addEventListener('click', async () => {
  skipBtn.disabled = true
  submitBtn.disabled = true
  try {
    await Promise.allSettled([doMarkPlayed(), doSetScoreDisplayName()])
  } catch { /* non-fatal */ }
  goToRankings()
})

