# File Focus Duo work goals

## Compact mobile navigation and companion toolbar

Goal: show more usable shortcut buttons while keeping folder context, search and direct access to Vault Control Center, Objective Manager and Talk to Vault.

- [x] Replace the tall sidebar header with a compact context row and expandable search.
- [x] Add both companion controls using the installed command identities and existing unavailable notices.
- [x] Preserve 44px touch targets and keep controls inside narrow panes.
- [x] Verify five mobile viewport sizes with local fixtures and compare against 0.1.9.
- [ ] Install and publish the verified portable build.
- [ ] Confirm the layout on the physical phone and its actual theme.

## Talk to Vault startup and phone speech diagnosis

Goal: preserve opening requests during startup and distinguish a connected transport from actual microphone input and recognized speech.

- [x] Reproduce the mobile warm-up event loss with a synthetic regression test.
- [x] Queue startup events until ready; cancel queued work on stop/failure.
- [x] Add local-only microphone/recognition feedback with no diagnostic recording or transmission.
- [x] Test warm-up, shutdown, failure, bounded buffering and input states without paid APIs or real data.
- [ ] Install and publish the verified portable build.
- [ ] Verify recognized words, reply audio and one user-authorized search on the phone.

The physical-phone checks remain open. A connected silent synthetic stream does not prove speech recognition. These are project goals documented in source; no native goal-management service was available in the execution environment.
