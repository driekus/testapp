# Game Styling System

The Letter Quest app now supports per-game custom styling through the `game_styles` table in Supabase. This allows you to easily customize colors, fonts, spacing, and other CSS properties for each game without modifying the codebase.

## How It Works

1. **Style Variables**: All CSS colors and styling properties are now defined as CSS custom properties (variables) in `src/style.css`
2. **Database Storage**: Custom styles are stored in the `game_styles` table, with one row per game
3. **Auto-Loading**: When a game loads, styles are automatically fetched from the database and applied to the root element
4. **Fallback**: If no custom styles exist for a game, the defaults are used

## Database Schema

The `game_styles` table has the following columns (all with sensible defaults):

### Primary Colors
- `primary_color` - Main button/link color (default: #2f7dff)
- `primary_text_color` - Text on primary buttons (default: #ffffff)
- `primary_hover_color` - Hover state for primary elements (default: #1e5ecf)

### Background & Text
- `bg_color` - Page background (default: #f5f7fb)
- `text_color` - Main text color (default: #1f2937)
- `text_muted_color` - Muted/secondary text (default: #6b7280)
- `text_hint_color` - Hint text (default: #4b5563)

### Cards & Borders
- `card_bg_color` - Card background (default: #ffffff)
- `card_border_color` - Card border color (default: #d9e2ef)

### Accents
- `accent_color_teal` - Accent color (teal) (default: #0f766e)
- `accent_color_amber` - Accent color (amber) (default: #fef3c7)
- `accent_text_amber` - Text on amber elements (default: #92400e)
- `accent_bg_blue` - Light blue background (default: #f0f5ff)
- `accent_border_blue` - Blue border (default: #c3d4f7)
- `accent_text_blue` - Blue text (default: #1d4ed8)

### Inputs
- `input_border_color` - Input field border (default: #bcccdc)
- `input_bg_color` - Input field background (default: #ffffff)
- `input_text_color` - Input field text (default: #1f2937)

### Dark Mode
- `dark_bg_color` - Dark mode background (default: #0f172a)
- `dark_text_color` - Dark mode text (default: #e5e7eb)
- `dark_card_bg_color` - Dark mode card background (default: #111827)
- `dark_card_border_color` - Dark mode card border (default: #374151)
- `dark_input_bg_color` - Dark mode input background (default: #0b1220)
- `dark_input_border_color` - Dark mode input border (default: #334155)
- `dark_accent_bg_blue` - Dark mode accent background (default: #1e2d4a)
- `dark_accent_border_blue` - Dark mode accent border (default: #3b5a9a)
- `dark_accent_text_blue` - Dark mode accent text (default: #93c5fd)

### Typography & Spacing
- `font_family` - Font stack (default: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif)
- `border_radius_sm` - Small border radius (default: 8px)
- `border_radius_md` - Medium border radius (default: 10px)
- `border_radius_lg` - Large border radius (default: 12px)

## Adding Styles for a New Game

### Option 1: Manual via Supabase Dashboard

1. Go to the Supabase dashboard
2. Open the `game_styles` table
3. Create a new row with your game's ID in the `game_id` column
4. Customize any colors or properties you want to override
5. Leave other columns empty to use defaults

### Option 2: Using SQL

```sql
INSERT INTO public.game_styles (
  game_id,
  primary_color,
  primary_text_color,
  bg_color,
  text_color,
  card_bg_color,
  -- ... add any other fields you want to customize
)
VALUES (
  'YOUR-GAME-ID-HERE',
  '#YOUR-PRIMARY-COLOR',
  '#ffffff',
  '#YOUR-BG-COLOR',
  '#YOUR-TEXT-COLOR',
  '#ffffff'
  -- ... etc
);
```

### Option 3: Edge Function (Future)

You could create an admin API endpoint to manage game styles, allowing authenticated admins to update styles through a UI.

## Mobile-Friendly Design

The app is already optimized for phones and tablets:
- **Responsive Layout**: Uses `clamp()` for fluid typography and `min()` for container widths
- **Touch-Friendly**: Large buttons (40px+ height) with adequate spacing
- **Viewport Units**: Uses `100svh` (small viewport height) for better mobile experience
- **Flexible Colors**: All colors are customizable via the styling system

## CSS Variables in Use

All styles throughout the app use CSS custom properties. Here's an example from the CSS:

```css
button {
  border: 1px solid var(--primary-color);
  background: var(--primary-color);
  color: var(--primary-text-color);
  border-radius: var(--border-radius-sm);
  padding: 10px 12px;
  font-size: 0.95rem;
  cursor: pointer;
}

.card {
  background: var(--card-bg-color);
  border: 1px solid var(--card-border-color);
  border-radius: var(--border-radius-lg);
  padding: 14px;
  display: grid;
  gap: 6px;
}
```

## Applying Styles to a Game

Styles are automatically loaded when:
1. The player visits a game URL (e.g., `/amsterdam-tour`)
2. The player visits the feedback page after completing a game

The `gameStyleService.js` handles fetching styles from the database and applying them via JavaScript's `style.setProperty()` method on the root element.

## Example: Branding a Game

To create a red-themed game:

```javascript
{
  game_id: "abc-123-def",           // Your game's UUID
  primary_color: "#dc2626",         // Red for buttons
  primary_hover_color: "#991b1b",   // Darker red for hover
  accent_text_blue: "#dc2626",      // Red for accents
  bg_color: "#fef2f2",              // Light red background
  text_color: "#1f2937",            // Keep dark text
  // ... other properties remain at defaults
}
```

## File Structure

- `src/style.css` - Contains all CSS variables and default colors
- `src/gameStyleService.js` - Service for loading and applying styles
- `src/main.js` - Calls `loadGameStyles()` after fetching game data
- `src/feedback.js` - Calls `loadGameStyles()` for the feedback page
- `supabase/schema.sql` - Database schema with `game_styles` table

## Responsive Design Notes

The app is designed for portrait orientation on phones and tablets:
- Content width: `min(720px, 100%)` - grows with device but caps at 720px
- Touch targets: All interactive elements are ≥40px height
- Padding: 16px page padding on all sides
- Gap: Cards/sections have 12px gap for breathing room
- Typography: Uses `clamp()` for h1 to scale with viewport

## Browser Compatibility

CSS custom properties are supported in all modern browsers:
- Chrome/Edge 49+
- Firefox 31+
- Safari 9.1+
- iOS Safari 9.3+

No IE support (intentional, as older devices shouldn't run this GPS-based game).

