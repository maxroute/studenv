# Studenv apps

Every app opens the live site, https://studenv-online.vercel.app. All of them
need the internet and a Studenv account. Website updates reach the apps without
a new install.

| Platform | What it is | Where it is built |
|---|---|---|
| Mac | Electron app in `desktop/`, as a `.dmg` | `npm run package:mac` in `desktop/`, or the **Build apps** workflow |
| Windows | The same app, as a setup `.exe` | **Build apps** workflow |
| Android | `.apk` in `android/` that uses the phone's Chrome | **Build apps** workflow |
| iPhone, iPad | Installed from the browser; no app file | The website itself |

## Install guide (for users)

Download links go here once a release is published. None is published yet.

### Android
1. Download `Studenv-…-android-release.apk` on the phone and open it.
2. If asked, allow your browser or file app to install apps, then tap **Install**.
3. If Play Protect warns about an unknown developer, choose **More details → Install anyway**.

You need an up-to-date Chrome. Alternative with no `.apk`: open the site in
Chrome, then **⋮ → Add to Home screen → Install**.

### iPhone and iPad
1. Open https://studenv-online.vercel.app in **Safari**.
2. Tap the menu or **Share** button, then **Share → View More → Add to Home Screen**.
3. Keep **Open as Web App** on, then tap **Add**.
4. Open Studenv from the Home Screen and sign in.

Another browser works if its Share menu has **Add to Home Screen**.

### Mac
1. Download the `.dmg`: **arm64** for Apple chips (M1 and later), **x64** for Intel.
2. Open it and drag **Studenv** onto **Applications**.
3. Open Studenv. macOS says it can't check the app. Close that message.
4. Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway**.

This is needed once per installed version. macOS 13 or later.

### Windows
1. Download and run `Studenv-…-windows-setup.exe`.
2. If you see **Windows protected your PC**, click **More info → Run anyway**.

Some PCs with Smart App Control block unsigned apps completely.

## What costs money
| Removes or enables | Needs |
|---|---|
| Mac first-launch warning | Apple Developer Program, yearly (about US$99) |
| An iPhone app file, TestFlight or App Store | The same. Apple may reject a plain website wrapper |
| Windows warnings | A paid code-signing certificate or service |
| Google Play listing | One-time developer fee (about US$25) and Google's testing rules |

Google is also introducing developer verification for apps installed outside the
Play Store, starting in a few countries and expanding in 2027. Check the current
rules before relying on the `.apk`.

## For the maintainer

### Order of work for a release
1. Make the Android release key (once, below).
2. Add `public/.well-known/assetlinks.json` with the key's fingerprint.
3. Deploy the website changes. Until then the live site has no install files.
4. Run **Build apps**, test the files, then attach them to a GitHub Release.

### Android release key
Android accepts an update only if it is signed with the same key as the installed
app. If the key is lost, users must uninstall and reinstall. If it leaks, someone
else can sign an update. Keep it **outside the repository** (it is public), and
back up the file and its password in two private places.

It can be made with the `openssl` that comes with macOS (a PKCS12 file whose
entry is named `studenv`); Java is not needed. The build reads two repository
secrets: `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD`. Without them
it makes a **test** `.apk` with a throwaway key.

`assetlinks.json` ties the website to that key. Without it, or with a test
`.apk`, Chrome shows an address bar:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "online.studenv.app",
    "sha256_cert_fingerprints": ["<SHA-256 fingerprint of the release certificate>"]
  }
}]
```

### New versions
Raise `version` in `desktop/package.json`, and `versionCode` and `versionName` in
`android/app/build.gradle` (the workflow's Android file name too). The desktop
apps don't update themselves; users install the new file. `online.studenv.app` is
the app's permanent identity: don't change it after release.

### Icons
There is one logo: the black mark on Studenv yellow, as in the website's header
(`public/branding/logo-variant1.png`). All icons, splash images and the browser
favicon are drawn from a tracing of it by `desktop/scripts/make-icons.js`
(`npm run icons` in `desktop/`). Platforms that cut their own icon shape get a
yellow tile; elsewhere it is the round badge. The bare yellow mark
(`logo-variant2.png`) is for dark backgrounds only; no page in use shows it.

## Test record (28 November 2026)

### Checked
- **Mac, Apple chip** (installed from the `.dmg`): opens the live sign-in page;
  Studenv name in the window, menu bar and About box, with the logo; signature is
  internally valid.
- **Mac, against a local test page**: save dialog for downloads (name and
  Downloads folder), file picker, offline screen and Try again, no way back to
  the offline screen, a cookie surviving quit and reopen.
- **Offline worker** (production build, in the Mac app): stores only
  `offline.html`; shows it when the server is gone.
- **iPhone simulator, iOS 27.2** (production build): Add to Home Screen shows the
  name and logo; opens full screen at the sign-in page; keyboard keeps the
  focused field visible; offline screen.
- Production build, type check, lint (warnings only, no errors) and the test suites.

The Mac, iPhone and offline checks above were made with the earlier black icon.
After the change to the yellow logo, checked: all icons compared side by side
with the website logo; the Mac app rebuilt and signed; it opens the live sign-in
page; its offline screen at start-up shows the yellow badge. Not re-checked:
the About box, Dock, and iPhone Home Screen with the new icon.

Fixed after the change: opening the Mac app without a connection could leave a
black window. The offline screen now waits for the failed load to stop
(compared once with and once without the fix, by the app's own screen capture).

The opening intro plays on the home page and in the signed-in app. The apps
open at sign-in when signed out, so `components/intro/installed-app-intro.tsx`
plays it there too, in installed apps only. It needs the website changes to be
deployed. Checked on a production build: it appears and clears in the Mac app,
and a browser tab doesn't show it. Not checked: iPhone, Android, Windows, and
the signed-in intro inside any app.

### Seen
- The iPhone launch screen was plain black in the simulator: the logo splash did
  not appear.
- iPhone zooms in when a sign-in field is tapped, because the website's text in
  that field is under 16px. This is the website's behaviour, also in Safari.

### Not tested
- **Android and Windows: nothing has run yet.** They have never been built; the
  first workflow run is their first build.
- **Intel Mac** build and launch.
- **Anything signed in**, on every platform: signing in and staying signed in,
  real uploads and downloads, PDF viewing, Rangan Talk, study groups, the
  workspace canvas, the new delete-account dialog, the focus timer window.
- **Microphone and camera** permission and recording.
- **Touch and pen** on the canvas; trackpad pinch and swipe-back in the Mac app.
- Android Back button, keyboard, safe areas, splash and links from email.
- External links opening the default browser (the blocking rule has unit tests).
- Right-click menu, spelling suggestions, notifications, screen sharing,
  remembered window size.
- Gatekeeper's **Open Anyway** steps on a downloaded copy.
- A real iPhone or iPad, and non-Safari iPhone browsers.

### Known limits
- Live Study Room features use Socket.IO, which the current hosting doesn't
  provide. The apps don't change that.
- Screen sharing in the desktop app works only where the system has its own
  picker (macOS 15 or later); it is off on Windows.
- `desktop/offline.*` and `.github/workflows/build-desktop.yml` are no longer
  used; remove them when convenient.
