import './style.css';
import { getLanguage, t } from './i18n.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js';
import { getStoredPaymentToken, clearStoredPaymentToken, verifyPaymentToken } from './payment.js';
import { loadGameStyles } from './gameStyleService.js';
import { fetchGameForPlay } from './userConfigService.js';
import { buildWinnerSavePayload, getWinnerSlug, validateWinnerFields } from './winnerCore.js';
import { resolveWinnerAccess, resolveWinnerSaveError, storeWinnerDetails } from './winnerPageCore.js';

const language = getLanguage();
/** Shortcut for translating keys from the `main` section in winner view. */
const tm = (key, params) => t(language, 'main', key, params);

// ─── Resolve slug ────────────────────────────────────────────────────────────

const slug = getWinnerSlug(window.location.search);
const paymentToken = getStoredPaymentToken(slug);
const winnerAccess = resolveWinnerAccess({ slug, paymentToken });
if (!winnerAccess.ok) {
  window.location.replace(winnerAccess.redirectTo);
  throw new Error(winnerAccess.error);
}

// Note: winner details are NOT persisted in localStorage.
// Each new payment/game session requires fresh name+phone entry.
// Details are passed via sessionStorage to feedback page, then saved to DB via markPlayed.

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const nameInput = document.querySelector('#winner-name');
const phoneInput = document.querySelector('#winner-phone');
const saveBtn = document.querySelector('#winner-save-btn');
const statusEl = document.querySelector('#winner-status');

// ─── Translations ─────────────────────────────────────────────────────────────

document.querySelector('#winner-page-title').textContent = tm('winnerPageTitle');
document.querySelector('#winner-page-subtitle').textContent = tm('winnerPageSubtitle');
document.querySelector('#winner-form-heading').textContent = tm('winnerTitle');
document.querySelector('#winner-form-hint').textContent = tm('winnerHint');
nameInput.placeholder = tm('winnerName');
phoneInput.placeholder = tm('winnerPhone');
document.querySelector('#winner-phone-responsibility').textContent = tm('winnerPhoneResponsibility');
saveBtn.textContent = tm('winnerSaveBtn');

// ─── Load game styles + logo ──────────────────────────────────────────────────

/**
 * Load per-game styles and logo for the winner details page.
 * @returns {Promise<void>}
 */
async function loadPageStyles() {
  try {
    const game = await fetchGameForPlay(slug);
    if (!game) return;
    await loadGameStyles(game.id);
    if (game.logo_url) {
      const logo = document.querySelector('#game-logo');
      logo.src = game.logo_url;
      logo.classList.remove('hidden');
    }
  } catch {
    // Non-fatal — page still works without styles
  }
}

loadPageStyles();

// ─── Background token validation ──────────────────────────────────────────────

/**
 * Re-validate the payment token in the background and redirect if invalid.
 * @returns {Promise<void>}
 */
async function checkTokenInBackground() {
  try {
    const payment = await verifyPaymentToken(slug, paymentToken);
    if (!payment.paid || payment.played) {
      // Token revoked or already played → let the game page sort it out
      clearStoredPaymentToken(slug);
      window.location.replace(`/${slug}`);
    }
  } catch {
    // Ignore network errors — game page will re-validate on load
  }
}

checkTokenInBackground();

// ─── Save handler ─────────────────────────────────────────────────────────────

saveBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();

  const validation = validateWinnerFields(name, phone);
  if (!validation.valid) {
    statusEl.textContent = tm('winnerRequired');
    statusEl.classList.remove('hidden');
    if (validation.firstMissing === 'name') nameInput.focus();
    else phoneInput.focus();
    return;
  }

  statusEl.classList.add('hidden');
  saveBtn.disabled = true;
  saveBtn.textContent = tm('winnerSaving');

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/save-winner-details`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(buildWinnerSavePayload({ paymentToken, slug, name, phone })),
    });
    const json = await res.json();
    if (!res.ok) {
      saveBtn.disabled = false;
      saveBtn.textContent = tm('winnerSaveBtn');
      statusEl.textContent = resolveWinnerSaveError(json, res.statusText, tm('winnerSaveError'));
      statusEl.classList.remove('hidden');
      return;
    }

     // Pass name+phone to the game session via sessionStorage
     // (game will include these in feedback sessionStorage when game ends)
      storeWinnerDetails(sessionStorage, { name, phone });

     window.location.replace(`/${slug}`);
  } catch {
    saveBtn.disabled = false;
    saveBtn.textContent = tm('winnerSaveBtn');
    statusEl.textContent = tm('winnerSaveError');
    statusEl.classList.remove('hidden');
  }
});

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') phoneInput.focus(); });
phoneInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn.click(); });





