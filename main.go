package main

import (
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"
)

//go:embed web/*
var assets embed.FS

func decode(w http.ResponseWriter, r *http.Request, value any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 256000)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(value); err != nil {
		return err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return errors.New("expected exactly one JSON value")
	}
	return nil
}
func handler(store *Store, host string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
		send := func(status int, value any) {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(value)
		}
		fail := func(err error) {
			status := 400
			if errors.Is(err, ErrConflict) {
				status = 409
			}
			send(status, map[string]string{"error": err.Error()})
		}
		if r.Host != host {
			send(403, map[string]string{"error": "use the printed loopback URL"})
			return
		}
		if r.Method == http.MethodGet {
			paths := map[string]string{"/": "web/index.html", "/app.js": "web/app.js", "/style.css": "web/style.css"}
			if file, ok := paths[r.URL.Path]; ok {
				data, err := assets.ReadFile(file)
				if err != nil {
					fail(err)
					return
				}
				kind := "text/html"
				if strings.HasSuffix(file, ".js") {
					kind = "text/javascript"
				}
				if strings.HasSuffix(file, ".css") {
					kind = "text/css"
				}
				w.Header().Set("Content-Type", kind+"; charset=utf-8")
				_, _ = w.Write(data)
				return
			}
			if r.URL.Path == "/api/projects" {
				records := store.List()
				sort.Slice(records, func(i, j int) bool { return records[i].Updated > records[j].Updated })
				items := []map[string]any{}
				for _, item := range records {
					items = append(items, map[string]any{"id": item.ID, "title": item.Document.Title, "revision": item.Revision})
				}
				send(200, items)
				return
			}
			if strings.HasPrefix(r.URL.Path, "/api/projects/") {
				record, err := store.Get(strings.TrimPrefix(r.URL.Path, "/api/projects/"))
				if err != nil {
					fail(err)
					return
				}
				send(200, record)
				return
			}
			send(404, map[string]string{"error": "not found"})
			return
		}
		if r.Method != http.MethodPost || r.Header.Get("Origin") != "http://"+host || r.Header.Get("X-Requested-With") != "CueCanvas" {
			send(403, map[string]string{"error": "request must come from the local workspace"})
			return
		}
		if r.URL.Path == "/api/save" {
			var record Record
			if err := decode(w, r, &record); err != nil {
				fail(err)
				return
			}
			saved, err := store.Save(record)
			if err != nil {
				fail(err)
				return
			}
			send(200, saved)
			return
		}
		var doc Document
		if err := decode(w, r, &doc); err != nil {
			fail(err)
			return
		}
		if r.URL.Path == "/api/analyze" {
			analysis, err := Analyze(doc)
			if err != nil {
				fail(err)
				return
			}
			send(200, analysis)
			return
		}
		if r.URL.Path == "/api/export" {
			text, err := Export(doc)
			if err != nil {
				fail(err)
				return
			}
			send(200, map[string]string{"csv": text})
			return
		}
		send(404, map[string]string{"error": "unknown operation"})
	})
}
func main() {
	data := flag.String("data", ".local-data/shows.json", "local library file")
	port := flag.Int("port", 7422, "loopback port")
	flag.Parse()
	store, err := OpenStore(*data)
	if err != nil {
		log.Fatal(err)
	}
	host := fmt.Sprintf("127.0.0.1:%d", *port)
	fmt.Printf("CueCanvas: http://%s\n", host)
	server := &http.Server{Addr: host, Handler: handler(store, host), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 30 * time.Second}
	log.Fatal(server.ListenAndServe())
}
