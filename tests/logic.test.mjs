import test from 'node:test'
import assert from 'node:assert/strict'

import { distanceMeters, randomLetter } from '../src/gameLogic.js'

test('distanceMeters returns 0 for the same point', () => {
  const meters = distanceMeters(52.3676, 4.9041, 52.3676, 4.9041)
  assert.equal(Math.round(meters), 0)
})

test('distanceMeters gives expected order of magnitude', () => {
  const meters = distanceMeters(52.3676, 4.9041, 52.3702, 4.8952)
  assert.ok(meters > 500)
  assert.ok(meters < 1000)
})

test('randomLetter always returns an uppercase letter', () => {
  for (let i = 0; i < 100; i += 1) {
    const letter = randomLetter()
    assert.match(letter, /^[A-Z]$/)
  }
})

