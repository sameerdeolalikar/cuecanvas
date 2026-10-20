# CueCanvas

A local visual rehearsal planner for small theatre productions, workshops and staged presentations. Built with Go 1.24+ standard library, vanilla JavaScript and SVG. This is a new, independently useful application prototype, developed with AI assistance. The bundled sample is fictional; no accounts, API keys or external services are required.

## What works today

- Edit lighting, sound and stage tracks and inspect cues on a zoomable SVG timeline.
- Create, duplicate and remove cues; edit timing and notes with explicit apply/discard handling.
- Detect same-track overlaps, filter the chronological rundown and undo/redo show changes.
- Rehearse with a monotonic start/pause/reset clock, active-cue display and jump-to-next control.
- Save local shows with optimistic revisions and export/import JSON or export a spreadsheet-safe CSV rundown.

## Run locally

```sh
go build -o bin/cuecanvas .
./bin/cuecanvas
# Open http://127.0.0.1:7422
```

Start commands run from the repository root. The server binds to `127.0.0.1`; open that address rather than `localhost`, because host/origin checks are deliberate. This local server is not configured for public internet hosting.

Use `--port` to choose another port and `--data PATH` to choose the library. The default is `.local-data/shows.json`. The compiled binary embeds the web assets; rebuild after editing them.

## Verify

```sh
go test ./...
go vet ./...
# Browser checks: start a separate server with a disposable data path first.
npm ci
npx playwright install chromium
npm run test:ui
```

Browser tests create synthetic saved records. Point `BASE_URL` at the test server if needed. Chromium requires its normal OS libraries; consult Playwright installation guidance for your system. Set `UI_SCREENSHOTS` to an output directory to capture desktop and narrow-screen evidence. There is no hosted CI configured yet.

## Organization

`core.go` contains timing validation, analysis and CSV export; `store.go` manages atomic local storage; `main.go` embeds `web/` and serves the API. `core_test.go` and `tests/ui.mjs` exercise domain and browser behavior.

## Scope and limitations

The rehearsal clock is a browser convenience, not a live show-control system. It does not trigger lighting, audio, MIDI or other equipment, and browser scheduling can delay display updates. Editing a show resets the clock. Timing is in whole seconds, with at most 200 cues across eight tracks and a 24-hour timeline.

Run only one server process per data file. Storage uses an atomic file replacement and revision checks between browser tabs, not an interprocess database lock. At most 100 shows are supported. Same-track overlaps are notices rather than errors because intentional crossfades can overlap.

Local state, build output and browser downloads are excluded from Git. Back up your data file before experimenting with it. No telemetry or remote synchronization is implemented.

## Next steps

See [ROADMAP.md](ROADMAP.md) for concrete work with acceptance criteria and rough estimates, and [CONTRIBUTING.md](CONTRIBUTING.md) for development conventions.

## License

MIT. See [LICENSE](LICENSE).
