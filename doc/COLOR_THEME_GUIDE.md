# Color Theme Guide

## Overview

The application now uses a consistent, beautiful purple color theme based on Indigo-500. All purple colors are harmonized to work beautifully together and with the rest of the application.

## Color System

### Primary Purple Theme

**Light Mode:**
- Primary: `#6366F1` (Indigo-500) - Used for primary buttons, links, and accents
- Primary Foreground: White text on primary background
- Primary Container: Very light purple (#F5F3FF) - Used for subtle backgrounds
- Primary Container Foreground: Dark purple text on light backgrounds

**Dark Mode:**
- Primary: Lighter purple (#C7D2FE) - Accessible on dark backgrounds
- Primary Container: Darker purple for containers
- Appropriate contrast ratios maintained

### Secondary Purple Theme (Badges)

**Light Mode:**
- Secondary: Very light purple (#F5F3FF) - Subtle badge backgrounds
- Secondary Foreground: Primary purple - Creates nice contrast

**Dark Mode:**
- Darker tones for proper contrast on dark backgrounds

### Extended Purple Palette

Available for all components via Tailwind classes:

```
purple-50  -> Lightest purple (backgrounds, hover states)
purple-100 -> Very light purple (badges, containers)
purple-200 -> Light purple (borders)
purple-300 -> Soft purple
purple-400 -> Medium-light purple
purple-500 -> Main purple (matches primary)
purple-600 -> Medium-dark purple (hover states)
purple-700 -> Dark purple (text)
purple-800 -> Darker purple (emphasis)
purple-900 -> Darkest purple (high contrast text)
```

## Component Usage

### Buttons

**Primary Actions:**
```tsx
<Button>Add User</Button>
<Button>Ingest Traces from MLflow</Button>
```
- Uses primary purple automatically
- No need to specify colors

**Secondary Actions:**
```tsx
<Button variant="secondary">Cancel</Button>
```
- Uses secondary color scheme

### Badges

**Status Badges:**
```tsx
<Badge variant="secondary">2 Participants</Badge>
<Badge variant="secondary">0 SMEs</Badge>
```
- Uses secondary purple theme
- Subtle and professional

**Active/Primary Badges:**
```tsx
<Badge variant="default">Active</Badge>
```
- Uses primary purple
- More prominent

**Custom Colors (when needed):**
```tsx
<Badge className="bg-purple-100 text-purple-800 border-purple-200">SME</Badge>
```
- Uses theme purple palette
- Consistent with overall design

## Design Principles

1. **Consistency**: All purple colors use the same hue family
2. **Accessibility**: Contrast ratios meet WCAG AA standards
3. **Harmony**: Colors work together beautifully
4. **Semantic**: Colors have meaning (primary for actions, secondary for information)
5. **Material Design 3**: Follows modern design patterns

## Migration Notes

### Before
```tsx
// ❌ Hardcoded inconsistent purple colors
className="bg-purple-600 hover:bg-purple-700"
```

### After
```tsx
// ✅ Uses theme colors automatically
<Button>Action</Button>

// OR if you need custom purple styling:
className="bg-purple-500 hover:bg-purple-600"
```

## Color Palette Visualization

```
Light Mode:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Purple-50   │ ░░░░░░ Almost white
Purple-100  │ ░░░░░ Very light
Purple-200  │ ░░░░ Light
Purple-300  │ ░░░ Soft
Purple-400  │ ░░ Medium-light
Purple-500  │ █ Main (Primary)
Purple-600  │ ██ Medium-dark
Purple-700  │ ███ Dark
Purple-800  │ ████ Darker
Purple-900  │ █████ Darkest
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dark Mode:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Purple-50   │ █████ Very dark
Purple-100  │ ████ Dark
Purple-200  │ ███ Medium-dark
Purple-300  │ ██ Medium
Purple-400  │ █ Medium-light
Purple-500  │ ░ Main (Primary)
Purple-600  │ ░░ Light
Purple-700  │ ░░░ Lighter
Purple-800  │ ░░░░ Very light
Purple-900  │ ░░░░░ Lightest
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Key Changes Applied

1. **Theme Colors** (`index.css`):
   - Updated primary palette to Indigo-500 based colors
   - Updated secondary palette for subtle badges
   - Added extended purple palette (50-900)
   - Maintained proper contrast in dark mode

2. **Tailwind Configuration** (`tailwind.config.js`):
   - Exposed purple color palette for component use
   - Accessible via `bg-purple-500`, `text-purple-700`, etc.

3. **Component Updates**:
   - Removed hardcoded purple colors from buttons
   - Buttons now use theme primary color automatically
   - Badges use theme secondary color for consistency
   - All custom purple uses reference theme palette

## Result

All purple elements in the application now:
- Use the same beautiful purple hue family
- Have consistent visual weight
- Work harmoniously together
- Match the overall application design
- Look professional and polished

