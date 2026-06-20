/**
 * Create location tracking handlers for the game.
 *
 * @param {object} deps
 * @param {object} deps.state - Shared mutable game state.
 * @param {(key: string, params?: Record<string, unknown>) => string} deps.tm - Translation helper.
 * @param {() => void} deps.updateUi - UI refresh callback.
 * @param {() => void} deps.checkArrival - Arrival-check callback invoked after each position update.
 * @param {() => void} deps.playDoubleBeep - Audio cue callback played when the player moves away from the target.
 * @param {Geolocation} deps.geolocation - Browser Geolocation interface.
 * @param {(from: object, to: object, options: object) => boolean} deps.isQuickJump - Jump-detection helper.
 * @param {(lat1: number, lng1: number, lat2: number, lng2: number) => number} deps.distanceMeters - Haversine distance helper.
 * @param {{
 *   MAX_ALLOWED_GPS_ACCURACY_METERS: number,
 *   MAX_SPEED_METERS_PER_SECOND: number,
 *   MAX_JUMP_DISTANCE_METERS: number,
 *   BALANCED_TIMEOUT_MS: number,
 *   HIGH_ACCURACY_TIMEOUT_MS: number,
 * }} deps.constants - Location-tracking thresholds.
 * @returns {{
 *   handleLocationSuccess: (position: GeolocationPosition) => void,
 *   startWatch: (options: PositionOptions, fallbackToBalanced: boolean) => void,
 *   startLocationTracking: () => void,
 * }}
 */
export function createLocationTracking({
  state,
  tm,
  updateUi,
  checkArrival,
  playDoubleBeep,
  geolocation,
  isQuickJump,
  distanceMeters,
  constants,
}) {
  const {
    MAX_ALLOWED_GPS_ACCURACY_METERS,
    MAX_SPEED_METERS_PER_SECOND,
    MAX_JUMP_DISTANCE_METERS,
    BALANCED_TIMEOUT_MS,
    HIGH_ACCURACY_TIMEOUT_MS,
  } = constants;

  /**
   * Handle a successful geolocation update, validate quality and detect jumps, then trigger arrival checks.
   * @param {GeolocationPosition} position - Raw position object from the Geolocation API.
   */
  function handleLocationSuccess(position) {
    const candidate = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    };

    if (candidate.accuracy > MAX_ALLOWED_GPS_ACCURACY_METERS) {
      state.statusMessage = tm('gpsTooLow', {
        accuracy: Math.round(candidate.accuracy),
        need: MAX_ALLOWED_GPS_ACCURACY_METERS,
      });
      updateUi();
      return;
    }

    if (
      state.lastTrustedPosition
      && isQuickJump(state.lastTrustedPosition, candidate, {
        maxSpeedMetersPerSecond: MAX_SPEED_METERS_PER_SECOND,
        maxJumpDistanceMeters: MAX_JUMP_DISTANCE_METERS,
      })
    ) {
      state.statusMessage = tm('quickJump');
      updateUi();
      return;
    }

    state.userPosition = candidate;
    state.lastTrustedPosition = candidate;

    const currentTarget = state.route[state.currentLocationIndex];
    if (
      currentTarget
      && !state.pendingLetter
      && !state.pendingQuestion
      && !state.routeComplete
      && !currentTarget.image_url
      && !currentTarget.description
    ) {
      const newDistance = distanceMeters(
        candidate.latitude,
        candidate.longitude,
        currentTarget.lat,
        currentTarget.lng,
      );
      if (state.lastDistanceToTarget !== null && newDistance > state.lastDistanceToTarget + 10) {
        playDoubleBeep();
      }
      state.lastDistanceToTarget = newDistance;
    }

    checkArrival();
    updateUi();
  }

  /**
   * Start a `watchPosition` call and optionally retry with balanced accuracy on high-accuracy timeout.
   * @param {PositionOptions} options - Geolocation API options to pass to `watchPosition`.
   * @param {boolean} fallbackToBalanced - Whether to automatically retry with balanced accuracy on timeout.
   */
  function startWatch(options, fallbackToBalanced) {
    state.geoWatchId = geolocation.watchPosition(
      handleLocationSuccess,
      (error) => {
        if (error.code === error.TIMEOUT && fallbackToBalanced) {
          geolocation.clearWatch(state.geoWatchId);
          state.geoWatchId = null;
          state.statusMessage = tm('highAccTimeout');
          updateUi();
          startWatch({ enableHighAccuracy: false, maximumAge: 15000, timeout: BALANCED_TIMEOUT_MS }, false);
          return;
        }
        state.statusMessage = tm('locationError', { message: error.message });
        updateUi();
      },
      options,
    );
  }

  /** Start tracking after guard checks and initial status updates. */
  function startLocationTracking() {
    if (!geolocation) {
      state.statusMessage = tm('geolocationUnsupported');
      updateUi();
      return;
    }
    if (state.geoWatchId !== null) {
      state.statusMessage = tm('trackingActive');
      updateUi();
      return;
    }
    state.statusMessage = tm('requestingPermission');
    updateUi();
    startWatch({ enableHighAccuracy: true, maximumAge: 5000, timeout: HIGH_ACCURACY_TIMEOUT_MS }, true);
  }

  return {
    handleLocationSuccess,
    startWatch,
    startLocationTracking,
  };
}


