# Pantry Book backup format

Pantry Book exports UTF-8 JSON with this top-level shape:

```json
{
  "format": "pantry-book-backup",
  "version": 3,
  "exportedAt": "2026-09-17T12:00:00.000Z",
  "recipes": []
}
```

`recipes` contains complete recipe objects as stored in IndexedDB, including dish types, meal types, tags, favorite status, and an optional compressed JPEG `photoDataUrl`. Version 3 imports replace the local recipe collection only after the whole file and every recipe have passed validation. Version 2 backups remain supported and restore recipes without photos. Older backup versions are rejected.
