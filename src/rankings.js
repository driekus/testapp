import './style.css';
import { getLanguage, t } from './i18n.js';
import { loadGameStyles } from './gameStyleService.js';
import { buildRankingsUrl, fetchScoreboard, getPlayerId, setScoreDisplayNameBySession } from './scoreService.js';
import { fetchGameForPlay } from './userConfigService.js';
import { loadRankingsView } from './rankingsCore.js';
import { startRankingsPage } from './rankingsEntry.js';
import { flushPendingScoreNameUpdate } from './scoreNameSync.js';

void flushPendingScoreNameUpdate({
  sendUpdate: setScoreDisplayNameBySession,
});

void startRankingsPage({
  windowRef: window,
  documentRef: document,
  getLanguage,
  t,
  getPlayerId,
  loadRankingsView,
  buildRankingsUrl,
  fetchGameForPlay,
  loadGameStyles,
  fetchScoreboard,
});






