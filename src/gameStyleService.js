import { supabase } from './supabaseClient.js';

let runtimeSupabase = supabase;
let runtimeDocument = document;

/**
 * Override runtime dependencies (used by tests).
 * @param {{supabase?: any, documentRef?: Document}} deps
 */
export function setGameStyleServiceRuntimeDeps(deps = {}) {
  if (Object.prototype.hasOwnProperty.call(deps, 'supabase')) {
    runtimeSupabase = deps.supabase;
  }
  if (Object.prototype.hasOwnProperty.call(deps, 'documentRef')) {
    runtimeDocument = deps.documentRef;
  }
}

/**
 * Load custom CSS variables for a game from the database
 * If no custom styles exist, defaults are used (from CSS variables)
 * @param {string} gameId - The game UUID
 */
export async function loadGameStyles(gameId) {
  if (!gameId) {
    console.warn('gameStyleService: no gameId provided');
    return;
  }

  try {
    if (!runtimeSupabase) {
      return;
    }

    const { data, error } = await runtimeSupabase
      .from('game_styles')
      .select('*')
      .eq('game_id', gameId)
      .maybeSingle();

    if (error) {
      console.error('gameStyleService: error fetching styles', error);
      return;
    }

    if (!data) {
      console.log(`gameStyleService: no custom styles for game ${gameId}, using defaults`);
      return;
    }

    applyCustomStyles(data);
  } catch (err) {
    console.error('gameStyleService: unexpected error', err);
  }
}

/**
 * Apply CSS custom properties to the root element
 * @param {Object} styleData - The game_styles row from the database
 */
function applyCustomStyles(styleData) {

  const root = runtimeDocument?.documentElement;
  if (!root) return;

  // Map of database column names to CSS variable names
  const styleMapping = {
    primary_color: '--primary-color',
    primary_text_color: '--primary-text-color',
    primary_hover_color: '--primary-hover-color',
    bg_color: '--bg-color',
    text_color: '--text-color',
    text_muted_color: '--text-muted-color',
    text_hint_color: '--text-hint-color',
    card_bg_color: '--card-bg-color',
    card_border_color: '--card-border-color',
    accent_color_teal: '--accent-color-teal',
    accent_color_amber: '--accent-color-amber',
    accent_text_amber: '--accent-text-amber',
    accent_bg_blue: '--accent-bg-blue',
    accent_border_blue: '--accent-border-blue',
    accent_text_blue: '--accent-text-blue',
    input_border_color: '--input-border-color',
    input_bg_color: '--input-bg-color',
    input_text_color: '--input-text-color',
    dark_bg_color: '--dark-bg-color',
    dark_text_color: '--dark-text-color',
    dark_card_bg_color: '--dark-card-bg-color',
    dark_card_border_color: '--dark-card-border-color',
    dark_input_bg_color: '--dark-input-bg-color',
    dark_input_border_color: '--dark-input-border-color',
    dark_accent_bg_blue: '--dark-accent-bg-blue',
    dark_accent_border_blue: '--dark-accent-border-blue',
    dark_accent_text_blue: '--dark-accent-text-blue',
    font_family: '--font-family',
    border_radius_sm: '--border-radius-sm',
    border_radius_md: '--border-radius-md',
    border_radius_lg: '--border-radius-lg',
  };

  // Apply each style that has a value
  for (const [dbColumn, cssVar] of Object.entries(styleMapping)) {
    const value = styleData[dbColumn];
    if (value) {
      root.style.setProperty(cssVar, value);
    }
  }

  console.log('gameStyleService: custom styles applied');
}

/**
 * Create default game styles for a new game
 * @param {string} gameId - The game UUID
 * @returns {Promise<Object>} The created game_styles record
 */
export async function createDefaultGameStyles(gameId) {
  if (!runtimeSupabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await runtimeSupabase
    .from('game_styles')
    .insert([{ game_id: gameId }])
    .select()
    .single();

  if (error) {
    console.error('gameStyleService: error creating default styles', error);
    throw error;
  }

  return data;
}

