#if DEBUG
import CoreLocation
import SwiftUI
import GNSSCore

/// Mock sky for layout work in Xcode previews (phase 7 of the plan): fixed azimuths and
/// elevations chosen to exercise crowding, the east-edge label flip and the mask band.
/// Never reachable from the running app.
enum PreviewData {
    static let observer = Observer(latitudeDegrees: 51.4779, longitudeDegrees: -0.0015, ellipsoidalHeightMeters: 46)

    static let fix = ObserverFix(CLLocation(
        coordinate: CLLocationCoordinate2D(latitude: observer.latitudeDegrees, longitude: observer.longitudeDegrees),
        altitude: 0, horizontalAccuracy: 8, verticalAccuracy: 12, timestamp: Date()))

    static let catalog = OrbitalCatalog(retrievedAt: Date().addingTimeInterval(-6 * 3600), source: "preview", records: [])

    static let positions: [SkyPosition] = {
        let rows: [(Constellation, Int?, Double, Double)] = [
            (.gps, 2, 41, 64), (.gps, 5, 118, 22), (.gps, 12, 205, 47), (.gps, 13, 300, 15),
            (.gps, 15, 74, 33), (.gps, 18, 250, 72), (.gps, 24, 165, 11), (.gps, 25, 338, 52),
            (.gps, 29, 12, 28),
            (.galileo, 3, 90, 58), (.galileo, 8, 140, 36), (.galileo, 13, 222, 19), (.galileo, 15, 280, 41),
            (.galileo, 24, 18, 80), (.galileo, 26, 312, 26), (.galileo, 31, 182, 66),
            (.glonass, nil, 52, 18), (.glonass, nil, 108, 45), (.glonass, 7, 196, 30), (.glonass, nil, 266, 55),
            (.glonass, 22, 345, 12),
            (.beidou, 19, 128, 70), (.beidou, 20, 236, 24), (.beidou, 29, 300, 63), (.beidou, 30, 60, 41),
            (.beidou, 35, 158, 14), (.beidou, 46, 24, 47),
            (.qzss, 2, 98, 13),
            (.sbas, 23, 148, 27), (.sbas, 36, 172, 31),
        ]
        return rows.enumerated().map { index, row in
            SkyPosition(identity: SatelliteIdentity(constellation: row.0, number: row.1, catalogNumber: 90_000 + index,
                                                    objectName: "PREVIEW \(row.0.name.uppercased())"),
                        azimuthDegrees: row.2, elevationDegrees: row.3, rangeKm: 22_000, elementAge: 9 * 3600)
        }
    }()

    static let snapshot = VisibilityEngine.snapshot(of: positions, observer: observer, at: Date())
}

#Preview("Sky") {
    SkyPlotScreen(model: .preview(PreviewData.snapshot, fix: PreviewData.fix, catalog: PreviewData.catalog))
}

#Preview("No orbit data") {
    SkyPlotScreen(model: .preview(nil, fix: PreviewData.fix))
}

#Preview("Detail") {
    SatelliteDetailView(position: PreviewData.positions[2], computedAt: Date())
}
#endif
