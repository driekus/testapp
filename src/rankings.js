import './style.css'
import { getLanguage, t } from './i18n.js'
import { loadGameStyles } from './gameStyleService.js'
import { buildRankingsUrl, fetchScoreboard, getPlayerId } from './scoreService.js'
import { fetchGameForPlay } from './userConfigService.js'

const language = getLanguage()
const tm = (key, params) => t(language, 'main', key, params)

const params = new URLSearchParams(window.location.search)
const slug = params.get('slug') || ''
const playerId = slug ? getPlayerId(slug) : ''

const els = {
  closeBtn: document.querySelector('#rankings-close-btn'),
  refreshLink: document.querySelector('#rankings-refresh-link'),
  gameLogo: document.querySelector('#game-logo'),
  title: document.querySelector('#rankings-title'),
  scoreboardTitle: document.querySelector('#scoreboard-title'),
  scoreboardList: document.querySelector('#scoreboard-list'),
  myRankingsCard: document.querySelector('#my-rankings-card'),
  myRankingsTitle: document.querySelector('#my-rankings-title'),
  myRankingsList: document.querySelector('#my-rankings-list'),
}

function renderScoreRow(entry, options = {}) {
  const row = document.createElement('p')
  row.className = 'score-row'

  const trophy = entry.rank === 1 ? ' 🏆' : ''
  const label = options.isBestMine
    ? tm('scoreboardYouBest')
    : options.isMine
    ? tm('scoreboardYouRun', { run: options.runIndex ?? 1 })
    : (String(entry.display_name || '').trim() || tm('scoreboardPlayer'))
  row.textContent = tm('scoreboardLine', {
    rank: entry.rank,
    name: `${label}${trophy}`,
    score: entry.score,
  })
  return row
}

async function loadRankings() {
  if (!slug) {
    els.title.textContent = tm('scoreboardTitle')
    els.myRankingsCard.classList.add('hidden')
    return
  }

  els.closeBtn.textContent = tm('closeRankings')
  els.closeBtn.onclick = () => {
    // Rankings is the end of flow: always return to the games lobby.
    window.location.replace(`/?refresh=${Date.now()}`)
  }
  els.refreshLink.textContent = tm('refreshRankings')
  els.refreshLink.href = buildRankingsUrl(slug)
  els.title.textContent = tm('scoreboardTitle')
  els.scoreboardTitle.textContent = tm('scoreboardTitle')
  els.myRankingsTitle.textContent = tm('myRankingsTitle')

  try {
    const game = await fetchGameForPlay(slug)
    if (!game) {
      els.title.textContent = tm('gameNotFound', { slug })
      els.myRankingsCard.classList.add('hidden')
      return
    }

    if (game.logo_url) {
      els.gameLogo.src = game.logo_url
      els.gameLogo.classList.remove('hidden')
    }

    try {
      await loadGameStyles(game.id)
    } catch {
      // Keep rankings page usable even if styling cannot be loaded.
    }

    const json = await fetchScoreboard({
      game_id: game.id,
      player_id: playerId,
    })

    els.scoreboardList.replaceChildren()
    if ((json.top ?? []).length === 0) {
      const empty = document.createElement('p')
      empty.className = 'muted'
      empty.textContent = tm('scoreboardEmpty')
      els.scoreboardList.appendChild(empty)
    } else {
      for (const entry of (json.top ?? []).slice(0, 3)) {
        els.scoreboardList.appendChild(renderScoreRow(entry))
      }

      const topThree = (json.top ?? []).slice(0, 3)
      const mine = json.mine ?? []
      const bestMine = mine[0] ?? null
      const inTopThree = Boolean(bestMine && topThree.some((row) => row.player_session_id === bestMine.player_session_id))
      if (bestMine && !inTopThree) {
        els.scoreboardList.appendChild(renderScoreRow(bestMine, { isBestMine: true }))
      }
    }

    els.myRankingsList.replaceChildren()
    const mine = (json.mine ?? []).slice(0, 3)
    if (mine.length === 0) {
      const row = document.createElement('p')
      row.className = 'muted'
      row.textContent = tm('myRankingsEmpty')
      els.myRankingsList.appendChild(row)
    } else {
      mine.forEach((entry, index) => {
        els.myRankingsList.appendChild(renderScoreRow(entry, { isMine: true, runIndex: index + 1 }))
      })
    }
  } catch (err) {
    console.warn('rankings: failed to load rankings', err)
    els.title.textContent = tm('scoreboardTitle')
    els.myRankingsCard.classList.add('hidden')
  }
}

loadRankings()






