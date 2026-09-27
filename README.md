# Mobile OS Museum

**English** · [简体中文](./README.zh-CN.md)

> Boot classic phones in your browser — pixel-accurately relive the mobile operating systems from 1992 to 2011.

A **pure-frontend classic phone emulator**: from the 1995 brick phone to the 2011 Windows Phone,
every exhibit truly boots and operates — monochrome screens, physical keypads, T9 pinyin,
Snake, auto-replying SMS, and a battery that slowly drains in real time.
No install, no backend; all data lives in your own browser.

## Exhibits

Eight phones tracing nearly two decades of mobile evolution (the gallery is ordered by era):

| Year | Exhibit | OS / Form | Screen |
| --- | --- | --- | --- |
| 1992 | Motorola 3200 (brick) | Custom minimal OS · external antenna | 72×48 yellow-green backlight |
| 2000 | Nokia 3310 | Feature phone · candybar | 84×48 monochrome |
| 2003 | Nokia 1100 | Feature phone · candybar (built-in flashlight) | 96×65 green backlight |
| 2006 | Nokia N73 | Symbian S60 · smart candybar | 240×320 color TFT |
| 2007 | Apple iPhone 2G | iPhone OS 1.0 · full touch (single Home key) | 320×480 Multi-Touch |
| 2008 | HTC Dream (T-Mobile G1) | Android 1.0 · side-sliding QWERTY | 320×480 touch |
| 2008 | BlackBerry Bold 9000 | BlackBerry OS 4.6 · trackball + full QWERTY | 480×320 half-VGA |
| 2011 | Nokia Lumia 800 | Windows Phone 7.5 (Mango) · full touch | 480×800 AMOLED |

## What you can do

- **Power on / off**: every phone reproduces its own boot screen and startup tone
  (Nokia tune on the N73 / 3310, the ANDROID glow on the G1, the Windows four-quad flag on the Lumia…).
- **Make calls**: dial directly with the number keys and hear the ringback tone, or call a contact from the phonebook.
- **Send & receive SMS**: type with T9 pinyin or the on-screen keyboard; messages to "Mom" get an auto-reply.
  You can also schedule "incoming call / SMS in a few minutes" via the scenario editor.
- **Play Snake**: from monochrome Nokia to color S60 — on the 1100 it's the wall-passing Snake II.
- **Explore each OS**: slide-to-unlock and Springboard on the iPhone 2G, the pull-down notification shade and
  17 stock apps on the G1, the trackball and BBM on the BlackBerry, Metro tiles and one-tap recolor on the Lumia,
  plus the 1100's flashlight, calculator, ringtone composer, camera and more.
- **Watch the battery**: battery drains in real time and is persisted — close the tab and it keeps slowly discharging.

## Tech

- **React 18 + TypeScript + Vite**: React for the shell; every phone screen is drawn pixel-by-pixel onto a `<canvas>`.
- **Virtual hardware layer**: screen pixel buffers (monochrome 1bit / palette color), a unified input bus
  (keyboard, keys, touch, gestures), WebAudio-synthesized sound, IndexedDB persistence, a frame loop and a simulated battery.
- **Code splitting**: each phone OS is its own chunk, lazy-loaded only when you open the exhibit.
- **Visual-free end-to-end tests**: 13 suites under `e2e/` driven by headless Chromium + CDP, verifying behavior
  via canvas pixel counts, direct IndexedDB reads and geometric assertions — no screenshot diffing.

## Run locally

```bash
npm install
npm run dev        # local development
npm run build      # type-check and build into dist/
npm run preview    # preview the production build locally
npm run test:e2e   # build + preview + run all end-to-end tests
```

## Data & privacy

All data (contacts, messages, settings, battery, etc.) is stored only in your browser's local IndexedDB
and never uploaded to any server. Clear your browser data or use the in-device "factory reset" to wipe it.

## Disclaimer

This project has no affiliation, endorsement, or authorization with any phone manufacturer or trademark holder
mentioned herein. All brand names, trademarks and product likenesses belong to their respective owners and are
used here solely for identification and historical restoration of legacy devices. If any rights holder believes
content is inappropriate, please contact the author and we will address it promptly.

## License

[MIT](./LICENSE) © 2026 Yansong Li (secnotes)
