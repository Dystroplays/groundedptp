---
name: Grounded Portal
description: Calm, practical care tools in forest, cream, and rust.
colors:
  forest: "#1f3d2b"
  cream: "#f2eee6"
  sand: "#e6dfd2"
  line: "#d8cdbb"
  muted: "#675f52"
  rust: "#a3512b"
  sage: "#567049"
  ink: "#252821"
  field: "#fbf9f5"
  forest-hover: "#2f513a"
  rust-hover: "#8f4422"
typography:
  display:
    fontFamily: "Sora, sans-serif"
    fontSize: "clamp(27px, 2.8vw, 39px)"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Sora, sans-serif"
    fontSize: "23px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Sora, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.35
  ordinal:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "16px"
rounded:
  control: "4px"
  surface: "5px"
  hero: "6px"
spacing:
  compact: "8px"
  related: "12px"
  row: "16px"
  surface: "24px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.cream}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
  button-primary-hover:
    backgroundColor: "{colors.forest-hover}"
  button-rust:
    backgroundColor: "{colors.rust}"
    textColor: "#fff"
    rounded: "{rounded.control}"
    padding: "12px 18px"
  button-rust-hover:
    backgroundColor: "{colors.rust-hover}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.forest}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
  field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.forest}"
    rounded: "{rounded.control}"
    padding: "11px 13px"
  goal-card:
    backgroundColor: "{colors.sand}"
    rounded: "{rounded.surface}"
    padding: "24px"
---

# Design System: Grounded Portal

## Overview

**Creative North Star: "Grounded care"**

The supplied patient-screen HTML establishes a warm, practical identity: cream paper, forest structure, rust emphasis, and clear geometric typography. The shipped interface extends that identity into a responsive patient portal and denser staff workspace. The name above describes that incumbent world; it is not a new visual direction.

The design mode is Operate. Color blocks identify useful actions and care context, while rows, dividers, and restrained corners keep routine information readable. This record derives from `src/styles.css`, `src/details.css`, and sampled components in `src/ui.tsx` and `src/team.tsx`, with `Portal Patient Screens.dc.html` as the visual authority.

**Key Characteristics:**
- Warm cream canvas and forest action surfaces.
- Sora headings, DM Sans reading text, and Barlow Condensed numerals.
- Flat, ruled lists alongside a small number of tonal panels.
- A persistent desktop rail that becomes mobile navigation.

Final identity assets, staff photos, captioned videos, and approved content remain pending according to PRODUCT.md. Current identity marks and initials are provisional, not approved final brand assets. The reference's imported logo and topographic artwork are not reproduced as a reusable asset system in the shipped styles.

## Colors

The palette combines deep botanical greens with warm paper neutrals and earthy rust.

### Primary
- **Forest:** navigation selection, primary buttons, headings, and the session panel.

### Secondary
- **Rust:** emphasized session action, focus outline, and text caret.
- **Sage:** supporting care signals and progress accents.

### Neutral
- **Cream:** application canvas and reversed text on forest.
- **Sand:** goal panels and supporting containers.
- **Line:** separators and quiet borders.
- **Muted:** secondary prose; **Ink:** default reading text; **Field:** form surfaces.

**The Tonal Structure Rule.** Use forest and sand surfaces to establish hierarchy; use warm dividers to separate repeated information.

## Typography

**Display Font:** Sora, with sans-serif fallback.
**Body Font:** DM Sans, with sans-serif fallback.
**Numeric Accent Font:** Barlow Condensed, with sans-serif fallback.

Sora provides compact, rounded headings; DM Sans carries instructions and controls. Barlow Condensed is evidenced in movement ordinals and date markers. Its decorative uppercase kicker usage is not a reusable rule.

### Hierarchy
- **Display:** page title; mobile patient titles resolve to 29px and staff titles to 28px.
- **Headline:** default section heading; compact section headers use 19px. The session headline uses 32px, 29px on smaller screens, and 37px above the wide breakpoint.
- **Title:** default small heading; individual rows use 14–16px.
- **Body:** baseline reading role; mobile root size is 17px, but explicit component sizes override it. Paragraphs have a 70ch maximum. Patient therapist notes resolve to 16px and exercise descriptions to 14px in `details.css`.
- **Label:** button text, with a minimum control height rather than fixed height.

**The Reading Pair Rule.** Use Sora for hierarchy and DM Sans for reading and interaction.

The reference generally uses 17px patient copy and 52–56px controls. The build uses smaller explicit sizes in many places. Tiny captions and 9–11px metadata are recorded as legibility drift, not a minimum-size standard for future surfaces.

## Layout

Desktop uses a sticky 242px rail, an 83px top bar, and a centered main area capped at 1250px with 45px 44px 60px padding. Patient content has a flexible main column, 275px supporting column, and 37px gap. Staff supporting columns use 300px. Repeated spacing is related but not a strict mathematical scale; the frontmatter lists recurring values, not exhaustive measurements.

At 1150px and below, the rail narrows to 210px and content gutters shrink. At 900px, the primary layout becomes one column and supporting patient content forms two columns. At 650px, the sidebar becomes a 265px overlay, patient navigation becomes a fixed 76px bottom strip, main gutters become 20px, and supporting content stacks. Footer clearance protects bottom navigation. At 1600px and above, the rail grows to 270px and main top padding to 60px.

Staff tables retain horizontal overflow where needed. Detail tabs scroll horizontally. Most forms become one column on mobile; the plan-builder's three-field grid remains compact.

## Elevation & Depth

The interface is flat at rest. Forest, sand, and cream establish depth with one-pixel warm dividers. The mobile sidebar overlay alone uses a diffuse lateral shadow (`12px 0 40px #1f3d2b24`). There is no general card-shadow system.

The session panel enters over 0.7s using a small clip reveal and brightness change with `cubic-bezier(0.16, 1, 0.3, 1)`. Buttons transition background and transform over 0.15s, rising one pixel on hover. Reduced-motion preferences disable animations and transitions.

## Shapes

Controls have small corners; panels use slightly softer corners. Circular geometry is reserved for avatars, status dots, and day markers. Repeated movement rows use thin horizontal rules rather than independent raised cards. Lucide supplies actual SVG icons; initials stand in for portraits.

## Components

### Buttons
Compact and deliberate. Primary buttons pair forest with cream, rust buttons pair rust with white, and outline buttons use forest text with a warm border. The default minimum height is 48px; mobile buttons use 50px, and the primary session action uses 53px and full width. Small variants retain a 44px minimum height. Hover shifts the fill and raises the button one pixel. Disabled buttons use half opacity; asynchronous actions show a busy label and adjacent error feedback.

### Chips
Status badges combine a colored dot with explicit text. Sage-tinted defaults distinguish care status from rust-tinted risk/failure and amber-tinted watch/draft states. They are informational, not clickable controls. Their current 11px type is implementation evidence, not a recommended reading size.

### Cards / Containers
Goal panels use sand with modest padding and no shadow. The session panel uses forest with cream headings and pale green supporting text. Chart notes use light paper, a warm outline, and preserved line breaks. Care timelines and exercise lists remain ruled structures.

### Inputs / Fields
Fields use warm off-white fill, forest text, and a visible neutral border, with a 46px minimum height. Mobile field text uses 16px. Global focus uses a 3px rust outline with 4px offset; day-selector labels use 3px offset. Errors appear as explicit messages. Native checkboxes and radio buttons carry the forest accent.

### Navigation
Desktop rail links use a forest filled active state, cream text, and a visible arrow. Hover uses a light sand fill. Mobile patient navigation has icons above labels and a short forest rule for selection. Staff detail tabs use a forest underline and semibold active text. Focus inherits the global rust outline.

### Movement Rows
A bordered condensed ordinal, Sora movement name, readable prescription, and optional movement tag form a horizontally aligned row. Thin warm rules keep the sequence cohesive. SVG checkmarks indicate completed items without replacing their text.

## Do's and Don'ts

### Do:
- **Do** preserve the supplied forest, cream, and rust identity.
- **Do** use Sora for hierarchy and DM Sans for reading and interaction.
- **Do** pair status color with explicit text.
- **Do** preserve visible focus and reduced-motion behavior.

### Don't:
- **Don't** treat provisional identity marks, initials, or sample content as approved final assets.
- **Don't** add general card shadows to the flat tonal system.
- **Don't** inherit undersized metadata or decorative uppercase kickers as new design-system rules.

Not canonized or repaired: decorative kickers and workspace eyebrows, tiny metadata and logo captions, smaller patient type/control sizes than the supplied reference, and provisional identity/media assets. These are carried build limitations; this documentation pass does not alter application code or legitimize them as future defaults.
