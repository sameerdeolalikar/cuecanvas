"use strict";
const $ = (id) => document.getElementById(id),
  clone = (v) => structuredClone(v),
  ns = "http://www.w3.org/2000/svg";
const sample = {
  version: 1,
  title: "The Lantern Room · rehearsal",
  tracks: [
    { id: "lights", name: "Lighting" },
    { id: "sound", name: "Sound" },
    { id: "stage", name: "Stage" },
  ],
  cues: [
    {
      id: "house",
      title: "House to half",
      track: "lights",
      start: 0,
      duration: 20,
      note: "Opening atmosphere. Fictional rehearsal.",
    },
    {
      id: "intro",
      title: "Opening ambience",
      track: "sound",
      start: 10,
      duration: 65,
      note: "Gentle fade into the opening.",
    },
    {
      id: "wash",
      title: "Warm stage wash",
      track: "lights",
      start: 15,
      duration: 35,
      note: "Review the intentional 5-second overlap.",
    },
    {
      id: "entrance",
      title: "First entrance",
      track: "stage",
      start: 35,
      duration: 20,
      note: "Walk through the entrance timing.",
    },
    {
      id: "shift",
      title: "Scene transition",
      track: "stage",
      start: 100,
      duration: 30,
      note: "Reset the fictional set.",
    },
    {
      id: "sting",
      title: "Transition accent",
      track: "sound",
      start: 105,
      duration: 12,
      note: "",
    },
  ],
};
let doc = clone(sample),
  analysis = null,
  id = null,
  revision = 0,
  selected = "house",
  undo = [],
  redo = [],
  dirty = true,
  busy = false,
  pending = false,
  running = false,
  elapsed = 0,
  anchor = 0;
const clock = (v) => {
  const s = Math.floor(v);
  return (
    (s >= 3600 ? String(Math.floor(s / 3600)).padStart(2, "0") + ":" : "") +
    String(Math.floor(s / 60) % 60).padStart(2, "0") +
    ":" +
    String(s % 60).padStart(2, "0")
  );
};
function message(text) {
  $("status").textContent = text;
  $("status").hidden = !text;
}
function fail(e) {
  $("error").textContent = e.message;
  $("error").hidden = false;
}
function controls() {
  document
    .querySelectorAll("button,input,select,textarea")
    .forEach((e) => (e.disabled = busy));
  $("undo").disabled = busy || !undo.length;
  $("redo").disabled = busy || !redo.length;
  $("pause").disabled = busy || !running;
  $("start").disabled = busy || running;
  for (const name of ["save", "json", "csv"])
    $(name).disabled = busy || !analysis;
  if (pending)
    document.querySelectorAll("button,input,select,textarea").forEach((e) => {
      if (!e.closest("#editor") || ["duplicate", "remove"].includes(e.id))
        e.disabled = true;
    });
}
async function api(path, data) {
  const response = await fetch(
    "/api/" + path,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "CueCanvas",
          },
          body: JSON.stringify(data),
        },
  );
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Operation failed.");
  return value;
}
async function task(text, fn) {
  if (busy) return;
  busy = true;
  controls();
  $("error").hidden = true;
  message(text);
  try {
    await fn();
  } catch (e) {
    fail(e);
    message("");
  } finally {
    busy = false;
    controls();
  }
}
function resetClock() {
  running = false;
  elapsed = 0;
  tick();
}
async function commit(next) {
  const checked = await api("analyze", next);
  undo.push(clone(doc));
  undo = undo.slice(-40);
  redo = [];
  doc = next;
  analysis = checked;
  dirty = true;
  resetClock();
  $("revision").textContent = "Unsaved show changes";
  render();
  message("Show updated. Timing overlaps remain visible for review.");
}
function svg(name, attrs = {}, text) {
  const node = document.createElementNS(ns, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}
function timeline() {
  if (!analysis) return;
  $("timeline").replaceChildren();
  const width = 1000 * Number($("zoom").value),
    height = doc.tracks.length * 70 + 55,
    span = Math.max(60, analysis.duration),
    drawing = svg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      class: `cue-timeline zoom-${$("zoom").value}`,
      role: "group",
      "aria-label": "Multi-track show timeline",
    });
  for (let i = 0; i < 6; i++) {
    const x = 150 + ((width - 180) * i) / 5;
    drawing.append(
      svg("line", { x1: x, x2: x, y1: 30, y2: height, stroke: "#e0dbe8" }),
    );
    drawing.append(
      svg(
        "text",
        { x, y: 18, "font-size": 11, fill: "#60566e" },
        clock((span * i) / 5),
      ),
    );
  }
  const colors = [
    "#c8b8e9",
    "#b9dce0",
    "#f3d2ac",
    "#edbdce",
    "#c9dfb6",
    "#d4d8f5",
    "#ead9a8",
    "#bdd7db",
  ];
  doc.tracks.forEach((track, i) => {
    drawing.append(
      svg(
        "text",
        { x: 10, y: i * 70 + 63, "font-size": 13, fill: "#302a3e" },
        track.name,
      ),
    );
    for (const cue of doc.cues.filter((c) => c.track === track.id)) {
      const x = 150 + (cue.start / span) * (width - 180),
        w = Math.max(6, (cue.duration / span) * (width - 180)),
        group = svg("g", {
          role: "button",
          tabindex: 0,
          "aria-label": `${cue.title}, starts ${clock(cue.start)}`,
        });
      group.append(
        svg("rect", {
          x,
          y: i * 70 + 36,
          width: w,
          height: 43,
          rx: 6,
          fill: colors[i],
          stroke: selected === cue.id ? "#49306f" : "#9e8fb7",
          "stroke-width": selected === cue.id ? 3 : 1,
        }),
      );
      if (w > 45)
        group.append(
          svg(
            "text",
            { x: x + 7, y: i * 70 + 62, "font-size": 11, fill: "#302a3e" },
            cue.title.slice(0, Math.max(3, Math.floor(w / 7) - 1)),
          ),
        );
      const choose = () => {
        if (pending) {
          message("Apply or discard cue changes before selecting another cue.");
          return;
        }
        selected = cue.id;
        renderEditor();
        timeline();
      };
      group.addEventListener("click", choose);
      group.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          choose();
          $("cue-title").focus();
        }
      });
      drawing.append(group);
    }
  });
  $("timeline").append(drawing);
}
function renderEditor() {
  pending = false;
  const cue = doc.cues.find((c) => c.id === selected);
  $("editor").hidden = !cue;
  $("editor-empty").hidden = !!cue;
  if (!cue) return;
  $("cue-title").value = cue.title;
  $("cue-start").value = cue.start;
  $("cue-duration").value = cue.duration;
  $("cue-note").value = cue.note;
  $("cue-track").replaceChildren();
  doc.tracks.forEach((t) => $("cue-track").add(new Option(t.name, t.id)));
  $("cue-track").value = cue.track;
}
function rundown() {
  if (!analysis) return;
  $("rundown").replaceChildren();
  for (const cue of analysis.ordered.filter(
    (c) => $("filter").value === "all" || c.track === $("filter").value,
  )) {
    const tr = document.createElement("tr");
    for (const value of [
      cue.title,
      doc.tracks.find((t) => t.id === cue.track).name,
      clock(cue.start),
      `${cue.duration}s`,
    ]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    const td = document.createElement("td"),
      button = document.createElement("button");
    button.textContent = "Edit";
    button.setAttribute("aria-label", `Edit ${cue.title}`);
    button.addEventListener("click", () => {
      if (pending) {
        message("Apply or discard cue changes before selecting another cue.");
        return;
      }
      selected = cue.id;
      renderEditor();
      timeline();
      $("cue-title").focus();
    });
    td.append(button);
    tr.append(td);
    $("rundown").append(tr);
  }
}
function render() {
  $("title").value = doc.title;
  $("tracks").replaceChildren();
  doc.tracks.forEach((t, index) => {
    const label = document.createElement("label");
    label.textContent = `Track ${index + 1}`;
    const input = document.createElement("input");
    input.value = t.name;
    input.maxLength = 120;
    input.addEventListener("change", () =>
      task("Updating track…", () => {
        const next = clone(doc);
        next.tracks[index].name = input.value;
        return commit(next);
      }),
    );
    label.append(input);
    $("tracks").append(label);
  });
  const filter = $("filter").value;
  $("filter").replaceChildren();
  $("filter").add(new Option("All tracks", "all"));
  doc.tracks.forEach((t) => $("filter").add(new Option(t.name, t.id)));
  $("filter").value = doc.tracks.some((t) => t.id === filter) ? filter : "all";
  $("cue-count").textContent = doc.cues.length;
  $("track-count").textContent = doc.tracks.length;
  $("duration").textContent = clock(analysis?.duration ?? 0);
  $("conflict-count").textContent = analysis?.conflicts.length ?? 0;
  $("conflicts").replaceChildren();
  for (const c of analysis?.conflicts ?? []) {
    const line = document.createElement("div");
    line.className = "notice";
    line.textContent = `${doc.cues.find((x) => x.id === c.first).title} ↔ ${doc.cues.find((x) => x.id === c.second).title}: ${c.seconds}s overlap on ${doc.tracks.find((t) => t.id === c.track).name}.`;
    $("conflicts").append(line);
  }
  if (!doc.cues.some((c) => c.id === selected))
    selected = doc.cues[0]?.id ?? null;
  renderEditor();
  timeline();
  rundown();
  tick();
  controls();
}
function tick() {
  const t = elapsed + (running ? (performance.now() - anchor) / 1000 : 0);
  $("clock").textContent = clock(t);
  $("mode").textContent = running ? "Running" : t > 0 ? "Paused" : "Stopped";
  const active =
      analysis?.ordered.filter(
        (c) => c.start <= t && c.start + c.duration > t,
      ) ?? [],
    next = analysis?.ordered.find((c) => c.start > t);
  $("next-cue").textContent = next
    ? `Next: ${next.title} · ${clock(next.start)}`
    : analysis && t >= analysis.duration
      ? "Rundown complete."
      : "Ready when you are.";
  $("active-cues").textContent = active.length
    ? "Active: " + active.map((c) => c.title).join(" · ")
    : "No cues active at this time.";
  if (running && analysis && t >= analysis.duration) {
    elapsed = analysis.duration;
    running = false;
    controls();
  }
}
async function library() {
  const records = await api("projects");
  $("library").replaceChildren();
  $("library").add(new Option("Select a saved show", ""));
  records.forEach((r) =>
    $("library").add(new Option(`${r.title} · v${r.revision}`, r.id)),
  );
  if (id) $("library").value = id;
}
function download(name, value, type) {
  const url = URL.createObjectURL(new Blob([value], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
for (const field of [
  "cue-title",
  "cue-start",
  "cue-duration",
  "cue-note",
  "cue-track",
])
  $(field).addEventListener("input", () => {
    pending = true;
    message("Cue changes are unapplied. Apply or discard them to continue.");
    controls();
  });
$("discard-cue").addEventListener("click", () => {
  renderEditor();
  controls();
  message("Unapplied cue edits discarded.");
});
$("apply").addEventListener("click", () =>
  task("Checking cue timing…", async () => {
    const next = clone(doc),
      cue = next.cues.find((c) => c.id === selected);
    Object.assign(cue, {
      title: $("cue-title").value,
      track: $("cue-track").value,
      start: Number($("cue-start").value),
      duration: Number($("cue-duration").value),
      note: $("cue-note").value,
    });
    await commit(next);
  }),
);
$("add-cue").addEventListener("click", () =>
  task("Adding cue…", async () => {
    const next = clone(doc),
      key = "cue-" + Date.now();
    next.cues.push({
      id: key,
      title: "New cue",
      track: doc.tracks[0].id,
      start: analysis?.duration ?? 0,
      duration: 10,
      note: "",
    });
    await commit(next);
    selected = key;
    renderEditor();
    timeline();
  }),
);
$("duplicate").addEventListener("click", () =>
  task("Duplicating cue…", async () => {
    const next = clone(doc),
      original = doc.cues.find((c) => c.id === selected),
      key = "cue-" + Date.now();
    next.cues.push({
      ...original,
      id: key,
      title: original.title.slice(0, 110) + " copy",
      start: original.start + original.duration,
    });
    await commit(next);
    selected = key;
    renderEditor();
    timeline();
  }),
);
$("remove").addEventListener("click", () =>
  task("Removing cue…", () =>
    commit({ ...doc, cues: doc.cues.filter((c) => c.id !== selected) }),
  ),
);
$("add-track").addEventListener("click", () =>
  task("Adding track…", () =>
    commit({
      ...doc,
      tracks: [...doc.tracks, { id: "track-" + Date.now(), name: "New track" }],
    }),
  ),
);
$("title").addEventListener("change", () =>
  task("Updating show name…", () =>
    commit({ ...doc, title: $("title").value }),
  ),
);
$("undo").addEventListener("click", () =>
  task("Undoing edit…", async () => {
    if (!undo.length) return;
    const next = undo.at(-1),
      checked = await api("analyze", next);
    undo.pop();
    redo.push(clone(doc));
    doc = next;
    analysis = checked;
    dirty = true;
    resetClock();
    render();
  }),
);
$("redo").addEventListener("click", () =>
  task("Redoing edit…", async () => {
    if (!redo.length) return;
    const next = redo.at(-1),
      checked = await api("analyze", next);
    redo.pop();
    undo.push(clone(doc));
    doc = next;
    analysis = checked;
    dirty = true;
    resetClock();
    render();
  }),
);
$("zoom").addEventListener("change", timeline);
$("filter").addEventListener("change", rundown);
$("start").addEventListener("click", () => {
  if (!analysis?.duration) return;
  anchor = performance.now();
  running = true;
  controls();
  tick();
});
$("pause").addEventListener("click", () => {
  if (running) elapsed += (performance.now() - anchor) / 1000;
  running = false;
  controls();
  tick();
});
$("reset").addEventListener("click", () => {
  resetClock();
  controls();
});
$("advance").addEventListener("click", () => {
  const t = elapsed + (running ? (performance.now() - anchor) / 1000 : 0),
    next = analysis?.ordered.find((c) => c.start > t);
  if (next) {
    elapsed = next.start;
    anchor = performance.now();
    tick();
  }
});
setInterval(tick, 100);
$("save").addEventListener("click", () =>
  task("Saving the show…", async () => {
    const record = await api("save", { id: id ?? "", revision, document: doc });
    id = record.id;
    revision = record.revision;
    dirty = false;
    $("revision").textContent = `Saved revision ${revision}`;
    await library();
    message("Show saved locally. Rehearsal timer state is not saved.");
  }),
);
$("open").addEventListener("click", () => {
  const key = $("library").value;
  if (!key) return;
  if (
    dirty &&
    !confirm("Discard unapplied or unsaved edits and open this show?")
  )
    return;
  task("Opening show…", async () => {
    const r = await api("projects/" + key);
    const a = await api("analyze", r.document);
    doc = r.document;
    analysis = a;
    id = r.id;
    revision = r.revision;
    dirty = false;
    undo = [];
    redo = [];
    resetClock();
    render();
    $("revision").textContent = `Saved revision ${revision}`;
    message("Saved show opened.");
  });
});
$("sample").addEventListener("click", () => {
  if (!confirm("Replace this show with a new fictional sample?")) return;
  task("Preparing sample…", async () => {
    doc = clone(sample);
    analysis = await api("analyze", doc);
    id = null;
    revision = 0;
    dirty = true;
    undo = [];
    redo = [];
    resetClock();
    render();
    $("revision").textContent = "Unsaved sample";
    message("Fictional sample ready.");
  });
});
$("json").addEventListener("click", () =>
  download(
    "cuecanvas-show.json",
    JSON.stringify(doc, null, 2) + "\n",
    "application/json",
  ),
);
$("csv").addEventListener("click", () =>
  task("Exporting rundown…", async () => {
    const result = await api("export", doc);
    download("cuecanvas-rundown.csv", result.csv, "text/csv");
    message("Rundown exported in start-time order.");
  }),
);
$("import").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (dirty && !confirm("Discard current changes and import this show?"))
    return;
  task("Validating imported show…", async () => {
    if (file.size > 256000) throw new Error("File limit is 256 KB.");
    const next = JSON.parse(await file.text()),
      checked = await api("analyze", next);
    doc = next;
    analysis = checked;
    id = null;
    revision = 0;
    dirty = true;
    undo = [];
    redo = [];
    resetClock();
    render();
    $("revision").textContent = "Imported · not saved";
    message("Show imported and validated.");
  });
});
task("Loading the rehearsal workspace…", async () => {
  analysis = await api("analyze", doc);
  render();
  await library();
  message("Sample show ready. One overlap is included for you to inspect.");
});
