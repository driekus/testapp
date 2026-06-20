/**
 * Resolves whether the current player can enter a paid game.
 *
 * @param {object} deps
 * @param {object} deps.state Shared mutable game state.
 * @param {string} deps.slug Current game slug.
 * @param {Window} deps.windowRef Browser window reference.
 * @param {() => void} deps.updateUi UI refresh callback.
 * @param {(messageKey: string, buttonKey?: string, hideButton?: boolean) => void} deps.showPaymentCard Payment card renderer.
 * @param {object} deps.paymentApi Payment helper functions.
 * @param {(slug: string) => string | null} deps.paymentApi.getStoredPaymentToken
 * @param {(slug: string) => void} deps.paymentApi.clearStoredPaymentToken
 * @param {(slug: string, token: string) => Promise<any>} deps.paymentApi.verifyPaymentToken
 * @param {(slug: string, requestToken: string, onPaid: (token: string) => void) => Promise<any>} deps.paymentApi.pollUntilPaid
 * @param {(slug: string, token: string) => void} deps.paymentApi.storePaymentToken
 * @returns {Promise<boolean>} True when access is granted.
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
  const params = new URLSearchParams(windowRef.location.search);
  const paymentRequestToken = params.get('payment_request_token');
  const storedToken = paymentApi.getStoredPaymentToken(slug);
  let alreadyPlayed = false;

  if (storedToken) {
    try {
      const payment = await paymentApi.verifyPaymentToken(slug, storedToken);
      if (payment.paid && payment.payment_token && !payment.played) {
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
      state.paymentToken = payment.payment_token;
      state.paymentReady = true;
      updateUi();
      windowRef.history.replaceState({}, '', `/${slug}`);
      return true;
    } catch {
      showPaymentCard('payToPlay');
      return false;
    }
  }

  showPaymentCard(alreadyPlayed ? 'alreadyPlayed' : 'payToPlay', alreadyPlayed ? 'payAgain' : 'payButton');
  return false;
}

