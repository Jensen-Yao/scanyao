# Architecture

ScanYao keeps one small TypeScript application at the center and adds thin
native shells for Windows and Android.

```text
src/core/geometry.ts      four-point projective mapping
src/core/imageEngine.ts   edge suggestion, warp, filters, JPEG rendering
src/core/pdf.ts           dependency-free multi-page PDF writer
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
5. Apply the selected filter: original, clean, enhance, grayscale, or black and
   white.
6. Encode the page as JPEG or combine pages into a PDF.

The pipeline does not upload photos or require a network service.

## Windows runtime policy

The default Windows package is framework-dependent to stay small. The included
`Start-ScanYao.ps1` checks for .NET 8 Desktop Runtime and opens Microsoft's
official download page after user confirmation when it is missing. The app also
detects a missing WebView2 Runtime and presents the same opt-in flow.

Use `scripts/build-windows.ps1 -SelfContained` when a larger package with the
.NET runtime included is preferable.
