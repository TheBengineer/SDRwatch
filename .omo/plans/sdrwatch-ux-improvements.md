# SDRWatch UX Improvements

Adversarial UX review (UX Researcher, Power User, Architect, Design Critic) distilled into an 18-task, 4-wave plan. Addresses beginner onboarding, power-user efficiency, information architecture, and visual polish.

---

## TODOs

### Wave 1 — Foundation + Bug Fix (P0 + P1, all independent)

1. [x] Test infrastructure — Install vitest + @testing-library/react + jsdom. Create vitest.config.ts. Add src/setupTests.ts. Add `npm run test` script. Write one smoke test for AppLayout to validate setup. Category: quick. QA: `npm run test` exits 0.

2. [x] Component primitives + design tokens — Create src/components/primitives/Button.tsx (variants: primary/secondary/danger/ghost/icon), Card.tsx (elevated/inset/bordered, collapsible mode), Input.tsx (label, hint, error, prefix/suffix), Select.tsx (label, hint, error), CollapsibleSection.tsx (animated, aria-expanded). Update index.css with missing tokens: --btn-*-*, --card-*-*, --focus-ring. Write TDD tests per primitive. Migrate 2-3 existing usages (FilterBar Reset button, Dashboard card, NavBar) to prove primitives work. Category: artistry. Skills: shared/programming, frontend. QA: tests pass, typecheck passes, migrated pages look equivalent.

3. [x] StartHereCTA component — Create dismissable onboarding overlay/icon ("?" in header) with 3-step checklist: Connect SDR → Start Scan → Browse Results. Completion persisted in localStorage. Category: visual-engineering. Skills: shared/programming, frontend. QA: Checklist renders, dismiss works, localStorage persists state.

4. [x] NoBaselineCTA guard — Full-page guard in AppLayout when baselines.length === 0. Explains what a baseline is, provides inline creation form (name + optional location, POST /api/baselines). On success, transitions to normal view. Category: deep. Skills: shared/programming. QA: App shows CTA when baselines=[], form submits correctly, app transitions after creation.

5. [x] NavBar grouping — Group nav links under section headers: Monitor (Dashboard, Spectrum, Changes), Manage (Signals, Recordings, Spur Map), Configure (Control, Live), System (Debug). ~50 lines in NavBar.tsx. No route changes. Category: quick. Skills: shared/programming. QA: 4 groups visible, all 9 links functional.

6. [x] Baseline_id preservation bug fix — Audit URL param flow across all navigation paths. Ensure baseline_id query param persists when navigating between pages. Fix any paths where it drops (signals/recordings APIs receive wrong data). Category: quick. Skills: shared/programming. QA: baseline_id survives full navigation cycle, signals/recordings APIs always receive correct ID.

### Wave 2 — Workflow Friction (P1, depends on Wave 1 primitives)

7. [x] Dashboard progressive disclosure — Wrap SNR histogram + coverage heatmap in CollapsibleSection with defaultOpen=false. Keep tactical snapshot, band summary, active signals, change feed visible by default. Category: quick. Skills: shared/programming. QA: secondary charts collapsed on load, expand on click.

8. [x] ControlPage collapsible sections — Refactor 50+ fields into 8 collapsible sections: Frequency Presets (always visible), Sweep Parameters, Detection Settings, CFAR Configuration, Verification (Two-pass), Continuous Capture, Recording Limits, Notifications. Add quick-start preset buttons (FM, VHF_AIR, FULL) at top. Category: deep. Skills: shared/programming, shared/refactor. QA: Sections collapse/expand, all fields submit correctly, presets populate form.

9. [x] Unified FilterBar — Create src/components/primitives/UnifiedFilterBar.tsx accepting FilterField descriptors. Replace FilterBar.tsx (Dashboard), Changes filter, Signals filter, Recordings filter with one component. Delete old FilterBar.tsx. Category: artistry. Skills: shared/refactor, shared/programming. QA: All 4 pages render correct filters, old file deleted, typecheck passes.

10. [x] Global empty states — Wire EmptyState into Dashboard (no baseline data → "Run your first scan"), Signals (no signals → "Start a scan"), Recordings (no recordings → "Signals with burst capture create recordings"), SpurMap (no spur data → "Run spur calibration"), Changes (no events → "Events appear after sweeps"). Integrate StartHereCTA as header "?" icon. Category: unspecified-high. Skills: shared/programming, frontend. QA: Each empty page shows contextual CTA with actionable button.

11. [x] Micro-copies + tooltips — Add title-attribute tooltips on key terms: Baseline ("Your spectrum reference. Signals are compared against it."), CFAR ("Constant False Alarm Rate — adaptively detects signals above noise floor."), EMA Occupancy, Spur Map. Category: quick. Skills: writing, shared/programming. QA: Tooltips appear on hover for all listed terms.

12. [x] Accessibility pass — Fix WCAG AA contrast (slate-500→slate-400 for body text). Add focus-visible:ring-2 to all interactive elements. Add aria-label to icon-only buttons, role="table" + aria-label to TanStack tables. Category: unspecified-low. Skills: shared/programming. QA: Tab navigation visible on all interactive elements, Lighthouse Accessibility ≥ 90.

### Wave 3 — Quality of Life (P2, depends on Wave 2)

13. [x] ControlPage scan status indicator — Add single-line "Last sweep: 2m ago, 14 signals" status line on ControlPage. Fetches from /api/jobs/active + DB stats. Category: quick. Skills: shared/programming. QA: Status line shows when history exists, hides gracefully when empty.

14. [x] Table UX enhancements — Enable TanStack column resizeMode on Recordings + Signals tables. Add CSS nth-child(even) row striping. Save sorting state to localStorage keyed by page+baselineId. Category: quick. Skills: shared/programming. QA: Columns resizable, sort persists across reloads, row striping visible.

15. [x] Batch operations — Add select-all-filtered checkbox to Recordings+Signals tables (shows count, e.g., "Select all 14 filtered recordings"). Bulk classify dropdown (Signals only). Replace alert()/confirm() with ConfirmDialog modal. Create ConfirmDialog.tsx with focus trap. Category: deep. Skills: shared/programming, frontend. QA: Select-all selects filtered rows, bulk classify sends PATCH, ConfirmDialog traps focus.

16. [x] Cross-page context links — Add "View Recordings" button on SignalDetail header showing recording count for that signal. Link navigates to /recordings?detection_id=<id>. Category: quick. Skills: shared/programming. QA: Recording count shown, link navigates correctly.

### Wave 4 — Polish (P3, depends on Wave 3)

17. [ ] Keyboard shortcuts — Create useKeyboardShortcuts hook: ? (cheat-sheet), s (focus filter), r (refresh), Escape (close modal), 1-4 (nav to Dashboard/Control/Signals/Recordings). Show cheat-sheet overlay via "?" key or header button. Category: quick. Skills: shared/programming. QA: All 5 shortcuts work, cheat-sheet toggles.

18. [ ] Filter presets — Extend UnifiedFilterBar with Save/Load preset buttons. Store in localStorage keyed by baselineId+page. Category: quick. Skills: shared/programming. QA: Save stores current filters, Load dropdown restores them, data re-fetches on load.

19. [ ] Design token migration — Replace remaining bare button patterns (px-3 py-2 rounded-xl...) with Button primitive. Replace bare card patterns (rounded-2xl border border-white/10 p-4) with Card primitive. Use ast-grep for pattern matching. Non-goal: pixel-perfect equivalence — primitive wins if slightly different. Category: refactor. Skills: shared/refactor, shared/ast-grep. QA: No bare inline button/card patterns outside primitives, typecheck+lint pass, visual diff acceptable.

---

## Final Verification Wave

F1. [ ] New user can onboard without documentation (StartHereCTA + NoBaselineCTA + empty-state CTAs)
F2. [ ] ControlPage fits above fold on 1440p with Frequency Presets + Sweep Parameters visible; other fields collapsible
F3. [ ] All 4 data pages (Dashboard, Signals, Recordings, Changes) use same unified filter bar
F4. [ ] Tables support column resize, row striping, and remember sort across reloads
F5. [ ] Keyboard-only user can navigate all interactive elements with visible focus indicators
F6. [ ] Lighthouse Accessibility score ≥ 90
F7. [ ] `npm run typecheck && npm run lint && npm run test` pass
F8. [ ] All existing functionality preserved (scan start/stop, classification, recordings, navigation)

---

## Origin

Generated by hyperplan adversarial UX review (2026-07-10). Team: UX Researcher (unspecified-low), Power User (unspecified-high), Architect (ultrabrain), Design Critic (artistry). Rounds 1-3 completed. Round 3 refinements incorporated: Task 6 elevated P2→P1 (bug fix), Task 13 downgraded P1→P2 (status line), Task 19 downgraded P2→P3 (3-migration only), scopes narrowed on Tasks 3/5/15/17/19 per cross-attack outcomes.
