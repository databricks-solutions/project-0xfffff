# Design System Specification

## Overview

This specification defines the visual design system for the Human Evaluation Workshop, including the color palette, typography, component styling, and accessibility requirements. The system uses Tailwind CSS with a consistent purple/indigo theme.

## Color System

### Primary Palette (Indigo-based Purple)

The primary color is Indigo-500 (`#6366F1`), providing a professional purple theme.

#### Light Mode

| Token | Value | Usage |
|-------|-------|-------|
| `primary` | `#6366F1` | Primary buttons, links, accents |
| `primary-foreground` | `#FFFFFF` | Text on primary background |
| `primary-container` | `#F5F3FF` | Subtle backgrounds |
| `primary-container-foreground` | `#3730A3` | Text on container background |

#### Dark Mode

| Token | Value | Usage |
|-------|-------|-------|
| `primary` | `#C7D2FE` | Primary buttons, links (lighter for dark bg) |
| `primary-foreground` | `#1E1B4B` | Text on primary background |
| `primary-container` | `#312E81` | Subtle backgrounds |
| `primary-container-foreground` | `#E0E7FF` | Text on container background |

### Secondary Palette (Badges & Subtle UI)

#### Light Mode

| Token | Value | Usage |
|-------|-------|-------|
| `secondary` | `#F5F3FF` | Badge backgrounds |
| `secondary-foreground` | `#6366F1` | Badge text |

#### Dark Mode

| Token | Value | Usage |
|-------|-------|-------|
| `secondary` | `#312E81` | Badge backgrounds |
| `secondary-foreground` | `#C7D2FE` | Badge text |

### Extended Purple Scale

Available via Tailwind classes (`bg-purple-500`, `text-purple-700`, etc.):

```
purple-50   #FAF5FF   Lightest (backgrounds, hover states)
purple-100  #F3E8FF   Very light (badges, containers)
purple-200  #E9D5FF   Light (borders)
purple-300  #D8B4FE   Soft
purple-400  #C084FC   Medium-light
purple-500  #A855F7   Main (matches primary)
purple-600  #9333EA   Medium-dark (hover states)
purple-700  #7E22CE   Dark (text)
purple-800  #6B21A8   Darker (emphasis)
purple-900  #581C87   Darkest (high contrast)
```

### Semantic Colors

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `background` | `#FFFFFF` | `#0A0A0A` | Page background |
| `foreground` | `#0A0A0A` | `#FAFAFA` | Default text |
| `muted` | `#F4F4F5` | `#27272A` | Muted backgrounds |
| `muted-foreground` | `#71717A` | `#A1A1AA` | Muted text |
| `destructive` | `#EF4444` | `#DC2626` | Error states |
| `border` | `#E4E4E7` | `#27272A` | Borders |

## Component Styling

### Buttons

**Primary Button**:
```tsx
<Button>Add User</Button>
// Uses primary color automatically
```

**Secondary Button**:
```tsx
<Button variant="secondary">Cancel</Button>
// Uses secondary color scheme
```

**Destructive Button**:
```tsx
<Button variant="destructive">Delete</Button>
// Uses destructive color
```

**Outline Button**:
```tsx
<Button variant="outline">View Details</Button>
// Transparent with border
```

### Badges

**Default Badge**:
```tsx
<Badge>Active</Badge>
// Primary purple, prominent
```

**Secondary Badge**:
```tsx
<Badge variant="secondary">2 Participants</Badge>
// Subtle purple background
```

**Custom Badge**:
```tsx
<Badge className="bg-purple-100 text-purple-800 border-purple-200">
  SME
</Badge>
```

### Cards

```tsx
<Card>
  <CardHeader>
    <CardTitle>Workshop Settings</CardTitle>
    <CardDescription>Configure your workshop</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

### Form Elements

**Input**:
```tsx
<Input placeholder="Enter name" />
// Focus ring uses primary color
```

**Select**:
```tsx
<Select>
  <SelectTrigger>
    <SelectValue placeholder="Select option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="a">Option A</SelectItem>
  </SelectContent>
</Select>
```

## Typography

### Font Stack

```css
font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
  "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

### Scale

| Class | Size | Usage |
|-------|------|-------|
| `text-xs` | 0.75rem | Labels, captions |
| `text-sm` | 0.875rem | Secondary text |
| `text-base` | 1rem | Body text |
| `text-lg` | 1.125rem | Subheadings |
| `text-xl` | 1.25rem | Section headers |
| `text-2xl` | 1.5rem | Page titles |

### Weights

| Class | Weight | Usage |
|-------|--------|-------|
| `font-normal` | 400 | Body text |
| `font-medium` | 500 | Emphasized text |
| `font-semibold` | 600 | Subheadings |
| `font-bold` | 700 | Headings |

## Spacing

Consistent spacing scale (rem-based):

| Class | Value | Usage |
|-------|-------|-------|
| `p-1` / `m-1` | 0.25rem | Tight spacing |
| `p-2` / `m-2` | 0.5rem | Compact |
| `p-3` / `m-3` | 0.75rem | Default small |
| `p-4` / `m-4` | 1rem | Default |
| `p-6` / `m-6` | 1.5rem | Comfortable |
| `p-8` / `m-8` | 2rem | Spacious |

## Accessibility

### Color Contrast

All text meets WCAG AA contrast ratios:
- Normal text: 4.5:1 minimum
- Large text: 3:1 minimum
- UI components: 3:1 minimum

### Focus States

All interactive elements have visible focus indicators:

```css
.focus-visible:ring-2
.focus-visible:ring-primary
.focus-visible:ring-offset-2
```

### Color Independence

Never rely solely on color to convey information:
- Icons paired with text labels
- Status indicated by text + color
- Error messages use both red and icon

### Keyboard Navigation

- All interactive elements focusable via Tab
- Logical focus order
- Escape closes modals/dropdowns
- Enter/Space activate buttons

## Dark Mode

### Implementation

Theme controlled via `class` strategy on `<html>`:

```tsx
// Toggle dark mode
document.documentElement.classList.toggle('dark');
```

### CSS Variables

```css
/* Light mode (default) */
:root {
  --primary: 239 84% 67%;      /* Indigo-500 */
  --background: 0 0% 100%;
  --foreground: 0 0% 4%;
}

/* Dark mode */
.dark {
  --primary: 224 93% 88%;      /* Lighter indigo */
  --background: 0 0% 4%;
  --foreground: 0 0% 98%;
}
```

### Component Adaptation

Components automatically adapt to dark mode:

```tsx
// Automatically uses dark mode colors when .dark class present
<Card className="bg-background text-foreground">
  {/* Content */}
</Card>
```

## File Locations

| File | Purpose |
|------|---------|
| `client/src/index.css` | CSS variables, base styles |
| `client/tailwind.config.js` | Tailwind theme configuration |
| `client/src/components/ui/` | UI component library |

## Migration Guide

### From Hardcoded Colors

**Before**:
```tsx
className="bg-purple-600 hover:bg-purple-700"
```

**After**:
```tsx
<Button>Action</Button>
// Or for custom styling:
className="bg-primary hover:bg-primary/90"
```

### Using Theme Colors

```tsx
// Use semantic tokens
className="bg-primary text-primary-foreground"
className="bg-muted text-muted-foreground"
className="border-border"

// Or Tailwind purple scale for custom needs
className="bg-purple-500 text-purple-50"
```

## Success Criteria

- [ ] Primary purple consistent across all components
- [ ] Dark mode fully functional
- [ ] All text meets WCAG AA contrast
- [ ] Focus indicators visible
- [ ] No hardcoded colors in components
- [ ] Badges use secondary color scheme
- [ ] Buttons use appropriate variants
