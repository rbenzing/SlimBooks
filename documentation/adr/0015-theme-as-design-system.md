# ADR-0015: The theme is a design system, not ad-hoc utility classes

**Status:** Accepted
**Date:** 2026-08-08

## Context

Tailwind makes it easy to write `bg-white dark:bg-gray-800 border-gray-200
dark:border-gray-700` at every call site. Done across a few dozen components,
the result is a colour scheme that exists in no single place, cannot be changed
without a search-and-replace, and drifts — because the next component copies
whichever variant its author happened to look at.

## Decision

Colour, surface and state come from `themeClasses` in
`src/utils/themeUtils.util.ts`, backed by CSS custom properties in
`src/index.css`. Components consume the tokens; they do not spell out
light/dark pairs.

Helper functions cover the parametric cases: `getIconColorClasses(color)`,
`getButtonClasses(variant)`, `getStatusColor(status)`.

Before building a new component, check `src/components/ui/` — it is shadcn/ui,
already themed.

## Consequences

- The theme changes in one file, not in every component.
- Dark mode is a property of the token, so a component that uses tokens is
  correct in both modes without thinking about it.
- Three appearance presets exist (`modern-blue`, `classic-white`,
  `professional-gray`) alongside `system` / `light` / `dark` mode, and they work
  because nothing hard-codes a colour.
- The same discipline applies to formatting: **all date display goes through
  `src/utils/formatting/date.util.ts`.** Eleven screens once hard-coded
  `MM/DD/YYYY` with their own `toLocaleDateString` calls. Don't add a twelfth.
- Anything user-facing honours the settings objects — currency, number and date
  formatting, language. A component that formats its own currency is the same
  defect as one that picks its own grey.
- Details are in [development/theme-system.md](../development/theme-system.md).
