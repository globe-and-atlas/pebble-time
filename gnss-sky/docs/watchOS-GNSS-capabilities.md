# watchOS GNSS capabilities

Phase 0 research for GNSS Sky: what the public watchOS SDK tells an app about satellite positioning. Everything else in the design follows from this.

**Method.** Symbols, declarations and platform availability were read from Apple's documentation data for the Core Location framework (`developer.apple.com/tutorials/data/documentation/corelocation/*.json`) on 2026-10-02. The complete Core Location symbol index was also searched for `satellite`, `GNSS`, `dilution`, `PRN`, `SVID`, `carrier` and `C/N0`. None of those terms appears once. Hardware statements come from Apple's published technical specifications, not from an API.

## 1. Available from public watchOS APIs

| Data | API | watchOS |
| --- | --- | --- |
| Latitude, longitude | `CLLocation.coordinate` | 2.0 |
| Altitude above mean sea level | `CLLocation.altitude` | 2.0 |
| Altitude above the WGS-84 ellipsoid | `CLLocation.ellipsoidalAltitude` | 8.0 |
| Horizontal accuracy (m, 68 % radius; negative means invalid) | `CLLocation.horizontalAccuracy` | 2.0 |
| Vertical accuracy (m) | `CLLocation.verticalAccuracy` | 2.0 |
| Course (degrees true) | `CLLocation.course` | 2.0 |
| Course accuracy | `CLLocation.courseAccuracy` | 6.2 |
| Speed (m/s) | `CLLocation.speed` | 2.0 |
| Speed accuracy | `CLLocation.speedAccuracy` | 3.0 |
| Fix time | `CLLocation.timestamp` | 2.0 |
| Floor level (where mapped) | `CLLocation.floor` | 2.0 |
| Fix simulated by software / produced by an external accessory | `CLLocation.sourceInformation` (`CLLocationSourceInformation.isSimulatedBySoftware`, `.isProducedByAccessory`) | 8.0 |
| Async stream of fixes | `CLLocationUpdate.liveUpdates(_:)` with a `LiveConfiguration` (`.default`, `.fitness`, `.otherNavigation`, …) | 10.0 |
| Device is stationary | `CLLocationUpdate.isStationary` | 10.0 |
| Why no fix is coming (`authorizationDenied`, `locationUnavailable`, `accuracyLimited`, …) | `CLLocationUpdate` properties | 11.0 |
| Keep a session alive in the background | `CLBackgroundActivitySession` | 10.0 |
| Authorization and diagnostics | `CLServiceSession` | 11.0 |
| Requested accuracy for the classic delegate API | `CLLocationManager.desiredAccuracy`, `distanceFilter` | 2.0 |
| Compass heading (on hardware that has one) | `CLLocationManager.startUpdatingHeading()`, `headingAvailable()` | 2.0 |

## 2. Not available through public APIs

| Data | Status |
| --- | --- |
| Constellation(s) used for a fix | Not exposed |
| Satellite PRN / SVID | Not exposed |
| Per-satellite azimuth and elevation | Not exposed |
| Carrier-to-noise density (C/N0) or any signal strength | Not exposed |
| Number of satellites in view or used in the fix | Not exposed |
| Raw GNSS measurements (pseudorange, carrier phase, Doppler) | Not exposed |
| DOP (GDOP, PDOP, HDOP, VDOP) | Not exposed |
| Whether the fix came from GNSS, Wi-Fi, cellular or the paired iPhone | Not exposed (`sourceInformation` reports only software simulation and external accessories) |
| Fix type (2D/3D, SBAS-corrected, dual-frequency) | Not exposed |

There is no watchOS equivalent of Android's `GnssStatus` / `GnssMeasurement`. **The app therefore cannot show which satellites the watch is tracking.** Every satellite it draws is an orbital prediction, and the interface says so.

## 3. Derivable mathematically

Given the observer position (section 1), UTC time and orbital elements (section 4):

- Each satellite's azimuth, elevation and range (SGP4/SDP4 propagation, then TEME → Earth-fixed → local east-north-up).
- Which satellites are above an elevation mask, and how many per constellation.
- Rise and set times, a pass timeline and predicted counts over time (future features).
- **Predicted** DOP from the geometry of the predicted-visible satellites. This describes the sky, not the watch's real solution, and must be labelled that way.
- Observer motion from successive fixes. Core Location already provides course and speed, so the app does not need to derive them.

The observer position barely matters to the result. Moving 10 km changes a GNSS satellite's look angle by about 0.03°. One decent fix is enough for many minutes, and the power strategy relies on this.

## 4. Requires external orbital data

- Orbital elements for every satellite: CelesTrak GP element sets (TLE format) for GPS, GLONASS, Galileo, BeiDou and QZSS (group `gnss`) and SBAS (group `sbas`). These are fitted for SGP4 and are accurate to a few kilometres near epoch, which is far below one pixel on the plot. Alternatives such as RINEX broadcast navigation files and the YUMA/SEM almanacs are more precise per system, but each comes in its own format. See `architecture.md`.
- PRN or slot identity. CelesTrak object names carry the PRN for GPS, Galileo, BeiDou and QZSS. **GLONASS names give Cosmos and GLONASS numbers, not orbital slots.** Mapping those to R01–R24 needs another source (for example the IAC GLONASS constellation status). Until then those satellites are labelled `R??` rather than given a guessed number.
- Satellite health and operational status. Element sets do not tell you whether a satellite is set unhealthy.

## 5. Standalone Apple Watch vs. paired iPhone

- **Hardware.** According to Apple's specifications, current Apple Watch models have a built-in GNSS receiver (GPS, GLONASS, Galileo, QZSS, BeiDou), and Apple Watch Ultra models add dual-frequency L1 + L5 GPS. Whether a given fix used L5, or which systems it used, is not reported (section 2).
- **Who computes the fix.** When the paired iPhone is nearby, watchOS may use the iPhone's location to save power. When the iPhone is away, the watch uses its own receiver and Wi-Fi. Cellular models can also use network assistance. **No public API reports which path produced a given fix.** The only honest quality indicator is `horizontalAccuracy`, so the app shows it.
- **Authorization** is the watch app's own: a watch-only app asks on the watch.
- **Network for orbital data.** `URLSession` works over the iPhone's connection, Wi-Fi or cellular. Once a catalog is cached, the app needs no network: plotting is fully offline.
- **External receivers.** `isProducedByAccessory` shows that iOS can accept fixes from MFi GNSS accessories. Even then, Core Location passes on only the position, not the accessory's satellite data. Satellite-level data from an external receiver would need that accessory's own protocol (future feature; `Provenance.receiverTracked` exists for it).

## Consequences for the design

1. The app is an orbital-prediction instrument: `PREDICTED` on every screen, never "tracked", and no signal-strength bars.
2. Core Location supplies one input, the observer position. Its accuracy is shown as a reading, not hidden.
3. All GNSS mathematics lives in a platform-neutral Swift package (`GNSSCore`) and is tested against reference implementations.
4. Orbital data is downloaded rarely, cached on the watch and used offline.
