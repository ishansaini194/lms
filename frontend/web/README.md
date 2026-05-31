# StudyMe — Admin Portal (frontend, Phase 1)

React + Vite + React Router port of the hi-fi admin mockups. All 8 admin pages,
3 modals, and 5 UI states, rendered as a real running app with working navigation.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173  (redirects to /admin)
```

```bash
npm run build      # production build to dist/
npm run preview    # serve the production build
```

Requires Node 18+.

## What's here

- **8 admin pages**, navigable via the sidebar:
  Dashboard, Classes, Students, Fees, Teachers, Notices, Exams, Settings
- **Deep-link routes**: student detail, exam detail, report card
- **Modals + UI states** are ported as components (Add teacher, Compose notice,
  Create exam; Loading / Empty / Error / Confirm / Toast)

## Project structure

```
src/
  main.jsx                 entry — BrowserRouter
  App.jsx                  routes (all /admin/* pages)
  styles/tokens.css        base CSS, scrollbars, keyframes (hf-skel, hf-caret)
  lib/styles.js            design tokens: hf (colors), hfFonts, hfText
  components/
    icons.jsx              the I icon set (inline SVGs)
    ui/primitives.jsx      Card, Btn, Pill, Chip, Avatar, SubjectIcon,
                           SectionHead, Stat, Sparkbar, ModalShell, StateFrame
    admin/AdminChrome.jsx  AdminChrome (sidebar+topbar, Router-wired),
                           AdminTopBar, Tabs, Segmented, ClassChip, Searchbox,
                           Dropdown, FieldLabel, TextInput, TextArea
  pages/admin/
    screens.jsx            HA1 Dashboard, HA2 Classes, HA3 Students, HA3Detail
    screens2.jsx           HA4 Fees, HA5 Teachers, HA6 Notices
    screens3.jsx           HA7 Exams, HA7Detail, HA7ReportCard, HA9 Settings
    extras.jsx             modals (HA5/6/7Modal) + UI states (ASt*)
```

## Important notes

- **Styling**: kept the original `hf` design tokens (with `oklch()` colors) as
  JS/CSS rather than converting to Tailwind, so the rendered result is identical
  to the approved mockups. (Diverges from the originally-planned Tailwind/shadcn
  stack — easy to revisit.)
- **Data is static mock data, inline in the screen components** — faithful to the
  mockups. The pages are presentational; interactivity (opening modals, toggling
  bulk-select, stepping the fees wizard) is **not wired yet**.
- **No API / auth / login yet** — admin-first per plan; login comes next.

## Next steps (not done yet)

1. Wire interactivity (modals open/close, bulk-select, fees wizard steps)
2. Extract inline mock data into `src/mock/data.js` (single swap point for the API)
3. Iterate in missing schema fields (epunjab_id, aadhar, parent contacts, full
   fee-type whitelist) page by page
4. Login + auth context (needs: does POST /login return a cookie or a token body?)
5. API wiring, then deployment
```
