import './style.css'
import { getLanguage, t } from './i18n.js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js'
import { loadGameStyles } from './gameStyleService.js'
import { markPlayed } from './payment.js'
import { buildRankingsUrl } from './scoreService.js'

const language = getLanguage()
const tm = (key, params) => t(language, 'main', key, params)

const data = (() => {
  try {
    const raw = sessionStorage.getItem('letter-quest-feedback')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
})()

const gameId = data?.gameId || ''
const slug = data?.slug || ''
const requiresPayment = Boolean(data?.requiresPayment)
const paymentToken = data?.paymentToken || null
const finalScore = Number(data?.score) || 0
const totalAnswerTimeMs = Number(data?.totalAnswerTimeMs) || 0
const WINNER_SAVED_KEY = paymentToken ? `letter-quest-winner-saved-${paymentToken}` : null
const FEEDBACK_DRAFT_KEY = `letter-quest-feedback-draft-${slug || 'default'}`

// Load custom game styles if we have a game ID
if (gameId) {
  loadGameStyles(gameId).catch((err) => {
    console.warn('feedback: error loading game styles', err)
  })
}

// ─── Populate page ───────────────────────────────────────────────────────────

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
document.querySelector('#feedback-thanks').textContent = tm('feedbackThanks')
const backToGamesLabel = document.querySelector('#back-to-games')
if (backToGamesLabel) backToGamesLabel.textContent = tm('backToGames')
document.querySelector('#score-summary-title').textContent = tm('scoreSummaryTitle')
document.querySelector('#score-summary-points').textContent = tm('scoreSummaryPoints', { score: finalScore })
document.querySelector('#score-summary-time').textContent = tm('scoreSummaryTime', {
  seconds: (totalAnswerTimeMs / 1000).toFixed(2),
})
document.querySelector('#score-summary-time').classList.toggle('hidden', totalAnswerTimeMs <= 0)
document.querySelector('#scoreboard-title').textContent = tm('scoreboardTitle')
document.querySelector('#scoreboard-hint').textContent = tm('scoreboardHintSeparate')
document.querySelector('#view-rankings-link').textContent = tm('viewRankings')
document.querySelector('#view-rankings-link').href = buildRankingsUrl(slug)
document.querySelector('#scoreboard-card').classList.toggle('hidden', !slug)
document.querySelector('[data-i18n="winnerTitle"]').textContent = tm('winnerTitle')
document.querySelector('[data-i18n="winnerHint"]').textContent = tm('winnerHint')
document.querySelector('[data-i18n="winnerPhoneResponsibility"]').textContent = tm('winnerPhoneResponsibility')
document.querySelector('#winner-name').placeholder = tm('winnerName')
document.querySelector('#winner-phone').placeholder = tm('winnerPhone')
document.querySelector('#winner-confirm-text').textContent = tm('winnerConfirmMissing')
document.querySelector('#winner-confirm-yes').textContent = tm('winnerConfirmYes')
document.querySelector('#winner-confirm-no').textContent = tm('winnerConfirmNo')

// ─── Submit ──────────────────────────────────────────────────────────────────

const submitBtn = document.querySelector('#submit-feedback-btn')
const skipBtn = document.querySelector('#skip-feedback-btn')
const saveWinnerBtn = document.querySelector('#save-winner-btn')
const backToGamesLink = document.querySelector('#back-to-games')
const viewRankingsLink = document.querySelector('#view-rankings-link')
const textarea = document.querySelector('#feedback-text')
const statusEl = document.querySelector('#feedback-status')
const winnerCard = document.querySelector('#card-winner')
const winnerName = document.querySelector('#winner-name')
const winnerPhone = document.querySelector('#winner-phone')
const winnerConfirm = document.querySelector('#winner-confirm')
const winnerConfirmYes = document.querySelector('#winner-confirm-yes')
const winnerConfirmNo = document.querySelector('#winner-confirm-no')
let playedMarked = false
let allowPageExit = false
let winnerSaved = (() => {
  if (!WINNER_SAVED_KEY) return false
  try {
    return localStorage.getItem(WINNER_SAVED_KEY) === '1'
  } catch {
    return false
  }
})()

saveWinnerBtn.textContent = tm('winnerSaveOnly')

function saveDraft() {
  try {
    localStorage.setItem(FEEDBACK_DRAFT_KEY, JSON.stringify({
      feedback: textarea.value,
      winnerName: winnerName.value,
      winnerPhone: winnerPhone.value,
    }))
  } catch {
    // Ignore private mode / unavailable storage.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(FEEDBACK_DRAFT_KEY)
  } catch {
    // Ignore private mode / unavailable storage.
  }
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(FEEDBACK_DRAFT_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    textarea.value = String(parsed.feedback ?? '')
    winnerName.value = String(parsed.winnerName ?? '')
    winnerPhone.value = String(parsed.winnerPhone ?? '')
  } catch {
    // Ignore malformed draft data.
  }
}

restoreDraft()
textarea.addEventListener('input', saveDraft)
winnerName.addEventListener('input', saveDraft)
winnerPhone.addEventListener('input', saveDraft)

async function refreshWinnerVisibility() {
  if (!requiresPayment) return

  if (!winnerSaved && paymentToken) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/check-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ payment_token: paymentToken, game_slug: slug }),
      })
      const json = await res.json()
      if (res.ok && json.played) {
        winnerSaved = true
        playedMarked = true
        if (WINNER_SAVED_KEY) {
          try { localStorage.setItem(WINNER_SAVED_KEY, '1') } catch { /* ignore */ }
        }
      }
    } catch {
      // If status cannot be fetched, fall back to the local state.
    }
  }

  const showWinnerForm = !winnerSaved
  winnerCard.classList.toggle('hidden', !showWinnerForm)
  saveWinnerBtn.classList.toggle('hidden', !showWinnerForm)
}

refreshWinnerVisibility()

function goToGames() {
  // Cache-busting query avoids stale app shell/page cache after feedback navigation.
  window.location.replace(`/?refresh=${Date.now()}`)
}

function hasUnsavedFormInput() {
  return Boolean(
    textarea.value.trim()
    || winnerName.value.trim()
    || winnerPhone.value.trim(),
  )
}

async function confirmLeaveWithUnsavedInput() {
  if (!hasUnsavedFormInput()) return true
  return window.confirm(tm('feedbackLeaveConfirm'))
}

window.addEventListener('beforeunload', (event) => {
  if (allowPageExit || !hasUnsavedFormInput()) return
  event.preventDefault()
  event.returnValue = ''
})

backToGamesLink?.addEventListener('click', (e) => {
  e.preventDefault()
  confirmLeaveWithUnsavedInput().then((confirmed) => {
    if (!confirmed) return
    allowPageExit = true
    goToGames()
  })
})

viewRankingsLink?.addEventListener('click', (e) => {
  e.preventDefault()
  confirmLeaveWithUnsavedInput().then((confirmed) => {
    if (!confirmed) return
    allowPageExit = true
    window.location.href = viewRankingsLink.href
  })
})

async function markPlayedIfNeeded() {
  if (playedMarked || !requiresPayment || !paymentToken || !slug) return
  await markPlayed(
    paymentToken,
    slug,
    winnerName.value.trim(),
    winnerPhone.value.trim(),
    data?.letters ?? [],
  )
  playedMarked = true
  if (WINNER_SAVED_KEY) {
    try {
      localStorage.setItem(WINNER_SAVED_KEY, '1')
    } catch {
      // Ignore unavailable storage in private mode.
    }
  }
  winnerSaved = true
  winnerCard.classList.add('hidden')
}

function hideWinnerConfirm() {
  winnerConfirm.classList.add('hidden')
}

async function confirmMissingWinnerFields() {
  if (!requiresPayment || winnerSaved) return true
  if (winnerName.value.trim() && winnerPhone.value.trim()) return true

  winnerConfirm.classList.remove('hidden')
  return new Promise((resolve) => {
    winnerConfirmYes.onclick = () => {
      hideWinnerConfirm()
      resolve(true)
    }
    winnerConfirmNo.onclick = () => {
      hideWinnerConfirm()
      resolve(false)
    }
  })
}

skipBtn.addEventListener('click', async () => {
  if (!(await confirmMissingWinnerFields())) return
  skipBtn.disabled = true
  saveWinnerBtn.disabled = true
  try {
    await markPlayedIfNeeded()
    clearDraft()
    allowPageExit = true
  } catch {
    // Do not block leaving the page if mark-played fails.
  }
  goToGames()
})

submitBtn.addEventListener('click', async () => {
  const message = textarea.value.trim()
  if (!message) return
  if (!(await confirmMissingWinnerFields())) return

  submitBtn.disabled = true
  saveWinnerBtn.disabled = true
  submitBtn.textContent = tm('feedbackSending')
  statusEl.classList.add('hidden')

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ slug, message }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? res.statusText)
    await markPlayedIfNeeded()
    clearDraft()
    allowPageExit = true
    goToGames()
  } catch {
    submitBtn.disabled = false
    saveWinnerBtn.disabled = false
    submitBtn.textContent = tm('feedbackSubmit')
    statusEl.textContent = tm('feedbackError')
    statusEl.classList.remove('hidden')
  }
})

saveWinnerBtn.addEventListener('click', async () => {
  if (!(await confirmMissingWinnerFields())) return

  saveWinnerBtn.disabled = true
  statusEl.classList.add('hidden')

  try {
    await markPlayedIfNeeded()
    statusEl.textContent = tm('winnerSavedNotice')
    statusEl.classList.remove('hidden')
    submitBtn.disabled = false
    skipBtn.disabled = false
  } catch {
    saveWinnerBtn.disabled = false
    statusEl.textContent = tm('feedbackError')
    statusEl.classList.remove('hidden')
  }
})

