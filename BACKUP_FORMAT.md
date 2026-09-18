# Pantry Book backup format

Pantry Book exports UTF-8 JSON with this top-level shape:

```json
{
  "format": "pantry-book-backup",
  "version": 2,
  "exportedAt": "2026-09-17T12:00:00.000Z",
  "recipes": []
}
```

`recipes` contains complete recipe objects as stored in IndexedDB, including dish types, meal types, tags, and favorite status. Version 2 imports replace the local recipe collection only after the whole file and every recipe have passed validation. Older backup versions are intentionally rejected during this early development phase.
