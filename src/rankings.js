import './style.css';
import { getLanguage, t } from './i18n.js';
import { loadGameStyles } from './gameStyleService.js';
import { buildRankingsUrl, fetchScoreboard, getPlayerId } from './scoreService.js';
import { fetchGameForPlay } from './userConfigService.js';
import { loadRankingsView } from './rankingsCore.js';

const language = getLanguage();
/** Shortcut for translating keys from the `main` section in rankings view. */
const tm = (key, params) => t(language, 'main', key, params);

const params = new URLSearchParams(window.location.search);
const slug = params.get('slug') || '';
const playerId = slug ? getPlayerId(slug) : '';

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
};

void loadRankingsView({
  slug,
  playerId,
  els,
  tm,
  buildRankingsUrl,
  fetchGameForPlay,
  loadGameStyles,
  fetchScoreboard,
  windowRef: window,
  createElement: (tag) => document.createElement(tag),
});






