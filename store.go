package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

var ErrConflict = errors.New("this show changed in another tab; reopen it before saving")

type Record struct {
	ID       string   `json:"id"`
	Revision int      `json:"revision"`
	Updated  string   `json:"updated"`
	Document Document `json:"document"`
}
type Store struct {
	mu      sync.Mutex
	path    string
	records map[string]Record
}

func OpenStore(path string) (*Store, error) {
	s := &Store{path: path, records: map[string]Record{}}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(data, &s.records); err != nil {
		return nil, err
	}
	if s.records == nil {
		return nil, errors.New("invalid library")
	}
	for key, r := range s.records {
		if key != r.ID || r.Revision < 1 {
			return nil, errors.New("invalid saved record")
		}
		if _, err = Analyze(r.Document); err != nil {
			return nil, err
		}
	}
	return s, nil
}
func (s *Store) List() []Record {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := []Record{}
	for _, r := range s.records {
		result = append(result, r)
	}
	return result
}
func (s *Store) Get(id string) (Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.records[id]
	if !ok {
		return r, errors.New("show not found")
	}
	return r, nil
}
func (s *Store) Save(r Record) (Record, error) {
	if _, err := Analyze(r.Document); err != nil {
		return r, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if r.ID == "" {
		if r.Revision != 0 {
			return r, errors.New("new shows start at revision zero")
		}
		if len(s.records) >= 100 {
			return r, errors.New("library limit is 100 shows")
		}
		key := make([]byte, 12)
		if _, err := rand.Read(key); err != nil {
			return r, err
		}
		r.ID = hex.EncodeToString(key)
	} else {
		old, ok := s.records[r.ID]
		if !ok || old.Revision != r.Revision {
			return r, ErrConflict
		}
	}
	r.Revision++
	r.Updated = time.Now().UTC().Format(time.RFC3339Nano)
	next := map[string]Record{}
	for id, old := range s.records {
		next[id] = old
	}
	next[r.ID] = r
	data, err := json.MarshalIndent(next, "", "  ")
	if err != nil {
		return r, err
	}
	if err = os.MkdirAll(filepath.Dir(s.path), 0700); err != nil {
		return r, err
	}
	file, err := os.CreateTemp(filepath.Dir(s.path), ".cuecanvas-*")
	if err != nil {
		return r, err
	}
	defer os.Remove(file.Name())
	if _, err = file.Write(data); err != nil {
		file.Close()
		return r, err
	}
	if err = file.Sync(); err != nil {
		file.Close()
		return r, err
	}
	if err = file.Close(); err != nil {
		return r, err
	}
	if err = os.Rename(file.Name(), s.path); err != nil {
		return r, err
	}
	s.records = next
	return r, nil
}
