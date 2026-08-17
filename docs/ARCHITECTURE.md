# Architecture

ScanYao keeps one small TypeScript application at the center and adds thin
native shells for Windows and Android.

```text
src/core/geometry.ts      four-point projective mapping
src/core/imageEngine.ts   edge suggestion, warp, filters, JPEG rendering
src/core/compositor.ts    template and freeform pre/post-processing composition
src/core/pdf.ts           dependency-free multi-page PDF writer
src/core/zip.ts           dependency-free stored ZIP writer
src/core/session.ts       IndexedDB document persistence
src/core/platform.ts      browser download / Android share bridge
src/app.tsx               responsive editor and multi-page workflow
android/                  Capacitor Android shell
windows/                  .NET 8 WPF + WebView2 shell
```

## Image pipeline

1. Decode the source photo locally.
2. Suggest four document corners with a downscaled Sobel edge pass.
3. Let the user drag each corner in normalized image coordinates.
4. Map the output rectangle into the selected quadrilateral with a projective
   transform and bilinear sampling.
5. Apply one of 22 scene-oriented presets, including automatic selection,
   local background normalization, text, book, newspaper, handwriting,
   receipt, invoice, ID, certificate, stamp, blueprint, screen, grayscale,
   and black and white modes. Each preset keeps its own strength value.
6. Apply brightness, contrast, sharpening, threshold, rotation, and flips.
7. Encode the page as JPEG, combine pages into a long/grid image, package JPEG
   pages as ZIP, or write a PDF.

Before step 1, the optional source composition studio can arrange multiple raw
photos on a normalized canvas. Preset placement and direct dragging share the
same coordinates used by the final JPEG compositor, so the generated source
matches the interactive preview.

The pipeline does not upload photos or require a network service.

## Document state

The editor keeps immutable page records so edits can be undone and redone.
Source `File` objects and page settings are debounced into IndexedDB, allowing
an unfinished local document to be restored after a refresh or app restart.
Object URLs are recreated only on the current device. A lightweight activity
log exposes recent operation names and timestamps alongside undo, redo, and
current-page reset controls.

## Windows runtime policy

The default Windows package is framework-dependent to stay small. The included
`Start-ScanYao.ps1` checks for .NET 8 Desktop Runtime and opens Microsoft's
official download page after user confirmation when it is missing. The app also
detects a missing WebView2 Runtime and presents the same opt-in flow.

Use `scripts/build-windows.ps1 -SelfContained` when a larger package with the
.NET runtime included is preferable.
