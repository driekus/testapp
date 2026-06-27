/**
 * Resolve whether the current player can enter a paid game.
 * Checks a stored token first; if absent, polls for a pending payment request.
 * Returns `false` and shows the payment card when access cannot be confirmed.
 *
 * @param {object} deps
 * @param {object} deps.state - Shared mutable game state.
 * @param {string} deps.slug - Current game slug.
 * @param {Window} deps.windowRef - Browser window reference.
 * @param {() => void} deps.updateUi - UI refresh callback.
 * @param {(messageKey: string, buttonKey?: string, hideButton?: boolean) => void} deps.showPaymentCard - Renders the payment card with translated copy.
 * @param {{ getStoredPaymentToken: (slug: string) => string | null, clearStoredPaymentToken: (slug: string) => void, getStoredPaymentRequestToken: (slug: string) => string | null, clearStoredPaymentRequestToken: (slug: string) => void, verifyPaymentToken: (slug: string, token: string) => Promise<{ paid: boolean, payment_token: string | null, played: boolean }>, pollUntilPaid: (slug: string, requestToken: string, onPaid: (token: string) => void) => Promise<{ payment_token: string }>, storePaymentToken: (slug: string, token: string) => void }} deps.paymentApi - Payment helper functions.
 * @returns {Promise<boolean>} `true` when access is granted, `false` otherwise.
 */
export async function resolvePaymentAccess({
  state,
  slug,
  windowRef,
  updateUi,
  showPaymentCard,
  paymentApi,
}) {
  state.paymentReady = false;
  const paymentRequestToken = paymentApi.getStoredPaymentRequestToken(slug);
  const storedToken = paymentApi.getStoredPaymentToken(slug);
  let alreadyPlayed = false;

  if (storedToken) {
    try {
      const payment = await paymentApi.verifyPaymentToken(slug, storedToken);
      if (payment.paid && payment.payment_token && !payment.played) {
        paymentApi.clearStoredPaymentRequestToken(slug);
        state.paymentToken = payment.payment_token;
        state.paymentReady = true;
        updateUi();
        return true;
      }
      alreadyPlayed = Boolean(payment.played);
      paymentApi.clearStoredPaymentToken(slug);
      state.paymentToken = null;
    } catch {
      paymentApi.clearStoredPaymentToken(slug);
    }
  }

  if (paymentRequestToken) {
    showPaymentCard('paymentPending', 'payButton', true);
    try {
      const payment = await paymentApi.pollUntilPaid(slug, paymentRequestToken, (token) => {
        paymentApi.storePaymentToken(slug, token);
      });
      paymentApi.clearStoredPaymentRequestToken(slug);
      state.paymentToken = payment.payment_token;
      state.paymentReady = true;
      updateUi();
      return true;
    } catch {
      paymentApi.clearStoredPaymentRequestToken(slug);
      showPaymentCard('payToPlay');
      return false;
    }
  }

  showPaymentCard(alreadyPlayed ? 'alreadyPlayed' : 'payToPlay', alreadyPlayed ? 'payAgain' : 'payButton');
  return false;
}

