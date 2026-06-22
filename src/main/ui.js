/**
 * Create UI helpers for the main game screen.
 *
 * @param {object} deps
 * @param {object} deps.state - Shared mutable game state.
 * @param {(key: string, params?: Record<string, unknown>) => string} deps.tm - Translation helper.
 * @param {(cents: number) => string} deps.formatEuro - Currency formatter.
 * @param {(slug: string) => string} deps.buildRankingsUrl - Rankings URL builder.
 * @param {string} deps.slug - Current game slug.
 * @param {(lat1: number, lng1: number, lat2: number, lng2: number) => number} deps.distanceMeters - Haversine distance helper.
 * @param {{ LOCATION_RADIUS_METERS: number, MAX_ALLOWED_GPS_ACCURACY_METERS: number }} deps.constants - Location radius and GPS accuracy thresholds.
 * @returns {{
 *   getEls: () => Record<string, HTMLElement | null>,
 *   setElements: (els: Record<string, HTMLElement | null>) => void,
 *   showScoreToast: (points: number) => void,
 *   updatePaidBadge: () => void,
 *   showPaymentCard: (messageKey: string, buttonKey?: string, hideButton?: boolean) => void,
 *   updateUi: () => void,
 * }}
 */
export function createUiController({ state, tm, formatEuro, buildRankingsUrl, slug, distanceMeters, constants }) {
  const { LOCATION_RADIUS_METERS, MAX_ALLOWED_GPS_ACCURACY_METERS } = constants;

  /** @type {Record<string, HTMLElement | null>} */
  let els = {};
  let scoreToastTimer = null;

  /**
   * Query and return all cached DOM elements used by the game UI.
   * @returns {Record<string, HTMLElement | null>}
   */
   function getEls() {
     return {
       gameTitle: document.querySelector('#game-title'),
       paidBadge: document.querySelector('#paid-badge'),
       configStatus: document.querySelector('#config-status'),
       cardPayment: document.querySelector('#card-payment'),
       paymentMessage: document.querySelector('#payment-message'),
       payAndPlay: document.querySelector('#pay-and-play'),
       cardOffline: document.querySelector('#card-offline'),
       offlineMessage: document.querySelector('#offline-message'),
       downloadOffline: document.querySelector('#download-offline'),
       offlineStatus: document.querySelector('#offline-status'),
       cardName: document.querySelector('#card-name'),
       playerNameInput: document.querySelector('#player-name-input'),
       startWithName: document.querySelector('#start-with-name'),
       cardTarget: document.querySelector('#card-target'),
       cardProgress: document.querySelector('#card-progress'),
       cardLocation: document.querySelector('#card-location'),
       cardStatus: document.querySelector('#card-status'),
       cardQuestion: document.querySelector('#card-question'),
       questionText: document.querySelector('#question-text'),
       answerInput: document.querySelector('#answer-input'),
       answerFeedback: document.querySelector('#answer-feedback'),
       submitAnswer: document.querySelector('#submit-answer'),
       skipQuestion: document.querySelector('#skip-question'),
       routeBadge: document.querySelector('#route-badge'),
       targetName: document.querySelector('#target-name'),
       gameLogo: document.querySelector('#game-logo'),
       locationImage: document.querySelector('#location-image'),
       locationDescription: document.querySelector('#location-description'),
       distance: document.querySelector('#distance'),
       progress: document.querySelector('#progress'),
       letters: document.querySelector('#letters'),
       scoreTotal: document.querySelector('#score-total'),
       scoreToast: document.querySelector('#score-toast'),
       status: document.querySelector('#status'),
       pendingLetter: document.querySelector('#pending-letter'),
       rankingsLink: document.querySelector('#rankings-link'),
       enableLocation: document.querySelector('#enable-location'),
       confirmLetter: document.querySelector('#confirm-letter'),
       nextRoute: document.querySelector('#next-route'),
     };
   }

  /**
   * Replace the current element cache.
   * @param {Record<string, HTMLElement | null>} nextEls
   */
  function setElements(nextEls) {
    els = nextEls;
  }

  /**
   * Show a temporary score delta toast for the given point value.
   * Positive values show a gain message; negative values show a penalty message.
   * @param {number} points - Point delta to display (positive or negative).
   */
  function showScoreToast(points) {
    if (!els.scoreToast || !Number.isFinite(points) || points === 0) return;

    els.scoreToast.textContent = points > 0
      ? tm('scoreLastGain', { points })
      : tm('scoreLastPenalty', { points: Math.abs(points) });
    els.scoreToast.classList.remove('hidden');
    if (scoreToastTimer) clearTimeout(scoreToastTimer);
    scoreToastTimer = setTimeout(() => {
      els.scoreToast.classList.add('hidden');
    }, 2200);
  }

  /** Update or hide the paid-game badge based on current game state. */
  function updatePaidBadge() {
    if (!els.paidBadge) return;
    if (!state.requiresPayment) {
      els.paidBadge.classList.add('hidden');
      return;
    }
    els.paidBadge.textContent = `🔒 ${tm('paidGame')} - ${formatEuro(state.priceInCents)}`;
    els.paidBadge.classList.remove('hidden');
  }

  /**
   * Show the payment card with translated copy and the correct button state.
   * @param {string} messageKey - i18n key for the message body.
   * @param {string} [buttonKey='payButton'] - i18n key for the action button label.
   * @param {boolean} [hideButton=false] - When `true`, hides the action button (e.g. while polling).
   */
  function showPaymentCard(messageKey, buttonKey = 'payButton', hideButton = false) {
    if (!els.cardPayment || !els.paymentMessage || !els.payAndPlay) return;
    els.cardPayment.classList.remove('hidden');
    els.paymentMessage.textContent = tm(messageKey);
    els.payAndPlay.textContent = tm(buttonKey);
    els.payAndPlay.disabled = false;
    els.payAndPlay.classList.toggle('hidden', hideButton);
  }

  /** Re-render the main game UI for the current state snapshot. */
  function updateUi() {
    if (!els.cardPayment) return;

    const totalRoutes = state.gameRoutes.length;
    const currentRouteData = state.gameRoutes[state.currentRouteIndex];
    const currentTarget = state.route[state.currentLocationIndex];

    updatePaidBadge();
    if (els.scoreTotal) {
      els.scoreTotal.textContent = tm('scoreTotal', { score: state.score });
    }

    // Avoid card flicker before game type is resolved (free vs paid).
    if (!state.gameId) {
      els.cardPayment.classList.add('hidden');
      els.cardName?.classList.add('hidden');
      els.cardTarget?.classList.add('hidden');
      els.cardProgress?.classList.add('hidden');
      els.cardLocation?.classList.add('hidden');
      els.cardStatus?.classList.add('hidden');
      els.cardQuestion?.classList.add('hidden');
      return;
    }

     if (state.requiresPayment && !state.paymentReady) {
       els.cardPayment.classList.remove('hidden');
       els.cardOffline?.classList.add('hidden');
       els.cardTarget?.classList.add('hidden');
       els.cardProgress?.classList.add('hidden');
       els.cardLocation?.classList.add('hidden');
       els.cardStatus?.classList.add('hidden');
       els.cardQuestion?.classList.add('hidden');
       return;
     }

     els.cardPayment.classList.add('hidden');

     // Show offline download card if offline mode is supported and not yet downloaded
     if (state.supportsOffline && !state.offlineMode && state.nameConfirmed && state.geoWatchId === null) {
       els.cardOffline?.classList.remove('hidden');
       els.cardTarget?.classList.add('hidden');
       els.cardProgress?.classList.add('hidden');
       els.cardLocation?.classList.add('hidden');
       els.cardStatus?.classList.add('hidden');
       els.cardQuestion?.classList.add('hidden');
       if (els.offlineStatus && state.offlineCacheExpiry) {
         const expiryDate = new Date(state.offlineCacheExpiry);
         els.offlineStatus.textContent = tm('offlineCacheExpiry', {
           date: expiryDate.toLocaleDateString(),
         });
       }
       return;
     }

     els.cardOffline?.classList.add('hidden');

    // For free games: show the optional name prompt before enabling location
    if (state.gameId && !state.requiresPayment && !state.nameConfirmed) {
      els.cardName?.classList.remove('hidden');
      els.cardLocation?.classList.add('hidden');
      els.cardTarget?.classList.add('hidden');
      els.cardProgress?.classList.add('hidden');
      els.cardStatus?.classList.add('hidden');
      els.cardQuestion?.classList.add('hidden');
      return;
    }
    els.cardName?.classList.add('hidden');

    // When location is not yet enabled, show only the location card
    const locationActive = state.geoWatchId !== null;
    els.cardLocation?.classList.toggle('hidden', locationActive);
    els.cardTarget?.classList.toggle('hidden', !locationActive);
    els.cardProgress?.classList.toggle('hidden', !locationActive);
    els.cardStatus?.classList.toggle('hidden', !locationActive);

    if (!locationActive) return;

    // While a question must be answered, show only the question card
    if (state.pendingQuestion) {
      const questionTarget = state.route[state.currentLocationIndex];
      els.cardQuestion?.classList.remove('hidden');
      els.cardTarget?.classList.add('hidden');
      els.cardProgress?.classList.add('hidden');
      els.cardStatus?.classList.add('hidden');
      if (els.questionText) els.questionText.textContent = questionTarget?.question ?? '';
      if (els.skipQuestion) {
        els.skipQuestion.textContent = tm('continueWithoutAnswer');
        els.skipQuestion.disabled = state.checking;
      }
      if (els.answerFeedback) {
        els.answerFeedback.classList.toggle('hidden', !state.answerWrong);
        if (state.answerWrong) {
          const limit = questionTarget?.max_attempts || 0;
          if (limit > 0 && state.answerAttempts >= limit) {
            els.answerFeedback.textContent = tm('maxAttemptsReached', { max: limit });
          } else {
            els.answerFeedback.textContent = limit > 0
              ? tm('answerWrongWithLimit', { attempts: state.answerAttempts, max: limit })
              : tm('answerWrong');
          }
        }
      }
      return;
    }

    els.cardQuestion?.classList.add('hidden');

    // Show only the status card when a letter is pending confirmation
    const focusStatus = Boolean(state.pendingLetter) && !state.routeComplete;
    els.cardTarget?.classList.toggle('hidden', focusStatus);
    els.cardProgress?.classList.toggle('hidden', focusStatus);

    if (els.gameTitle) els.gameTitle.textContent = state.displayName || tm('title');
    if (els.configStatus) els.configStatus.textContent = state.configStatus;
    if (els.rankingsLink) {
      const showRankings = Boolean(state.gameId);
      els.rankingsLink.href = buildRankingsUrl(slug);
      els.rankingsLink.textContent = tm('viewRankings');
      els.rankingsLink.classList.toggle('hidden', !showRankings);
    }

    // Route badge: "Route 2 of 3"
    if (totalRoutes > 1 && currentRouteData) {
      if (els.routeBadge) {
        els.routeBadge.textContent = tm('routeBadge', {
          current: state.currentRouteIndex + 1,
          total: totalRoutes,
          name: currentRouteData.display_name,
        });
        els.routeBadge.classList.remove('hidden');
      }
    } else {
      els.routeBadge?.classList.add('hidden');
    }

    // All routes complete
    if (state.currentRouteIndex >= totalRoutes && totalRoutes > 0) {
      if (els.targetName) els.targetName.textContent = tm('allCompleted');
      if (els.distance) els.distance.textContent = '';
      els.locationImage?.classList.add('hidden');
      if (els.progress) els.progress.textContent = tm('greatJob');
      if (els.pendingLetter) els.pendingLetter.textContent = '';
      if (els.confirmLetter) els.confirmLetter.disabled = true;
      els.nextRoute?.classList.add('hidden');
      if (els.status) els.status.textContent = state.statusMessage;
      if (els.letters) els.letters.textContent = `${tm('letters')}: ${state.collectedLetters.join(' ')}`;
      return;
    }

    // Between routes - waiting for player to tap "start next route"
    if (state.routeComplete) {
      if (els.targetName) els.targetName.textContent = '';
      if (els.distance) els.distance.textContent = '';
      if (els.confirmLetter) els.confirmLetter.disabled = true;
      if (els.nextRoute) {
        els.nextRoute.classList.remove('hidden');
        els.nextRoute.textContent = currentRouteData
          ? tm('startNextRouteNamed', { name: currentRouteData.display_name })
          : tm('startNextRoute');
      }
      if (els.status) els.status.textContent = state.statusMessage;
      if (els.letters) els.letters.textContent = `${tm('letters')}: ${state.collectedLetters.join(' ')}`;
      if (els.progress) {
        els.progress.textContent = tm('routeCompletedProgress', {
          done: state.currentRouteIndex,
          total: totalRoutes,
        });
      }
      return;
    }

    els.nextRoute?.classList.add('hidden');

    if (!currentTarget) {
      if (els.targetName) els.targetName.textContent = tm('allCompleted');
      if (els.distance) els.distance.textContent = '';
      if (els.progress) els.progress.textContent = tm('greatJob');
      if (els.pendingLetter) els.pendingLetter.textContent = '';
      if (els.confirmLetter) els.confirmLetter.disabled = true;
      if (els.status) els.status.textContent = state.statusMessage;
      if (els.letters) els.letters.textContent = `${tm('letters')}: ${state.collectedLetters.join(' ')}`;
      return;
    }

    if (els.targetName) els.targetName.textContent = `${state.currentLocationIndex + 1}. ${currentTarget.name}`;
    if (els.progress) {
      els.progress.textContent = tm('completed', {
        count: state.currentLocationIndex,
        routeTotal: state.route.length,
        route: state.currentRouteIndex + 1,
        total: totalRoutes,
      });
    }
    if (els.letters) {
      els.letters.textContent = state.collectedLetters.length
        ? `${tm('letters')}: ${state.collectedLetters.join(' ')}`
        : tm('lettersEmpty');
    }
    if (els.status) els.status.textContent = state.statusMessage;
    if (els.pendingLetter) {
      els.pendingLetter.textContent = state.pendingLetter
        ? tm('pendingLetter', { letter: state.pendingLetter })
        : '';
    }
    if (els.confirmLetter) els.confirmLetter.disabled = !state.pendingLetter;

    // Show image and/or description as hint, or distance - hints suppress distance
    if (currentTarget.image_url) {
      if (els.locationImage) {
        els.locationImage.src = currentTarget.image_url;
        els.locationImage.classList.remove('hidden');
      }
    } else if (els.locationImage) {
      els.locationImage.classList.add('hidden');
      els.locationImage.src = '';
    }

    if (currentTarget.description) {
      if (els.locationDescription) {
        els.locationDescription.textContent = currentTarget.description;
        els.locationDescription.classList.remove('hidden');
      }
    } else if (els.locationDescription) {
      els.locationDescription.classList.add('hidden');
      els.locationDescription.textContent = '';
    }

    if (currentTarget.image_url || currentTarget.description) {
      if (els.distance) els.distance.textContent = '';
    } else if (state.userPosition) {
      const effectiveRadius = Math.min(
        MAX_ALLOWED_GPS_ACCURACY_METERS,
        Math.max(LOCATION_RADIUS_METERS, state.userPosition.accuracy),
      );
      const meters = Math.round(
        distanceMeters(
          state.userPosition.latitude,
          state.userPosition.longitude,
          currentTarget.lat,
          currentTarget.lng,
        ),
      );
      if (els.distance) {
        els.distance.textContent = tm('distanceLine', {
          meters,
          target: Math.round(effectiveRadius),
          base: LOCATION_RADIUS_METERS,
          accuracy: Math.round(state.userPosition.accuracy),
        });
      }
    } else if (els.distance) {
      els.distance.textContent = tm('distanceUnknown');
    }
  }

  return {
    getEls,
    setElements,
    showScoreToast,
    updatePaidBadge,
    showPaymentCard,
    updateUi,
  };
}


