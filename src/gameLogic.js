/** Earth's mean radius in metres, used for Haversine calculations. */
const EARTH_RADIUS_METERS = 6371000;

/**
 * Convert degrees to radians.
 * @param {number} degrees
 * @returns {number}
 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculate the great-circle distance between two GPS coordinates using the Haversine formula.
 * @param {number} lat1 - Latitude of the first point in degrees.
 * @param {number} lng1 - Longitude of the first point in degrees.
 * @param {number} lat2 - Latitude of the second point in degrees.
 * @param {number} lng2 - Longitude of the second point in degrees.
 * @returns {number} Distance in metres.
 */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return EARTH_RADIUS_METERS * arc;
}

/**
 * Pick a random character from a letter pool string.
 * @param {string} [letterPool='ABCDEFGHIJKLMNOPQRSTUVWXYZ'] - Pool of characters to pick from.
 * @returns {string} A single character, or 'A' when the pool is empty.
 */
export function randomLetter(letterPool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
  if (!letterPool || letterPool.length === 0) {
    return 'A';
  }

  return letterPool[Math.floor(Math.random() * letterPool.length)];
}

/**
 * Compute travel distance, elapsed time, and speed between two timestamped positions.
 * @param {{ latitude: number, longitude: number, timestamp: number }} previousPosition
 * @param {{ latitude: number, longitude: number, timestamp: number }} nextPosition
 * @returns {{ distance: number, elapsedSeconds: number, speedMetersPerSecond: number }}
 */
export function travelMetrics(previousPosition, nextPosition) {
  const distance = distanceMeters(
    previousPosition.latitude,
    previousPosition.longitude,
    nextPosition.latitude,
    nextPosition.longitude,
  );

  const elapsedSeconds = (nextPosition.timestamp - previousPosition.timestamp) / 1000;
  const speedMetersPerSecond = elapsedSeconds > 0 ? distance / elapsedSeconds : Number.POSITIVE_INFINITY;

  return {
    distance,
    elapsedSeconds,
    speedMetersPerSecond,
  };
}

/**
 * Determine whether movement between two positions looks like a GPS jump
 * (i.e., the distance or speed exceeds configured limits).
 * @param {{ latitude: number, longitude: number, timestamp: number }} previousPosition
 * @param {{ latitude: number, longitude: number, timestamp: number }} nextPosition
 * @param {{ maxSpeedMetersPerSecond: number, maxJumpDistanceMeters: number }} limits
 * @returns {boolean} True when the movement is implausibly fast or far.
 */
export function isQuickJump(previousPosition, nextPosition, limits) {
  const { maxSpeedMetersPerSecond, maxJumpDistanceMeters } = limits;
  const metrics = travelMetrics(previousPosition, nextPosition);
  return (
    metrics.distance > maxJumpDistanceMeters || metrics.speedMetersPerSecond > maxSpeedMetersPerSecond
  );
}

/**
 * Validate an answer locally for offline mode.
 * Compares answer (case-insensitive, whitespace trimmed) against expected answer.
 * @param {string} givenAnswer - The answer provided by the player.
 * @param {string} correctAnswer - The expected answer from the location config.
 * @returns {boolean} True if the answer matches (case-insensitive).
 */
export function validateAnswerLocally(givenAnswer, correctAnswer) {
  const normalizedGiven = String(givenAnswer ?? '').trim().toLowerCase();
  const normalizedCorrect = String(correctAnswer ?? '').trim().toLowerCase();
  return normalizedGiven === normalizedCorrect;
}
