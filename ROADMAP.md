# CueCanvas roadmap

These are planned enhancements, not implemented features. Estimates are provisional engineering effort, including tests and documentation; they are not a claim of hours already worked. Priorities can change after practical use.

## Direct timeline manipulation, 12–18 hours

Add drag/resize, snapping and keyboard nudging. Test timing constraints, overlap visibility and undo as a single gesture.

## Scenes and relative cues, 10–14 hours

Introduce scene groups and offsets anchored to another cue. Detect dependency cycles and preserve existing imports.

## Rehearsal workspace, 8–12 hours

Add optional notes, checkpoints and a dedicated large-type rehearsal view using fictional fixtures. Test clock transitions and focus handling.

## Interchange and recovery, 8–12 hours

Implement validated CSV import with a preview of errors, library backup/restore and explicit schema migration.

## Accessible multi-selection, 8–12 hours

Add bulk shifting and track assignment, responsive inspector panels and end-to-end keyboard workflows.

## Reviewable implementation work

Each milestone can become a focused issue with reproducible input, observable UI behavior and automated checks. Review visual hierarchy, interaction clarity, keyboard behavior, data correctness, regression coverage and maintainability together. The application itself does not run or benchmark AI models.
