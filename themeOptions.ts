import { ThemeOptions } from "@mui/material/styles";
// Augments MUI's `components` type with MuiDataGrid so the override below typechecks.
import type {} from "@mui/x-data-grid/themeAugmentation";

/**
 * Taruvi Design System — MUI Theme
 * Source of truth: taruvi-design-system.html
 *
 * Every numeric value below is taken DIRECTLY from the design system
 * (font sizes, weights, paddings, radii, shadows, letter-spacings).
 *
 * Note on radii: the `radius.*` block intentionally runs ~50% softer than
 * the raw design-system values (see comments inside the block). Other
 * tokens stay faithful to the spec.
 */

// ─── Module augmentation: custom MUI variants ────────────────────────
// Adds 4 category/tag chip variants that match the design system's
// pastel rotation palette. Usage: `<Chip variant="tagBlue" label="…" />`
declare module "@mui/material/Chip" {
  interface ChipPropsVariantOverrides {
    tagBlue: true;
    tagPurple: true;
    tagGreen: true;
    tagOrange: true;
  }
}

// ─── Font families ──────────────────────────────────────────────────
const FONT_BODY = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FONT_TITLE = "Georgia, 'Times New Roman', serif";

// ─── Brand tokens (full ramps + every named color from the spec) ────
export const taruviTokens = {
  hmg: { background: '#F6F3ED', paper: '#FFFFFF', ink: '#242824', muted: '#595F57', olive: '#4B563F', oliveDark: '#35402C', border: '#DDD9D0', bronze: '#8A6C48', soft: '#ECEFE5' },
  font: {
    body: FONT_BODY,
    title: FONT_TITLE,
  },

  primary: {
    50: '#F2FBFF',
    100: '#E0F6FE',
    200: '#C6EFFD',
    300: '#9DE5FD',
    400: '#6ED8FB',
    500: '#3EC7F5',
    600: '#0A93C4',
    700: '#1AB3E6',
    800: '#056A8F',
    900: '#003652',
    dark: '#002A3C',
  },

  neutral: {
    50: '#FAFAFA',
    100: '#F4F5F5',
    200: '#E9EBEC',
    300: '#C9CECF',
    400: '#B8BFC1',
    500: '#929C9F',
    600: '#7E8A8D',
    700: '#596365',
    800: '#363B3D',
    900: '#121414',
    darkest: '#00090B',
  },

  secondary: {
    50: '#E6F0F5',
    100: '#BFDAE8',
    200: '#99C4DB',
    300: '#73ADCE',
    400: '#4D97C1',
    500: '#2680B4',
    600: '#00699A',
    700: '#004369',
    800: '#03435B',
    900: '#002A3C',
  },

  success: {
    50: '#e6f4ef',
    100: '#c1e6d8',
    200: '#9ad7c0',
    300: '#81c784',
    400: '#4caf50',
    500: '#10B981',
    600: '#0a7d5a',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
  },

  warning: {
    50: '#fff8e1',
    100: '#ffecb3',
    200: '#ffd54f',
    300: '#ffca28',
    400: '#f59e0b',
    500: '#f57c00',
    600: '#ef6c00',
    700: '#e65100',
    800: '#bf360c',
  },

  error: {
    50: '#fce4ec',
    100: '#f8bbd0',
    200: '#f48fb1',
    300: '#f06292',
    400: '#ec407a',
    500: '#d81b60',
    600: '#c2185b',
    700: '#ad1457',
    800: '#880e4f',
    900: '#560027',
  },

  // Primary button states (filled blue button system)
  button: {
    primaryDefault: '#1E88E5',
    primaryHover: '#1565C0',
    primaryActive: '#0D47A1',
    primaryDisabled: '#BBDEFB',
    primaryDisabledText: '#999999',
  },

  // Status / chart colors
  status: {
    complete: '#388e3c',
    inProgress: '#1976d2',
    review: '#f57c00',
    delayed: '#c2185b',
    onHold: '#7b1fa2',
    todo: '#00acc1',
    open: '#19b3e5',
    resolved: '#008751',
    underReview: '#FF8C00',
    delayedAlt: '#C71585',
    onHoldAlt: '#8B1A72',
    chartPrimary: '#1e88f5',
  },

  // Tag / category chips
  //
  // The design system uses a 4-color **pastel rotation palette** for category
  // chips (Design / Development / Marketing / Research are shown in four
  // distinct fills). Also exposed as MuiChip variants `tagBlue`/`tagPurple`/
  // `tagGreen`/`tagOrange` — prefer those over reading raw values.
  tag: {
    fillBg: '#E0F6FE',     // legacy single-fill (kept for backward compat)
    fillText: '#004369',
    outlineColor: '#1976d2',
  },
  tagPalette: [
    { bg: '#E0F6FE', text: '#004369' }, // blue — Design
    { bg: '#EDE7F6', text: '#4527A0' }, // purple — Development
    { bg: '#E8F5E9', text: '#1B5E20' }, // green — Marketing
    { bg: '#FFF3E0', text: '#E65100' }, // orange — Research
  ],

  // Tab / surface tokens
  surface: {
    bg: '#f3f4f6',
    paper: '#ffffff',
    inputBg: '#F3F3F5',
    borderLight: 'rgba(0,0,0,0.08)',
    borderInput: 'rgba(0,0,0,0.1)',
    borderTableRow: 'rgba(0,0,0,0.04)',
    navWhiteBorder: '#e5e7eb',
    navBlue: '#2b97ff',
    navDark: '#004369',
    navDarkAccent: '#9de5fd',
    navWhiteText: '#101828',
  },

  // Text colors
  text: {
    primary: '#121414',
    secondary: '#596365',
    muted: '#929C9F',
    onDark: '#ffffff',
  },

  // Shadows
  shadow: {
    card: '0 2px 12px rgba(0,0,0,0.07)',
    cardDark: '0 2px 12px rgba(0,0,0,0.40)',
    nav: '0 2px 8px rgba(0,0,0,0.12)',
    sidebar: '0 2px 8px rgba(0,0,0,0.08)',
    swatch: '0 1px 6px rgba(0,0,0,0.10)',
    // 2px solid-feeling ring at higher opacity — matches design "ring outline (2px, --ring-color)"
    focusRing: '0 0 0 2px rgba(30,136,229,0.35)',
  },

  // Border radii (toned down ~50% from the design-system defaults)
  radius: {
    none: 0,
    sm: 3,    // tooltip                          (orig 6)
    md: 4,    // buttons, icon-button, sidebar    (orig 8)
    lg: 6,    // form inputs, status messages     (orig 10)
    xl: 8,    // navbars, sidebar containers      (orig 12)
    xxl: 10,  // cards, TOC                       (orig 16)
    pill: 999,
    avatar: 9999,
  },

  // Spacing (in px) for explicit lookups
  spacing: {
    cardPadding: 28,
    cardTitleMb: 16,
    sectionMb: 64,
    containerPaddingY: 48,
    containerPaddingX: 32,
    formGroupMb: 18,
    formActionsMt: 24,
    formActionsGap: 10,
    // Design spec: form vertical rhythm
    formLabelToInput: 8,    // gap between label and input
    formInputToHelper: 4,   // gap between input and helper / error text
    formFieldGap: 16,       // gap between adjacent fields in a stack
    formSectionGap: 32,     // gap between form sections
    // Design spec: input padding 12×16 (pairs with 40px standard input height)
    inputPaddingY: 12,
    inputPaddingX: 16,
    btnSm: '6px 14px',
    btnMd: '10px 20px',
    btnLg: '14px 28px',
    chip: '4px 12px',
    chipSm: '2px 9px',
    tableCell: '12px 16px',
    tableCellX: '16px', // horizontal-only variant for DataGrid cells (see MuiDataGrid.cell)
    statusMsg: '14px 18px',
    sidebarItem: '10px 12px',
  },

  // Component dimensions
  size: {
    navHeight: 64,
    sidebarCollapsed: 72,
    sidebarExpanded: 200,
    sidebarItemMinHeight: 48,
    iconButton: 38,
    iconButtonBorder: 1.5,
    avatarSm: 30,
    avatarMd: 34,
    btnSmMinH: 28,
    btnMdMinH: 36,
    btnLgMinH: 44,
    chipMd: 24,
    chipSm: 20,
  },

  // Letter spacing
  letterSpacing: {
    button: '0.04em',
    chip: '0.06em',
    subheading: '0.08em',
    cardTitle: '0.05em',
    tableHead: '0.06em',
    coverTitle: '-0.01em',
  },

  // Line heights
  lineHeight: {
    body: 1.6,
    heading: 1.15,
    h2: 1.2,
    h3: 1.3,
    h4: 1.3,
    h5: 1.4,
  },

  // Transitions
  transition: {
    fast: 'all 0.15s ease',
    base: 'all 0.18s ease',
    slow: 'all 0.20s ease',
  },

  // Font sizes (rem, derived from px-rem at 16px root)
  fontSize: {
    h1: '2.25rem',     // 36px
    h2: '1.75rem',     // 28px
    h3: '1.375rem',    // 22px
    h4: '1.125rem',    // 18px
    h5: '0.9375rem',   // 15px
    h6: '0.8125rem',   // 13px
    subheading: '0.75rem',  // 12px
    sectionHeader: '1.75rem', // 28px
    navTitle: '1.0625rem',  // 17px
    cardTitle: '0.75rem',   // 12px
    p1: '1rem',        // 16px
    p2: '0.875rem',    // 14px
    p3: '0.8125rem',   // 13px
    label: '0.75rem',  // 12px
    footer: '0.6875rem', // 11px
    formLabel: '0.8125rem',  // 13px
    formInput: '1rem',       // 16px — design spec (also prevents iOS Safari from zooming on focus)
    formHelper: '0.6875rem', // 11px
    btnSm: '0.6875rem',  // 11px
    btnMd: '0.8125rem',  // 13px
    btnLg: '0.9375rem',  // 15px
    chip: '0.6875rem',   // 11px
    chipSm: '0.625rem',  // 10px
    tableHead: '0.6875rem', // 11px
    tableCell: '0.8125rem', // 13px
    breadcrumb: '0.875rem', // 14px
    breadcrumbCurrent: '1rem', // 16px
  },
} as const;

// ─── Typography (precise design system spec) ────────────────────────
const typography: ThemeOptions['typography'] = {
  fontSize: 13, // base for MUI's rem calculations (matches body p3)
  fontFamily: FONT_BODY,
  htmlFontSize: 16,

  // Headings — Quicksand. Spec gives semi-bold (600) and bold/extra-bold variants;
  // we use the heavier of the pair so headings read with brand weight.
  h1: {
    fontFamily: FONT_TITLE,
    fontSize: taruviTokens.fontSize.h1,         // 36px
    fontWeight: 800,                            // extra-bold
    lineHeight: taruviTokens.lineHeight.heading,
    letterSpacing: '-0.01em',
  },
  h2: {
    fontFamily: FONT_TITLE,
    fontSize: taruviTokens.fontSize.h2,         // 28px
    fontWeight: 700,
    lineHeight: taruviTokens.lineHeight.h2,
  },
  h3: {
    fontFamily: FONT_TITLE,
    fontSize: taruviTokens.fontSize.h3,         // 22px
    fontWeight: 700,
    lineHeight: taruviTokens.lineHeight.h3,
  },
  h4: {
    fontFamily: FONT_TITLE,
    fontSize: taruviTokens.fontSize.h4,         // 18px
    fontWeight: 700,
    lineHeight: taruviTokens.lineHeight.h4,
  },
  h5: {
    fontFamily: FONT_TITLE,
    fontSize: taruviTokens.fontSize.h5,         // 15px
    fontWeight: 700,
    lineHeight: taruviTokens.lineHeight.h5,
  },
  h6: {
    fontFamily: FONT_TITLE,
    fontSize: taruviTokens.fontSize.h6,         // 13px
    fontWeight: 700,
    lineHeight: taruviTokens.lineHeight.h5,
  },

  // Body sizes (Open Sans)
  body1: {
    fontFamily: FONT_BODY,
    fontSize: taruviTokens.fontSize.p2,        // 14px
    lineHeight: taruviTokens.lineHeight.body,
  },
  body2: {
    fontFamily: FONT_BODY,
    fontSize: taruviTokens.fontSize.p3,        // 13px
    lineHeight: taruviTokens.lineHeight.body,
  },

  // Subtitles ≈ Quicksand subheading rules
  subtitle1: {
    fontFamily: FONT_TITLE,
    fontSize: '0.875rem',                       // 14px
    fontWeight: 600,
    lineHeight: 1.4,
  },
  subtitle2: {
    fontFamily: FONT_TITLE,
    fontSize: taruviTokens.fontSize.subheading, // 12px
    fontWeight: 500,
    lineHeight: 1.4,
    letterSpacing: taruviTokens.letterSpacing.subheading,
    textTransform: 'uppercase',
  },

  // Buttons — Quicksand uppercase 700, 0.04em
  button: {
    fontFamily: FONT_TITLE,
    fontSize: taruviTokens.fontSize.btnMd,      // 13px
    fontWeight: 700,
    letterSpacing: taruviTokens.letterSpacing.button,
    textTransform: 'uppercase',
  },

  caption: {
    fontFamily: FONT_BODY,
    fontSize: taruviTokens.fontSize.footer,     // 11px
    lineHeight: 1.4,
  },

  overline: {
    fontFamily: FONT_TITLE,
    fontSize: taruviTokens.fontSize.footer,     // 11px
    fontWeight: 600,
    letterSpacing: taruviTokens.letterSpacing.subheading,
    textTransform: 'uppercase',
  },
};

const shape = { borderRadius: taruviTokens.radius.md }; // 8px default
const spacing = 8;

// ─── Component overrides (every spec'd surface) ─────────────────────
const componentOverrides = (mode: 'light' | 'dark'): ThemeOptions['components'] => {
  const isLight = mode === 'light';
  const dividerColor = isLight ? taruviTokens.surface.borderLight : 'rgba(255,255,255,0.08)';

  return {
    // ─ Global base
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        },
        body: {
          backgroundColor: isLight ? taruviTokens.surface.bg : '#0b1518',
          color: isLight ? taruviTokens.text.primary : '#f8fafc',
          fontFamily: FONT_BODY,
          fontSize: taruviTokens.fontSize.p3,
          lineHeight: taruviTokens.lineHeight.body,
        },
        '*, *::before, *::after': { boxSizing: 'border-box' },
        '[id]': { scrollMarginTop: '24px' },
      },
    },

    // ─ Buttons (primary / secondary / destructive / text / sizes)
    MuiButton: {
      defaultProps: { disableElevation: true, variant: 'contained', disableRipple: false },
      styleOverrides: {
        root: {
          borderRadius: taruviTokens.radius.md,           // 8px (toned via radius block)
          fontFamily: FONT_TITLE,
          fontWeight: 700,
          letterSpacing: taruviTokens.letterSpacing.button,
          textTransform: 'uppercase',
          boxShadow: 'none',
          transition: taruviTokens.transition.base,
          gap: 6,
          // Design spec: 44px min touch target on coarse pointers (mobile/tablet) — WCAG 2.5.5
          '@media (pointer: coarse)': {
            minHeight: 44,
          },
        },
        sizeSmall: {
          padding: taruviTokens.spacing.btnSm,
          fontSize: taruviTokens.fontSize.btnSm,
          minHeight: taruviTokens.size.btnSmMinH,
        },
        sizeMedium: {
          padding: taruviTokens.spacing.btnMd,
          fontSize: taruviTokens.fontSize.btnMd,
          minHeight: taruviTokens.size.btnMdMinH,
        },
        sizeLarge: {
          padding: taruviTokens.spacing.btnLg,
          fontSize: taruviTokens.fontSize.btnLg,
          minHeight: taruviTokens.size.btnLgMinH,
        },
        containedPrimary: {
          backgroundColor: taruviTokens.button.primaryDefault,
          color: '#fff',
          '&:hover': { backgroundColor: taruviTokens.button.primaryHover, boxShadow: 'none' },
          '&:active': { backgroundColor: taruviTokens.button.primaryActive },
          '&.Mui-disabled': {
            backgroundColor: taruviTokens.button.primaryDisabled,
            color: taruviTokens.button.primaryDisabledText,
          },
        },
        outlinedPrimary: {
          borderWidth: 2,
          borderColor: taruviTokens.button.primaryDefault,
          color: taruviTokens.button.primaryDefault,
          '&:hover': {
            borderWidth: 2,
            backgroundColor: '#e3f0fb',
            borderColor: taruviTokens.button.primaryHover,
          },
        },
        containedError: {
          backgroundColor: taruviTokens.error[600],
          color: '#fff',
          '&:hover': { backgroundColor: taruviTokens.error[800], boxShadow: 'none' },
        },
        outlinedError: {
          borderWidth: 2,
          borderColor: taruviTokens.error[600],
          color: taruviTokens.error[600],
          '&:hover': {
            borderWidth: 2,
            backgroundColor: taruviTokens.error[50],
            borderColor: taruviTokens.error[700],
          },
        },
        text: {
          color: taruviTokens.button.primaryDefault,
          '&:hover': { backgroundColor: 'rgba(30,136,229,0.06)' },
        },
      },
    },

    // ─ Icon button — 8px radius + design-system hover.
    //   The design system's "Icon-Only Button" (38×38 with a 1.5px border)
    //   is opt-in via className "btn-icon-only" so we don't bracket every
    //   inline icon affordance in the codebase with a heavy border.
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: taruviTokens.radius.md,
          color: isLight ? taruviTokens.text.secondary : taruviTokens.neutral[300],
          transition: taruviTokens.transition.fast,
          padding: 8,
          '&:hover': {
            backgroundColor: isLight ? taruviTokens.neutral[100] : 'rgba(255,255,255,0.06)',
          },
          '&.btn-icon-only': {
            width: taruviTokens.size.iconButton,
            height: taruviTokens.size.iconButton,
            border: `${taruviTokens.size.iconButtonBorder}px solid ${dividerColor}`,
          },
        },
        sizeSmall: { padding: 4 },
        colorError: { color: taruviTokens.error[600] },
      },
    },

    // ─ Chips (pill, Quicksand 700 uppercase, 0.06em)
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: taruviTokens.radius.pill,
          fontFamily: FONT_TITLE,
          fontWeight: 700,
          fontSize: taruviTokens.fontSize.chip,        // 11px
          letterSpacing: taruviTokens.letterSpacing.chip,
          textTransform: 'uppercase',
          height: taruviTokens.size.chipMd,            // 24px
          paddingLeft: 4,
          paddingRight: 4,
        },
        sizeSmall: {
          height: taruviTokens.size.chipSm,            // 20px
          fontSize: taruviTokens.fontSize.chipSm,      // 10px
        },
        outlined: { borderWidth: 1.5 },
        label: { paddingLeft: 8, paddingRight: 8 },
        // Color variants line up with MUI's color="success"/etc.
        colorSuccess: { backgroundColor: '#388e3c', color: '#fff' },
        colorInfo: { backgroundColor: taruviTokens.status.inProgress, color: '#fff' },
        colorWarning: { backgroundColor: taruviTokens.status.review, color: '#fff' },
        colorError: { backgroundColor: taruviTokens.error[600], color: '#fff' },
      },
      // Tag-chip rotation palette (UI_Guidelines §3). Pick one explicitly
      // (`variant="tagBlue"`) or compute via a small hash from the tag name
      // for deterministic per-name assignment.
      variants: [
        { props: { variant: 'tagBlue' as const },   style: { backgroundColor: '#E0F6FE', color: '#004369', textTransform: 'none' } },
        { props: { variant: 'tagPurple' as const }, style: { backgroundColor: '#EDE7F6', color: '#4527A0', textTransform: 'none' } },
        { props: { variant: 'tagGreen' as const },  style: { backgroundColor: '#E8F5E9', color: '#1B5E20', textTransform: 'none' } },
        { props: { variant: 'tagOrange' as const }, style: { backgroundColor: '#FFF3E0', color: '#E65100', textTransform: 'none' } },
      ],
    },

    // ─ Cards (16px radius, 28px padding, soft shadow)
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: taruviTokens.radius.xxl,        // 16px
          // The 28px inset lives on MuiCardContent (below), not here, so a
          // full-bleed child — a DataGrid, a CardMedia image — can sit flush by
          // zeroing CardContent's padding. Putting padding on the Card root
          // insets *every* child, which left a gap around edge-to-edge tables.
          boxShadow: isLight ? taruviTokens.shadow.card : taruviTokens.shadow.cardDark,
          backgroundImage: 'none',
          backgroundColor: isLight ? taruviTokens.surface.paper : '#11202a',
        },
      },
    },
    MuiCardHeader: {
      styleOverrides: {
        root: { padding: 0, marginBottom: taruviTokens.spacing.cardTitleMb },
        title: {
          fontFamily: FONT_TITLE,
          fontSize: taruviTokens.fontSize.cardTitle,    // 12px
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: taruviTokens.letterSpacing.cardTitle,
          color: isLight ? taruviTokens.text.secondary : taruviTokens.neutral[300],
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        // Card inset now lives here (moved off MuiCard.root) so a full-bleed
        // table can opt out with `sx={{ p: 0, '&:last-child': { pb: 0 } }}`.
        root: {
          padding: taruviTokens.spacing.cardPadding,    // 28px
          '&:last-child': { paddingBottom: taruviTokens.spacing.cardPadding },
        },
      },
    },

    // ─ Generic surface
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
        rounded: { borderRadius: taruviTokens.radius.xl }, // 12px default
      },
    },

    // ─ Form fields
    MuiTextField: {
      defaultProps: { size: 'small', variant: 'outlined' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: taruviTokens.radius.lg,        // 10px
          backgroundColor: isLight ? taruviTokens.surface.inputBg : 'rgba(255,255,255,0.04)',
          fontFamily: FONT_BODY,
          fontSize: taruviTokens.fontSize.formInput,   // 14px
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: isLight ? taruviTokens.surface.borderInput : 'rgba(255,255,255,0.12)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: taruviTokens.button.primaryDefault,
            borderWidth: 1,
          },
          '&.Mui-focused': { boxShadow: taruviTokens.shadow.focusRing },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': {
            borderColor: taruviTokens.error[600],
            borderWidth: 1,
          },
          // Design spec: disabled = opacity 0.5, no pointer events
          '&.Mui-disabled': {
            opacity: 0.5,
            pointerEvents: 'none',
          },
          // Design spec: read-only = muted background, no border
          '&.Mui-readOnly': {
            backgroundColor: isLight ? taruviTokens.neutral[100] : 'rgba(255,255,255,0.06)',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
          },
        },
        input: {
          padding: `${taruviTokens.spacing.inputPaddingY}px ${taruviTokens.spacing.inputPaddingX}px`,
        },
        multiline: { padding: 0 },
      },
    },
    MuiFilledInput: {
      styleOverrides: {
        root: {
          borderRadius: taruviTokens.radius.lg,
          backgroundColor: isLight ? taruviTokens.surface.inputBg : 'rgba(255,255,255,0.04)',
          '&:hover': { backgroundColor: isLight ? '#ECECEF' : 'rgba(255,255,255,0.06)' },
          '&.Mui-focused': {
            backgroundColor: isLight ? taruviTokens.surface.inputBg : 'rgba(255,255,255,0.04)',
            boxShadow: taruviTokens.shadow.focusRing,
          },
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          fontFamily: FONT_BODY,
          fontSize: taruviTokens.fontSize.formInput,
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontFamily: FONT_BODY,
          fontSize: taruviTokens.fontSize.formLabel,    // 13px
          fontWeight: 600,
          color: isLight ? taruviTokens.text.primary : '#f8fafc',
          '&.Mui-focused': { color: taruviTokens.button.primaryDefault },
          '&.Mui-error': { color: taruviTokens.error[600] },
        },
      },
    },
    MuiFormLabel: {
      styleOverrides: {
        root: {
          fontFamily: FONT_BODY,
          fontSize: taruviTokens.fontSize.formLabel,
          fontWeight: 600,
          '& .MuiFormLabel-asterisk': { color: taruviTokens.error[600], marginLeft: 2 },
        },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          fontFamily: FONT_BODY,
          fontSize: taruviTokens.fontSize.formHelper,   // 11px
          marginLeft: 4,
          marginTop: 4,
          color: isLight ? taruviTokens.text.muted : taruviTokens.neutral[400],
          '&.Mui-error': { color: taruviTokens.error[600] },
        },
      },
    },
    MuiSelect: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        select: {
          padding: `${taruviTokens.spacing.inputPaddingY}px ${taruviTokens.spacing.inputPaddingX}px`,
        },
      },
    },

    // ─ Tables
    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: taruviTokens.radius.xl,        // 12px
          border: `1px solid ${dividerColor}`,
          backgroundColor: isLight ? taruviTokens.surface.paper : '#11202a',
          overflowX: 'auto',
        },
      },
    },
    MuiTable: {
      styleOverrides: {
        root: { borderCollapse: 'collapse' },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: isLight ? taruviTokens.neutral[50] : 'rgba(255,255,255,0.04)',
          borderBottom: `1px solid ${dividerColor}`,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontFamily: FONT_BODY,
          fontSize: taruviTokens.fontSize.tableCell,   // 13px
          padding: taruviTokens.spacing.tableCell,     // 12px 16px
          borderBottom: `1px solid ${isLight ? taruviTokens.surface.borderTableRow : 'rgba(255,255,255,0.06)'}`,
          color: isLight ? taruviTokens.text.primary : '#f8fafc',
          verticalAlign: 'middle',
        },
        head: {
          fontFamily: FONT_TITLE,
          fontSize: taruviTokens.fontSize.tableHead,   // 11px
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: taruviTokens.letterSpacing.tableHead,
          color: isLight ? taruviTokens.text.muted : taruviTokens.neutral[400],
        },
        body: {
          fontFamily: FONT_BODY,
          fontSize: taruviTokens.fontSize.tableCell,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: isLight ? taruviTokens.primary[50] : 'rgba(30,136,229,0.08)',
          },
          // Design spec: selected row = primary-50 fill + 2px primary-default left border
          '&.Mui-selected': {
            backgroundColor: isLight ? taruviTokens.primary[50] : 'rgba(30,136,229,0.12)',
            boxShadow: `inset 2px 0 0 ${taruviTokens.button.primaryDefault}`,
            '&:hover': {
              backgroundColor: isLight ? taruviTokens.primary[100] : 'rgba(30,136,229,0.18)',
            },
          },
          '&:last-child td': { borderBottom: 'none' },
        },
      },
    },

    // ─ DataGrid (mirrors MuiTable* styling so DataGrid-based list pages
    //   and hand-rolled <Table> pages look identical — UI_Guidelines §4.7)
    MuiDataGrid: {
      styleOverrides: {
        root: {
          borderRadius: taruviTokens.radius.xl,                          // 8px (toned)
          border: `1px solid ${dividerColor}`,
          backgroundColor: isLight ? taruviTokens.surface.paper : '#11202a',
          fontFamily: FONT_BODY,
          fontSize: taruviTokens.fontSize.tableCell,                     // 13px
          // No focus outlines on cells / rows — design uses subtle hover/selected fills instead
          '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
          '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': { outline: 'none' },
        },
        columnHeaders: {
          backgroundColor: isLight ? taruviTokens.neutral[50] : 'rgba(255,255,255,0.04)',
          borderBottom: `1px solid ${dividerColor}`,
          minHeight: 44,
          maxHeight: 44,
          lineHeight: '44px',
        },
        columnHeaderTitle: {
          fontFamily: FONT_TITLE,
          fontSize: taruviTokens.fontSize.tableHead,                     // 11px
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: taruviTokens.letterSpacing.tableHead,
          color: isLight ? taruviTokens.text.muted : taruviTokens.neutral[400],
        },
        cell: {
          // DataGrid cells are fixed-height and vertically center content via a
          // line-height trick (line-height ≈ row height), NOT flexbox. Applying
          // vertical padding here shrinks the content box while the tall line box
          // stays put, pushing text/chips off-center. So pad horizontally only and
          // let MUI's native centering handle the vertical axis (text via line-height,
          // chips via their own vertical-align: middle). Row height is set by the
          // `rowHeight` prop, so this does not shorten rows.
          padding: `0 ${taruviTokens.spacing.tableCellX}`,               // 0 16
          borderBottom: `1px solid ${isLight ? taruviTokens.surface.borderTableRow : 'rgba(255,255,255,0.06)'}`,
          // Belt-and-suspenders: if a colDef opts into flex cells (display: 'flex'),
          // keep them centered too.
          '&.MuiDataGrid-cell--flex': { alignItems: 'center' },
        },
        row: {
          '&:hover': {
            backgroundColor: isLight ? taruviTokens.primary[50] : 'rgba(30,136,229,0.08)',
          },
          '&.Mui-selected': {
            backgroundColor: isLight ? taruviTokens.primary[50] : 'rgba(30,136,229,0.12)',
            boxShadow: `inset 2px 0 0 ${taruviTokens.button.primaryDefault}`,
            '&:hover': {
              backgroundColor: isLight ? taruviTokens.primary[100] : 'rgba(30,136,229,0.18)',
            },
          },
        },
        footerContainer: {
          borderTop: `1px solid ${dividerColor}`,
          minHeight: 44,
        },
        checkboxInput: {
          color: isLight ? taruviTokens.neutral[400] : taruviTokens.neutral[500],
          '&.Mui-checked': { color: taruviTokens.button.primaryDefault },
        },
      },
    },

    // ─ Navigation (AppBar + Drawer)
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: {
          minHeight: taruviTokens.size.navHeight,      // 64px
          boxShadow: taruviTokens.shadow.nav,
        },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: taruviTokens.size.navHeight,
          gap: 16,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          borderRight: `1px solid ${dividerColor}`,
          boxShadow: taruviTokens.shadow.sidebar,
        },
      },
    },

    // ─ Sidebar list items
    MuiListItem: {
      styleOverrides: {
        root: { padding: 0 },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: taruviTokens.radius.md,
          fontFamily: FONT_TITLE,
          fontWeight: 600,
          fontSize: taruviTokens.fontSize.h6,          // 13px
          padding: taruviTokens.spacing.sidebarItem,   // 10px 12px
          minHeight: taruviTokens.size.sidebarItemMinHeight,
          color: isLight ? taruviTokens.text.secondary : taruviTokens.neutral[300],
          transition: taruviTokens.transition.fast,
          '&.Mui-selected': {
            backgroundColor: taruviTokens.status.inProgress, // #1976d2
            color: '#fff',
            '& .MuiListItemIcon-root': { color: '#fff' },
            '&:hover': { backgroundColor: '#1565c0' },
          },
          '&:hover': {
            backgroundColor: isLight ? taruviTokens.neutral[100] : 'rgba(255,255,255,0.06)',
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          color: isLight ? taruviTokens.text.muted : taruviTokens.neutral[400],
          minWidth: 36,
          fontSize: 20,
        },
      },
    },
    MuiListItemText: {
      styleOverrides: {
        primary: {
          fontFamily: FONT_BODY,
          fontWeight: 400,
          fontSize: taruviTokens.fontSize.h6,
        },
      },
    },

    // ─ Breadcrumbs
    MuiBreadcrumbs: {
      styleOverrides: {
        root: {
          fontFamily: FONT_BODY,
          fontSize: taruviTokens.fontSize.breadcrumb,  // 14px
          padding: '10px 0',
        },
        separator: {
          color: isLight ? taruviTokens.text.muted : taruviTokens.neutral[400],
        },
        li: {
          '&:last-child': {
            fontSize: taruviTokens.fontSize.breadcrumbCurrent, // 16px
            fontWeight: 600,
            color: isLight ? taruviTokens.text.primary : '#f8fafc',
          },
        },
      },
    },

    // ─ Status / alert messages
    MuiAlert: {
      defaultProps: { variant: 'standard' },
      styleOverrides: {
        root: {
          borderRadius: taruviTokens.radius.lg,         // 10px
          fontFamily: FONT_BODY,
          fontSize: taruviTokens.fontSize.p2,          // 14px
          padding: taruviTokens.spacing.statusMsg,     // 14px 18px
          borderLeft: '4px solid',
          alignItems: 'flex-start',
        },
        icon: { fontSize: 20, marginTop: 1 },
        message: { padding: 0 },
        standardSuccess: {
          backgroundColor: taruviTokens.success[50],
          borderLeftColor: '#388e3c',
          color: isLight ? taruviTokens.text.primary : '#f8fafc',
          '& .MuiAlert-icon': { color: '#388e3c' },
        },
        standardError: {
          backgroundColor: taruviTokens.error[50],
          borderLeftColor: taruviTokens.error[600],
          color: isLight ? taruviTokens.text.primary : '#f8fafc',
          '& .MuiAlert-icon': { color: taruviTokens.error[600] },
        },
        standardInfo: {
          backgroundColor: taruviTokens.primary[100],
          borderLeftColor: taruviTokens.status.inProgress,
          color: isLight ? taruviTokens.text.primary : '#f8fafc',
          '& .MuiAlert-icon': { color: taruviTokens.status.inProgress },
        },
        standardWarning: {
          backgroundColor: taruviTokens.warning[50],
          borderLeftColor: taruviTokens.warning[500],
          color: isLight ? taruviTokens.text.primary : '#f8fafc',
          '& .MuiAlert-icon': { color: taruviTokens.warning[500] },
        },
      },
    },
    MuiAlertTitle: {
      styleOverrides: {
        root: { fontFamily: FONT_TITLE, fontWeight: 700, fontSize: '0.875rem' },
      },
    },

    // ─ Tooltip
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: taruviTokens.neutral[900],
          color: '#fff',
          fontFamily: FONT_BODY,
          fontSize: '0.75rem',
          borderRadius: taruviTokens.radius.sm,        // 6px
          padding: '6px 10px',
        },
        arrow: { color: taruviTokens.neutral[900] },
      },
    },

    // ─ Divider
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: dividerColor },
      },
    },

    // ─ Links
    MuiLink: {
      defaultProps: { underline: 'hover' },
      styleOverrides: {
        root: {
          color: taruviTokens.status.inProgress,
          fontWeight: 500,
          fontFamily: FONT_BODY,
        },
      },
    },

    // ─ Avatars
    MuiAvatar: {
      styleOverrides: {
        root: {
          width: taruviTokens.size.avatarMd,
          height: taruviTokens.size.avatarMd,
          fontFamily: FONT_TITLE,
          fontWeight: 700,
          fontSize: taruviTokens.fontSize.h6,
        },
      },
    },

    // ─ Accordion (collapsible form section — UI_Guidelines §4.3)
    // Flat by default: no shadow, no top divider line, no extra margin
    // when expanded. Pair with `<ExpandMoreRoundedIcon />`.
    MuiAccordion: {
      defaultProps: { elevation: 0, disableGutters: true },
      styleOverrides: {
        root: {
          boxShadow: 'none',
          border: `1px solid ${dividerColor}`,
          borderRadius: taruviTokens.radius.lg,
          backgroundImage: 'none',
          // Hide the default 1px line on top of every accordion
          '&::before': { display: 'none' },
          '&:not(:last-child)': { marginBottom: 8 },
          '&.Mui-expanded': { margin: '0 0 8px 0' },
        },
      },
    },
    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          minHeight: 48,
          fontFamily: FONT_BODY,
          fontWeight: 600,
          fontSize: taruviTokens.fontSize.formLabel,   // 13px
          '&.Mui-expanded': { minHeight: 48 },
        },
        content: {
          '&.Mui-expanded': { margin: '12px 0' },
        },
      },
    },
    MuiAccordionDetails: {
      styleOverrides: {
        root: {
          padding: '0 16px 16px',
        },
      },
    },

    // ─ Dialog / modal
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: taruviTokens.radius.xxl,
          padding: taruviTokens.spacing.cardPadding,
          boxShadow: isLight ? taruviTokens.shadow.card : taruviTokens.shadow.cardDark,
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontFamily: FONT_TITLE,
          fontSize: taruviTokens.fontSize.h4,          // 18px
          fontWeight: 700,
          padding: 0,
          marginBottom: 16,
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: { root: { padding: 0 } },
    },
    // Confirmation-dialog body (UI_Guidelines §4.8) — body2 size, secondary color
    MuiDialogContentText: {
      styleOverrides: {
        root: {
          fontFamily: FONT_BODY,
          fontSize: taruviTokens.fontSize.p2,        // 14px
          lineHeight: taruviTokens.lineHeight.body,
          color: isLight ? taruviTokens.text.secondary : taruviTokens.neutral[300],
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: 0,
          marginTop: taruviTokens.spacing.formActionsMt,
          gap: taruviTokens.spacing.formActionsGap,
          justifyContent: 'flex-end',
        },
      },
    },

    // ─ Tabs
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 40,
          borderBottom: `1px solid ${dividerColor}`,
        },
        indicator: { backgroundColor: taruviTokens.button.primaryDefault, height: 3 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          fontFamily: FONT_TITLE,
          fontSize: taruviTokens.fontSize.btnMd,       // 13px
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: taruviTokens.letterSpacing.button,
          minHeight: 40,
          '&.Mui-selected': { color: taruviTokens.button.primaryDefault },
        },
      },
    },

    // ─ Checkboxes / switches
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: isLight ? taruviTokens.neutral[400] : taruviTokens.neutral[500],
          '&.Mui-checked': { color: taruviTokens.button.primaryDefault },
        },
      },
    },
    MuiRadio: {
      styleOverrides: {
        root: {
          color: isLight ? taruviTokens.neutral[400] : taruviTokens.neutral[500],
          '&.Mui-checked': { color: taruviTokens.button.primaryDefault },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked': {
            color: taruviTokens.button.primaryDefault,
            '& + .MuiSwitch-track': { backgroundColor: taruviTokens.button.primaryDefault },
          },
        },
      },
    },

    // ─ Progress
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: taruviTokens.radius.sm, height: 6 },
        bar: { borderRadius: taruviTokens.radius.sm },
      },
    },
    MuiCircularProgress: {
      defaultProps: { color: 'primary' },
    },

    // ─ Skeleton loader (UI_Guidelines §4.10)
    MuiSkeleton: {
      defaultProps: { animation: 'wave' },
      styleOverrides: {
        root: {
          backgroundColor: isLight ? taruviTokens.neutral[100] : 'rgba(255,255,255,0.08)',
        },
        text: {
          borderRadius: taruviTokens.radius.sm,
        },
        rounded: {
          borderRadius: taruviTokens.radius.xl,
        },
      },
    },
  };
};

// ─── Light theme ─────────────────────────────────────────────────────
export const lightThemeOptions: ThemeOptions = {
  palette: {
    mode: 'light',
    primary: {
      main: taruviTokens.button.primaryDefault,  // #1E88E5
      light: taruviTokens.primary[300],
      dark: taruviTokens.button.primaryActive,
      contrastText: '#ffffff',
    },
    secondary: {
      main: taruviTokens.secondary[700],         // #004369
      light: taruviTokens.secondary[300],
      dark: taruviTokens.secondary[900],
      contrastText: '#ffffff',
    },
    error: {
      main: taruviTokens.error[600],             // #c2185b
      light: taruviTokens.error[200],
      dark: taruviTokens.error[800],
      contrastText: '#ffffff',
    },
    warning: {
      main: taruviTokens.warning[500],           // #f57c00
      light: taruviTokens.warning[200],
      dark: taruviTokens.warning[700],
      contrastText: '#ffffff',
    },
    info: {
      main: taruviTokens.status.inProgress,      // #1976d2
      light: taruviTokens.primary[300],
      dark: taruviTokens.secondary[700],
      contrastText: '#ffffff',
    },
    success: {
      main: taruviTokens.success[500],           // #10B981
      light: taruviTokens.success[200],
      dark: taruviTokens.success[700],
      contrastText: '#ffffff',
    },
    grey: {
      50: taruviTokens.neutral[50],
      100: taruviTokens.neutral[100],
      200: taruviTokens.neutral[200],
      300: taruviTokens.neutral[300],
      400: taruviTokens.neutral[400],
      500: taruviTokens.neutral[500],
      600: taruviTokens.neutral[600],
      700: taruviTokens.neutral[700],
      800: taruviTokens.neutral[800],
      900: taruviTokens.neutral[900],
    },
    background: {
      default: taruviTokens.surface.bg,          // #f3f4f6
      paper: taruviTokens.surface.paper,         // #ffffff
    },
    text: {
      primary: taruviTokens.text.primary,        // #121414
      secondary: taruviTokens.text.secondary,    // #596365
      disabled: taruviTokens.neutral[400],
    },
    divider: taruviTokens.surface.borderLight,
  },
  typography,
  shape,
  spacing,
  components: componentOverrides('light'),
};

// ─── Dark theme ──────────────────────────────────────────────────────
export const darkThemeOptions: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: {
      main: taruviTokens.primary[400],
      light: taruviTokens.primary[300],
      dark: taruviTokens.primary[700],
      contrastText: taruviTokens.primary.dark,
    },
    secondary: {
      main: taruviTokens.secondary[300],
      light: taruviTokens.secondary[100],
      dark: taruviTokens.secondary[600],
      contrastText: taruviTokens.secondary[900],
    },
    error: {
      main: taruviTokens.error[300],
      light: taruviTokens.error[200],
      dark: taruviTokens.error[600],
      contrastText: '#000000',
    },
    warning: {
      main: taruviTokens.warning[400],
      light: taruviTokens.warning[200],
      dark: taruviTokens.warning[600],
      contrastText: '#000000',
    },
    info: {
      main: taruviTokens.primary[300],
      light: taruviTokens.primary[200],
      dark: taruviTokens.primary[600],
      contrastText: '#000000',
    },
    success: {
      main: taruviTokens.success[400],
      light: taruviTokens.success[200],
      dark: taruviTokens.success[700],
      contrastText: '#000000',
    },
    grey: {
      50: taruviTokens.neutral[50],
      100: taruviTokens.neutral[100],
      200: taruviTokens.neutral[200],
      300: taruviTokens.neutral[300],
      400: taruviTokens.neutral[400],
      500: taruviTokens.neutral[500],
      600: taruviTokens.neutral[600],
      700: taruviTokens.neutral[700],
      800: taruviTokens.neutral[800],
      900: taruviTokens.neutral[900],
    },
    background: {
      default: '#0b1518',
      paper: '#11202a',
    },
    text: {
      primary: '#f8fafc',
      secondary: taruviTokens.neutral[300],
      disabled: taruviTokens.neutral[500],
    },
    divider: 'rgba(255,255,255,0.08)',
  },
  typography,
  shape,
  spacing,
  components: componentOverrides('dark'),
};

// HMG architectural application layer. All product colors remain centralized here.
const hmg = taruviTokens.hmg;
const hmgComponents: ThemeOptions['components'] = {
  MuiCssBaseline: { styleOverrides: { body: { fontFamily: FONT_BODY, fontSize: 16 }, '*:focus-visible': { outline: `2px solid ${hmg.olive}`, outlineOffset: 3 }, '@media (prefers-reduced-motion: reduce)': { '*, *::before, *::after': { animation: 'none !important', transition: 'none !important' } } } },
  MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 44, borderRadius: 6, textTransform: 'none', fontFamily: FONT_BODY, fontSize: 14, fontWeight: 600, letterSpacing: 0, padding: '10px 18px' }, containedPrimary: { backgroundColor: hmg.olive, '&:hover': { backgroundColor: hmg.oliveDark } } } },
  MuiIconButton: { styleOverrides: { root: { minHeight: 44, minWidth: 44 } } },
  MuiCard: { styleOverrides: { root: { border: `1px solid ${hmg.border}`, borderRadius: 8, boxShadow: 'none', backgroundImage: 'none' } } },
  MuiCardContent: { styleOverrides: { root: { padding: 24, '&:last-child': { paddingBottom: 24 } } } },
  MuiChip: { styleOverrides: { root: { fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, textTransform: 'none', letterSpacing: 0, height: 28 } } },
  MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 6, backgroundColor: hmg.paper, fontSize: 16 }, input: { padding: '12px 14px' }, notchedOutline: { borderColor: hmg.border } } },
  MuiInputLabel: { styleOverrides: { root: { fontFamily: FONT_BODY, fontSize: 14 } } },
  MuiFormHelperText: { styleOverrides: { root: { fontSize: 14 } } },
  MuiTab: { styleOverrides: { root: { fontFamily: FONT_BODY, fontSize: 14, minHeight: 48, textTransform: 'none', letterSpacing: 0 } } },
  MuiTableCell: { styleOverrides: { root: { fontSize: 14, padding: '16px', borderColor: hmg.border }, head: { fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', backgroundColor: hmg.background } } },
  MuiDialog: { styleOverrides: { paper: { borderRadius: 8, padding: taruviTokens.spacing.cardPadding, boxShadow: taruviTokens.shadow.card } } },
  MuiDialogTitle: { styleOverrides: { root: { fontFamily: FONT_TITLE, fontSize: 24, padding: 0, marginBottom: taruviTokens.spacing.formFieldGap, overflowWrap: 'anywhere' } } },
};
lightThemeOptions.palette = { ...lightThemeOptions.palette, primary: { main: hmg.olive, dark: hmg.oliveDark, contrastText: hmg.paper }, background: { default: hmg.background, paper: hmg.paper }, text: { primary: hmg.ink, secondary: hmg.muted }, divider: hmg.border };
lightThemeOptions.typography = { ...typography, fontSize: 16, h1: { fontFamily: FONT_TITLE, fontSize: '2.5rem', fontWeight: 400 }, h2: { fontFamily: FONT_TITLE, fontSize: '2rem', lineHeight: 1.25, fontWeight: 400 }, h3: { fontFamily: FONT_TITLE, fontSize: '1.375rem', lineHeight: 1.4, fontWeight: 400 }, body1: { fontSize: '1rem', lineHeight: 1.5 }, body2: { fontSize: '.875rem', lineHeight: 1.5 }, caption: { fontSize: '.875rem' }, button: { fontFamily: FONT_BODY, textTransform: 'none' } };
lightThemeOptions.components = { ...lightThemeOptions.components, ...hmgComponents };
// The visual brief intentionally has one consistent architectural palette.
Object.assign(darkThemeOptions, lightThemeOptions);
