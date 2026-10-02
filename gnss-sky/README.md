# GNSS Sky

A native Apple Watch sky plot of the navigation satellites (GPS, GLONASS, Galileo, BeiDou, QZSS, SBAS) predicted to be above you, drawn like a GNSS field instrument.

It is an **orbital-prediction viewer**. watchOS does not tell apps which satellites its receiver is tracking ([research](docs/watchOS-GNSS-capabilities.md)), so every marker is computed from orbital elements and labelled *Predicted*.

- [docs/watchOS-GNSS-capabilities.md](docs/watchOS-GNSS-capabilities.md): what watchOS exposes, and what it does not
- [docs/architecture.md](docs/architecture.md): layers, calculation chain, verification, orbital data, power strategy, interface

## Layout

```
GNSSCore/             Swift package: all GNSS mathematics, Foundation only
  Sources/GNSSCore/   TLE parsing, SGP4/SDP4, geodesy, engines, projection, ephemeris cache
  Tests/              Vallado verification set, Skyfield cross-checks, unit tests
GNSSSky/              watchOS app (SwiftUI, Core Location)
GNSSSky.xcodeproj     watch-only app target, watchOS 10+, links GNSSCore
docs/
```

## Build and run

Requires Xcode 16 or later.

1. Open `GNSSSky.xcodeproj`, choose the **GNSSSky** scheme and an Apple Watch simulator.
2. Set your team under Signing & Capabilities if you are running on a device.
3. Run. The app downloads orbital data on first launch (network needed once), asks for location, and then works offline.
4. In the simulator, set a location with Features → Location.

Previews in `GNSSSky/PreviewData.swift` show the plot with a fixed mock sky. Use them to check the layout on 41, 45 and 49 mm devices without a fix or network.

**If the project does not open.** The project file was written by hand, without Xcode. If it fails to open, create a new watchOS → App (watch-only) project named GNSSSky, delete its template Swift files, drag in the `GNSSSky/` folder, add `GNSSCore` with File → Add Package Dependencies → Add Local, and add `NSLocationWhenInUseUsageDescription` to the target's Info.

## Test

```sh
cd GNSSCore && swift test
```

The tests run on macOS or Linux. They cover the full SGP4 verification set (all points within 1 cm), look angles against Skyfield (within 0.005°), parsing, identification, visibility, projection orientation and caching.

## Status

| | |
| --- | --- |
| Phase 0 API research | Done: [capabilities](docs/watchOS-GNSS-capabilities.md) |
| GNSSCore (orbits, geometry, data) | Done; 14 tests pass with Swift 5.10 on Linux |
| Watch app (location, plot, detail, refresh policy) | Written; **not yet compiled or run in Xcode or a simulator** |
| Simulator checks on 41/45/49 mm | To do in Xcode. The layout was checked with a geometry mock ([image](docs/skyplot-layout-mock.png)) |

Next step: build in Xcode, fix any compiler errors in the app layer, and compare the plot against a reference such as a GNSS planning tool for the same place and time.
