# Theme system

The reasoning behind this — and why ad-hoc light/dark Tailwind pairs are not
acceptable — is in
[ADR-0015](../adr/0015-theme-as-design-system.md).

## Overview

This application uses a systematic theme approach based on the Dashboard design as the pinnacle standard. All components should follow these patterns for consistency across light and dark modes.

## Core Principles

1. **Dashboard as Standard**: The dashboard page represents our design pinnacle - all other pages should match its styling patterns
2. **CSS Custom Properties**: Use CSS custom properties (CSS variables) instead of hardcoded Tailwind classes for theme-aware styling
3. **Systematic Approach**: Use the `themeClasses` utility from `src/utils/themeUtils.util.ts` for consistent component styling
4. **Semantic Colors**: Use semantic color names that adapt to light/dark modes automatically

## Theme Structure

### CSS Custom Properties (`src/index.css`)

#### Core Theme Colors
- `--background`: Main page background
- `--foreground`: Primary text color
- `--card`: Card/container background
- `--card-foreground`: Text on cards
- `--muted`: Muted background areas
- `--muted-foreground`: Secondary text color
- `--border`: Border color
- `--input`: Input field styling

#### Dashboard-Specific Colors
- `--dashboard-stat-blue`: Blue accent color and background
- `--dashboard-stat-green`: Green accent color and background  
- `--dashboard-stat-purple`: Purple accent color and background
- `--dashboard-stat-red`: Red accent color and background
- `--dashboard-stat-yellow`: Yellow accent color and background
- `--dashboard-stat-orange`: Orange accent color and background

### Theme Classes (`src/utils/themeUtils.util.ts`)

#### Layout Classes
```typescript
themeClasses.page              // "min-h-screen bg-background"
themeClasses.pageContainer     // "p-6 space-y-6"
themeClasses.pageHeader        // "mb-8"
themeClasses.pageTitle         // "text-3xl font-bold text-foreground"
themeClasses.pageSubtitle      // "text-muted-foreground mt-2"
```

#### Card Classes
```typescript
themeClasses.card              // Standard card styling
themeClasses.cardCompact       // Smaller padding card
themeClasses.cardHover         // Card with hover effects
themeClasses.cardTitle         // Card title styling
```

#### Statistics Classes
```typescript
themeClasses.statCard          // Statistics card container
themeClasses.statCardContent   // Flex layout for stat content
themeClasses.statLabel         // Label text styling
themeClasses.statValue         // Large value text (3xl)
themeClasses.statValueMedium   // Medium value text (2xl)
```

#### Grid Classes
```typescript
themeClasses.statsGrid         // 4-column responsive grid
themeClasses.statsGridThree    // 3-column responsive grid
themeClasses.cardsGrid         // Card grid layout
themeClasses.contentGrid       // 2-column content layout
```

#### Form Classes
```typescript
themeClasses.input             // Input field styling
themeClasses.select            // Select dropdown styling
themeClasses.textarea          // Textarea styling
themeClasses.searchInput       // Search input with padding for icon
```

#### Button Classes
```typescript
themeClasses.button            // Primary button
themeClasses.buttonSecondary   // Secondary button
themeClasses.buttonOutline     // Outline button
themeClasses.buttonDestructive // Destructive action button
```

## Usage Examples

### Page Layout
```tsx
<div className={themeClasses.page}>
  <div className={themeClasses.pageContainer}>
    <div className={themeClasses.pageHeader}>
      <h1 className={themeClasses.pageTitle}>Page Title</h1>
      <p className={themeClasses.pageSubtitle}>Page description</p>
    </div>
    {/* Content */}
  </div>
</div>
```

### Statistics Cards
```tsx
<div className={themeClasses.statsGrid}>
  <div className={themeClasses.statCard}>
    <div className={themeClasses.statCardContent}>
      <div>
        <p className={themeClasses.statLabel}>Total Revenue</p>
        <p className={themeClasses.statValue}>$12,345</p>
      </div>
      <DollarSign className={`${themeClasses.iconLarge} ${getIconColorClasses('green')}`} />
    </div>
  </div>
</div>
```

### Forms
```tsx
<div className={themeClasses.card}>
  <h3 className={themeClasses.cardTitle}>Form Title</h3>
  <input 
    className={themeClasses.input}
    placeholder="Enter value..."
  />
  <button className={themeClasses.button}>
    Submit
  </button>
</div>
```

## Utility Functions

### `getIconColorClasses(color)`
Returns appropriate icon color classes for the specified color:
```tsx
getIconColorClasses('blue')   // "text-blue-600 dark:text-blue-400"
getIconColorClasses('green')  // "text-green-600 dark:text-green-400"
```

### `getButtonClasses(variant)`
Returns button classes for the specified variant:
```tsx
getButtonClasses('primary')     // Primary button styling
getButtonClasses('secondary')   // Secondary button styling
getButtonClasses('outline')     // Outline button styling
```

### `getStatusColor(status)`
Returns status badge classes based on status string:
```tsx
getStatusColor('paid')     // Green badge
getStatusColor('pending')  // Yellow badge
getStatusColor('overdue')  // Red badge
```

## Migration Guide

When updating existing components to use the theme system:

1. **Replace hardcoded classes** with theme classes:
   ```tsx
   // Before
   <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
   
   // After  
   <div className={themeClasses.card}>
   ```

2. **Use semantic color properties**:
   ```tsx
   // Before
   <h1 className="text-gray-900 dark:text-gray-100">
   
   // After
   <h1 className={themeClasses.pageTitle}>
   ```

3. **Leverage utility functions**:
   ```tsx
   // Before
   <Icon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
   
   // After
   <Icon className={`${themeClasses.iconLarge} ${getIconColorClasses('blue')}`} />
   ```

## Benefits

1. **Consistency**: All components follow the same design patterns
2. **Maintainability**: Changes to the theme system affect all components automatically
3. **Dark Mode**: Automatic light/dark mode support without component-level changes
4. **Scalability**: Easy to add new theme variations or color schemes
5. **Developer Experience**: Clear, semantic class names that are easy to understand and use

## Best Practices

1. Always use `themeClasses` instead of hardcoded Tailwind classes for theme-aware styling
2. Use the utility functions for dynamic styling (colors, variants, etc.)
3. Follow the dashboard design patterns for new components
4. Test components in both light and dark modes
5. Use semantic color names rather than specific color values

## Related

- [ADR-0015](../adr/0015-theme-as-design-system.md) — why the theme is a design
  system rather than utility classes
- [Architecture](architecture.md) — where the frontend layers sit
- [Settings → Appearance](../user-guide/settings.md#appearance) — what the user
  sees: `system` / `light` / `dark`, and the three colour presets
