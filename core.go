package main

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type Track struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
type Cue struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Track    string `json:"track"`
	Start    int    `json:"start"`
	Duration int    `json:"duration"`
	Note     string `json:"note"`
}
type Document struct {
	Version int     `json:"version"`
	Title   string  `json:"title"`
	Tracks  []Track `json:"tracks"`
	Cues    []Cue   `json:"cues"`
}
type Conflict struct {
	First   string `json:"first"`
	Second  string `json:"second"`
	Track   string `json:"track"`
	Seconds int    `json:"seconds"`
}
type Analysis struct {
	Duration    int            `json:"duration"`
	Ordered     []Cue          `json:"ordered"`
	Conflicts   []Conflict     `json:"conflicts"`
	TrackTotals map[string]int `json:"trackTotals"`
}

var identifier = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,60}$`)

func label(s string) bool { return strings.TrimSpace(s) != "" && len(s) <= 120 }
func Analyze(d Document) (Analysis, error) {
	a := Analysis{Ordered: append([]Cue{}, d.Cues...), Conflicts: []Conflict{}, TrackTotals: map[string]int{}}
	if d.Version != 1 || !label(d.Title) {
		return a, errors.New("use a version 1 show with a title of 1–120 characters")
	}
	if len(d.Tracks) < 1 || len(d.Tracks) > 8 || len(d.Cues) > 200 {
		return a, errors.New("use 1–8 tracks and at most 200 cues")
	}
	tracks := map[string]bool{}
	ids := map[string]bool{}
	for _, t := range d.Tracks {
		if !identifier.MatchString(t.ID) || tracks[t.ID] || !label(t.Name) {
			return a, errors.New("tracks need unique IDs and nonempty names")
		}
		tracks[t.ID] = true
		a.TrackTotals[t.ID] = 0
	}
	for _, c := range d.Cues {
		if !identifier.MatchString(c.ID) || ids[c.ID] || !label(c.Title) || !tracks[c.Track] {
			return a, errors.New("cues need unique IDs, a title, and an existing track")
		}
		if c.Start < 0 || c.Duration < 1 || c.Duration > 3600 || c.Start > 86400-c.Duration || len(c.Note) > 1000 {
			return a, fmt.Errorf("invalid timing or note for %s: use positive durations up to 3600 seconds within a 24-hour show", c.Title)
		}
		ids[c.ID] = true
		a.TrackTotals[c.Track] += c.Duration
		if end := c.Start + c.Duration; end > a.Duration {
			a.Duration = end
		}
	}
	sort.SliceStable(a.Ordered, func(i, j int) bool {
		if a.Ordered[i].Start == a.Ordered[j].Start {
			return a.Ordered[i].ID < a.Ordered[j].ID
		}
		return a.Ordered[i].Start < a.Ordered[j].Start
	})
	for i, c := range a.Ordered {
		for _, next := range a.Ordered[i+1:] {
			if next.Start >= c.Start+c.Duration {
				break
			}
			if c.Track == next.Track {
				overlap := min(c.Start+c.Duration, next.Start+next.Duration) - next.Start
				a.Conflicts = append(a.Conflicts, Conflict{c.ID, next.ID, c.Track, overlap})
			}
		}
	}
	return a, nil
}
func safeCell(value string) string {
	trim := strings.TrimLeft(value, " \t\r\n")
	if trim != "" && strings.ContainsAny(trim[:1], "=+-@") {
		return "'" + value
	}
	return value
}
func Export(d Document) (string, error) {
	a, err := Analyze(d)
	if err != nil {
		return "", err
	}
	var out bytes.Buffer
	writer := csv.NewWriter(&out)
	_ = writer.Write([]string{"cue", "track", "start_seconds", "duration_seconds", "note"})
	names := map[string]string{}
	for _, t := range d.Tracks {
		names[t.ID] = t.Name
	}
	for _, c := range a.Ordered {
		_ = writer.Write([]string{safeCell(c.Title), safeCell(names[c.Track]), strconv.Itoa(c.Start), strconv.Itoa(c.Duration), safeCell(c.Note)})
	}
	writer.Flush()
	return out.String(), writer.Error()
}
