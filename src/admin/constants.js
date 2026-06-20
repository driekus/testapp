import { getLanguage, t } from '../i18n.js';

/**
 * Current admin language code.
 * @type {string}
 */
export const language = getLanguage();

/**
 * Translate helper scoped to admin namespace.
 * @param {string} key Translation key.
 * @param {Record<string, string|number>} [params] Optional interpolation params.
 * @returns {string}
 */
export function ta(key, params) {
  return t(language, 'admin', key, params);
}

/**
 * Build initial in-memory state for the admin app.
 * @param {boolean} hasConfig Whether runtime Supabase config exists.
 * @returns {object}
 */
export function createInitialState(hasConfig) {
  return {
    // game management
    games: [],
    currentGameId: null,
    currentSlug: null,
    currentRequiresPayment: false,
    currentPriceInCents: 0,
    currentGameStyles: {},
    // route management — array of {id, order_index, display_name, route, _dirty}
    routes: [],
    currentRouteIndex: 0,
    // location editor
    selectedRowIndex: 0,
    // map
    map: null,
    markerLayer: null,
    marker: null,
    // auth
    user: null,
    authStatusMessage: hasConfig ? ta('signInToLoad') : ta('envMissing'),
  };
}

/**
 * Game style editor field metadata.
 * @type {Array<{key:string,label:string,type:'color'|'text'}>}
 */
export const STYLE_FIELDS = [
  { key: 'primary_color', label: 'Primary', type: 'color' },
  { key: 'primary_text_color', label: 'Primary text', type: 'color' },
  { key: 'primary_hover_color', label: 'Primary hover', type: 'color' },
  { key: 'bg_color', label: 'Background', type: 'color' },
  { key: 'text_color', label: 'Text', type: 'color' },
  { key: 'text_muted_color', label: 'Muted text', type: 'color' },
  { key: 'text_hint_color', label: 'Hint text', type: 'color' },
  { key: 'card_bg_color', label: 'Card background', type: 'color' },
  { key: 'card_border_color', label: 'Card border', type: 'color' },
  { key: 'accent_color_teal', label: 'Accent teal', type: 'color' },
  { key: 'accent_color_amber', label: 'Accent amber', type: 'color' },
  { key: 'accent_text_amber', label: 'Accent amber text', type: 'color' },
  { key: 'accent_bg_blue', label: 'Accent blue bg', type: 'color' },
  { key: 'accent_border_blue', label: 'Accent blue border', type: 'color' },
  { key: 'accent_text_blue', label: 'Accent blue text', type: 'color' },
  { key: 'input_border_color', label: 'Input border', type: 'color' },
  { key: 'input_bg_color', label: 'Input background', type: 'color' },
  { key: 'input_text_color', label: 'Input text', type: 'color' },
  { key: 'dark_bg_color', label: 'Dark background', type: 'color' },
  { key: 'dark_text_color', label: 'Dark text', type: 'color' },
  { key: 'dark_card_bg_color', label: 'Dark card bg', type: 'color' },
  { key: 'dark_card_border_color', label: 'Dark card border', type: 'color' },
  { key: 'dark_input_bg_color', label: 'Dark input bg', type: 'color' },
  { key: 'dark_input_border_color', label: 'Dark input border', type: 'color' },
  { key: 'dark_accent_bg_blue', label: 'Dark accent bg', type: 'color' },
  { key: 'dark_accent_border_blue', label: 'Dark accent border', type: 'color' },
  { key: 'dark_accent_text_blue', label: 'Dark accent text', type: 'color' },
  { key: 'font_family', label: 'Font family', type: 'text' },
  { key: 'border_radius_sm', label: 'Radius small', type: 'text' },
  { key: 'border_radius_md', label: 'Radius medium', type: 'text' },
  { key: 'border_radius_lg', label: 'Radius large', type: 'text' },
];

/**
 * Fallback style values applied for new games and reset actions.
 * @type {Record<string, string>}
 */
export const DEFAULT_GAME_STYLES = {
  primary_color: '#2f7dff',
  primary_text_color: '#ffffff',
  primary_hover_color: '#1e5ecf',
  bg_color: '#f5f7fb',
  text_color: '#1f2937',
  text_muted_color: '#6b7280',
  text_hint_color: '#4b5563',
  card_bg_color: '#ffffff',
  card_border_color: '#d9e2ef',
  accent_color_teal: '#0f766e',
  accent_color_amber: '#fef3c7',
  accent_text_amber: '#92400e',
  accent_bg_blue: '#f0f5ff',
  accent_border_blue: '#c3d4f7',
  accent_text_blue: '#1d4ed8',
  input_border_color: '#bcccdc',
  input_bg_color: '#ffffff',
  input_text_color: '#1f2937',
  dark_bg_color: '#0f172a',
  dark_text_color: '#e5e7eb',
  dark_card_bg_color: '#111827',
  dark_card_border_color: '#374151',
  dark_input_bg_color: '#0b1220',
  dark_input_border_color: '#334155',
  dark_accent_bg_blue: '#1e2d4a',
  dark_accent_border_blue: '#3b5a9a',
  dark_accent_text_blue: '#93c5fd',
  font_family: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  border_radius_sm: '8px',
  border_radius_md: '10px',
  border_radius_lg: '12px',
};

