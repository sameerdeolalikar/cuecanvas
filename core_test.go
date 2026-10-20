package main

import (
	"encoding/csv"
	"errors"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func fixture() Document {
	return Document{Version: 1, Title: "Fictional rehearsal", Tracks: []Track{{"light", "Lighting"}, {"sound", "Sound"}}, Cues: []Cue{{"a", "Opening", "light", 0, 20, ""}, {"b", "Transition", "light", 15, 10, ""}, {"c", "Ambience", "sound", 10, 40, ""}}}
}
func TestOverlapIsTrackSpecific(t *testing.T) {
	a, err := Analyze(fixture())
	if err != nil || len(a.Conflicts) != 1 || a.Conflicts[0].Seconds != 5 {
		t.Fatalf("unexpected analysis: %+v %v", a, err)
	}
	if a.Duration != 50 {
		t.Fatal(a.Duration)
	}
}
func TestAdjacentCuesDoNotOverlap(t *testing.T) {
	d := fixture()
	d.Cues[1].Start = 20
	a, err := Analyze(d)
	if err != nil || len(a.Conflicts) != 0 {
		t.Fatal(a, err)
	}
}
func TestNestedOverlapUsesIntersection(t *testing.T) {
	d := fixture()
	d.Cues[0].Duration = 100
	d.Cues[1].Duration = 10
	a, _ := Analyze(d)
	if a.Conflicts[0].Seconds != 10 {
		t.Fatal(a.Conflicts)
	}
}
func TestInvalidTimingAndReferences(t *testing.T) {
	for _, mutate := range []func(*Document){func(d *Document) { d.Cues[0].Start = -1 }, func(d *Document) { d.Cues[0].Duration = 0 }, func(d *Document) { d.Cues[0].Start = 86400 }, func(d *Document) { d.Cues[0].Track = "missing" }, func(d *Document) { d.Cues[1].ID = "a" }, func(d *Document) { d.Tracks[1].ID = "light" }} {
		d := fixture()
		mutate(&d)
		if _, err := Analyze(d); err == nil {
			t.Fatal("invalid show accepted")
		}
	}
}
func TestStableChronologicalOrder(t *testing.T) {
	d := fixture()
	d.Cues[0], d.Cues[2] = d.Cues[2], d.Cues[0]
	a, _ := Analyze(d)
	if a.Ordered[0].ID != "a" || a.Ordered[1].ID != "c" {
		t.Fatal(a.Ordered)
	}
}
func TestCSVQuotesAndFormulaProtection(t *testing.T) {
	d := fixture()
	d.Cues[0].Title = "=SUM(1,2)"
	d.Cues[0].Note = "line one\nline two"
	text, err := Export(d)
	if err != nil {
		t.Fatal(err)
	}
	rows, err := csv.NewReader(strings.NewReader(text)).ReadAll()
	if err != nil || rows[1][0] != "'=SUM(1,2)" || rows[1][4] != d.Cues[0].Note {
		t.Fatal(rows, err)
	}
}
func TestEmptyShow(t *testing.T) {
	d := fixture()
	d.Cues = []Cue{}
	a, err := Analyze(d)
	if err != nil || a.Duration != 0 || len(a.Ordered) != 0 {
		t.Fatal(a, err)
	}
}
func TestStoreRoundTripAndConflict(t *testing.T) {
	path := filepath.Join(t.TempDir(), "shows.json")
	s, err := OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	r, err := s.Save(Record{Document: fixture()})
	if err != nil {
		t.Fatal(err)
	}
	reopened, _ := OpenStore(path)
	loaded, _ := reopened.Get(r.ID)
	if loaded.Document.Title != r.Document.Title {
		t.Fatal(loaded)
	}
	updated, err := s.Save(r)
	if err != nil || updated.Revision != 2 {
		t.Fatal(updated, err)
	}
	if _, err = s.Save(r); !errors.Is(err, ErrConflict) {
		t.Fatal("missing conflict", err)
	}
}
func TestFailedValidationDoesNotSave(t *testing.T) {
	s, _ := OpenStore(filepath.Join(t.TempDir(), "shows.json"))
	r, _ := s.Save(Record{Document: fixture()})
	r.Document.Title = ""
	if _, err := s.Save(r); err == nil {
		t.Fatal("bad save accepted")
	}
	loaded, _ := s.Get(r.ID)
	if loaded.Document.Title == "" || loaded.Revision != 1 {
		t.Fatal(loaded)
	}
}
func TestHTTPBoundaryAndMalformedJSON(t *testing.T) {
	s, _ := OpenStore(filepath.Join(t.TempDir(), "shows.json"))
	h := handler(s, "127.0.0.1:7422")
	for _, tc := range []struct {
		origin string
		body   string
		status int
	}{{"", "{}", 403}, {"http://127.0.0.1:7422", "{} {}", 400}, {"http://127.0.0.1:7422", "{", 400}} {
		r := httptest.NewRequest("POST", "http://127.0.0.1:7422/api/analyze", strings.NewReader(tc.body))
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("X-Requested-With", "CueCanvas")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatal(w.Code, w.Body.String())
		}
	}
}
