import './style.css'
import { getLanguage, t } from './i18n.js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js'
import { markPlayed } from './payment.js'

const language = getLanguage()
const tm = (key, params) => t(language, 'main', key, params)

const data = (() => {
  try {
    const raw = sessionStorage.getItem('letter-quest-feedback')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
})()

const slug = data?.slug || ''
const requiresPayment = Boolean(data?.requiresPayment)
const paymentToken = data?.paymentToken || null
const WINNER_SAVED_KEY = paymentToken ? `letter-quest-winner-saved-${paymentToken}` : null

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
document.querySelector('#back-to-games').textContent = tm('backToGames')
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
const textarea = document.querySelector('#feedback-text')
const statusEl = document.querySelector('#feedback-status')
const winnerCard = document.querySelector('#card-winner')
const winnerName = document.querySelector('#winner-name')
const winnerPhone = document.querySelector('#winner-phone')
const winnerConfirm = document.querySelector('#winner-confirm')
const winnerConfirmYes = document.querySelector('#winner-confirm-yes')
const winnerConfirmNo = document.querySelector('#winner-confirm-no')
let playedMarked = false
let winnerSaved = (() => {
  if (!WINNER_SAVED_KEY) return false
  try {
    return localStorage.getItem(WINNER_SAVED_KEY) === '1'
  } catch {
    return false
  }
})()

saveWinnerBtn.textContent = tm('winnerSaveOnly')

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

backToGamesLink.addEventListener('click', (e) => {
  e.preventDefault()
  goToGames()
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

