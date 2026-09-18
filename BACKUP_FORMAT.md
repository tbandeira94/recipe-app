# Pantry Book archive format

Pantry Book exports a standard, uncompressed ZIP file with the extension `.pantrybook`. JPEGs are stored without further compression so the archive can be assembled from browser `Blob`s without building a Base64 copy of the library.

Every archive contains `manifest.json`:

```json
{
  "format": "pantry-book-archive",
  "version": 1,
  "exportedAt": "2026-09-18T12:00:00.000Z",
  "recipes": [],
  "photos": [
    {
      "recipeId": "example-id",
      "full": "photos/000001-full.jpg",
      "thumbnail": "photos/000001-thumbnail.jpg"
    }
  ]
}
```

`recipes` contains the photo-free records stored in IndexedDB. A recipe with `hasPhoto: true` must have exactly one corresponding item in `photos`; recipes without photos must not have one. Each photo mapping points to a 1200px JPEG and a 256px thumbnail.

Restore accepts only format version 1. It rejects duplicate IDs, unexpected or missing entries, non-canonical image paths, unsupported ZIP features, and CRC failures before replacing the local collection in one IndexedDB transaction.
