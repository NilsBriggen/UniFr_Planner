# Sharing and weekly downloads

Implement sharing and editable weekly exports within the existing guest-first planner.
The user chose automatic updates: an existing link follows successful local saves.

- A share publishes the active scenario across all semesters. Personal unavailable
  periods are excluded by default, with an explicit option to include them.
- The server issues an unguessable reading link. Editing requires a separate secret
  held in the creator's browser, or the authenticated account that created the share.
  Account login alone and possession of the reading link do not grant editing.
- Recipients get a read-only degree/weekly view and an explicit import action that
  creates an independent local plan. Ownership secrets never enter public snapshots,
  plan JSON backups, Excel files or reading links.
- Changes publish automatically with revision checks. Offline failures and concurrent
  edits remain visible; a stale browser cannot silently overwrite another owner edit.
  Owners can reopen the published version for editing and revoke the link.
- Weekly exports use the selected week and Zurich dates/times, including overlap and
  overnight splits. Print/PDF uses a landscape layout with a complete lesson list.
  Excel has an editable colour-coded week, an exact lesson list and personal space;
  source text is written as text, never executable formulas. Unknown dates are stated.
- Keep semester ICS and the existing semester-agenda print workflow.

Verify HTTP permissions with different guests and accounts, revocation, invalid and
oversized snapshots, optimistic updates and migrations/runtime grants. Exercise real
browser sharing, import, automatic updates and downloads in fresh contexts. Reopen
Excel output and inspect printed pages, including overlaps, Unicode and overnight times.
