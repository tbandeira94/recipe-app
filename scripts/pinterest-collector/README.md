# Pinterest URL Collector

This is a small unpacked Chrome extension for collecting a board's outbound pin destinations. It uses the Pinterest session already open in the browser, records progress after every pin, and **does not run Pantry Book's recipe importer**.

## Load it

1. In Chrome, open `chrome://extensions` and enable Developer mode.
2. Select **Load unpacked** and choose `scripts/pinterest-collector/extension` from this repository.
3. Open the Pinterest board, click **Pantry Book Pinterest URL Collector**, enter `25` for a test (or leave it blank for a full board), and select **Collect / resume**.
4. Once it finishes, select **Download URL list**. The file is `pinterest-recipe-urls.txt`, with one URL per line.

The extension opens each pin in an inactive temporary tab, reads its non-Pinterest destination link after the page hydrates, then closes that temporary tab. It keeps the following categories in its saved extension state:

- `urls`: unique outbound URLs, including recipe sites and social/video links.
- `noDestination`: pins that did not expose an outbound link.
- `errors`: pins that could not be resolved; use **Collect / resume** to retry after a pause.

Pinterest can throttle rapid browsing. The collector deliberately pauses between pins and can be resumed without losing already collected URLs.

## Import later

This collector never imports anything. When you are ready, pass its downloaded file to the existing importer:

```powershell
pnpm recipe:import -- batch pinterest-recipe-urls.txt --out recipe-import-output
```

The importer will reject non-recipe destinations (for example social-media links) in its normal review report.
