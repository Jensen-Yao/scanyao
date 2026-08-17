# Privacy

ScanYao is local-first.

- Imported photos are decoded and processed on the current device.
- The app has no analytics, account system, ad SDK, or upload endpoint.
- Android exports are written to the app cache and handed to the system share
  sheet only after the user chooses an export action.
- The browser and Windows versions create local object URLs and download the
  generated file directly.
- To restore unfinished work, source images and edit settings are stored in the
  current app/browser profile's IndexedDB database. They never leave the
  device. Choosing "清空文档" removes the active saved document.

The GitHub Pages build is a static copy of the same client application. Loading
the page downloads HTML, CSS, JavaScript, and brand assets from GitHub Pages;
document images are not sent back to GitHub.
