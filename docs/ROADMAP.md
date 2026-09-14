# ScanYao Roadmap

ScanYao stays local-first and small. Large capabilities should be optional
rather than silently increasing every installation.

## v0.3.1

- Desktop canvas zooming: wheel or -/percent/+/fit controls (25–400%, remembered),
  cursor-centered zoom in enhance mode, and drag-to-pan in both editor modes

## v0.3.0

- In-app camera with live document-edge detection, multi-shot capture,
  optional stability auto-capture, and torch support
- Live scan preview badge while cropping: the perspective-corrected, filtered
  result renders while you drag the selection
- Full-screen preview with zoom, pan, page navigation, and press-to-compare
  against the original photo
- Crop interaction upgrade: corner and edge-midpoint handles, whole-quad
  dragging, magnifier on touch, and a rule-of-thirds grid
- Filter strip now renders real per-filter thumbnails of the current page
- ID card front/back composition template (A4 portrait)
- Optional diagonal watermark text and footer page numbers on export

## v0.2.2

- Fixed Windows WPF icon resource packaging so the desktop app starts reliably

## v0.2.1

- Fully scrollable source-composition controls on compact phone screens
- Zoomable and pannable composition canvas while preserving direct layer dragging

## v0.2.0

- Persistent local document sessions and undo/redo
- Multi-page reorder, duplicate, delete, and batch enhancement
- Four manual adjustments and 22 scene-oriented filters with per-filter strength
- Rotation, horizontal flip, and vertical flip
- Vertical long image, horizontal stitch, two-column grid, ZIP, and PDF export
- Import-time source composition studio with templates and direct dragging
- Adjustable 44–68% mobile preview with an independently scrolling tool pane

## Next

- Optional offline OCR language pack instead of bundling a large engine
- Book spread splitting and page-curvature correction
- Annotation, signature, and redaction tools
- Optional PDF compression, password protection, and searchable text layer
- Signed Windows installer and Android release build through GitHub Actions

Priorities are driven by real scanning workflows, predictable offline behavior,
and measurable package-size impact.
