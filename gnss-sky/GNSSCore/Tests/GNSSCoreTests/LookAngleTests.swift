import XCTest
@testable import GNSSCore

/// End-to-end check of the chain TLE → SGP4 → TEME → ECEF → azimuth/elevation against Skyfield
/// (an independent implementation using full IERS-style frame transforms and its own UT1 table).
/// References were produced with skyfield 1.x: `(sat - wgs84.latlon(lat, lon, elevation_m=h)).at(t).altaz()`.
///
/// 99901/99902 are synthetic GPS-like and Galileo-like element sets made for this test (real
/// orbits, invented satellites); 14128 is EUTELSAT 1-F1 from the SGP4 verification set.
final class LookAngleTests: XCTestCase {
    static let gpsLike = try! TwoLineElementSet(
        name: "GPS TEST (PRN 31)",
        line1: "1 99901U 20001A   26270.50000000 -.00000040  00000-0  00000-0 0  9998",
        line2: "2 99901  55.1234 123.4567 0089123  45.6789 314.5678  2.00561234 12347")
    static let galileoLike = try! TwoLineElementSet(
        name: "GSAT TEST (PRN E36)",
        line1: "1 99902U 20002A   26271.25000000 -.00000010  00000-0  00000-0 0  9990",
        line2: "2 99902  56.0500 300.1000 0003000 280.0000  80.0000  1.70475800 12344")
    static let eutelsat = try! TwoLineElementSet(
        line1: "1 14128U 83058A   06176.02844893 -.00000158  00000-0  10000-3 0  9627",
        line2: "2 14128  11.4384  35.2134 0011562  26.4582 333.5652  0.98870114 46093")

    struct Case {
        let tle: TwoLineElementSet
        let time: String
        let observer: Observer
        let azimuth, elevation, range: Double
    }

    let cases: [Case] = [
        Case(tle: gpsLike, time: "2026-09-28T13:17:30Z", observer: .init(latitudeDegrees: 51.4779, longitudeDegrees: -0.0015, ellipsoidalHeightMeters: 46),
             azimuth: 267.993275, elevation: 33.410815, range: 22273.171),
        Case(tle: gpsLike, time: "2026-09-28T00:17:30Z", observer: .init(latitudeDegrees: -33.8688, longitudeDegrees: 151.2093, ellipsoidalHeightMeters: 58),
             azimuth: 316.131474, elevation: 25.071656, range: 23017.616),
        Case(tle: gpsLike, time: "2026-09-28T03:17:30Z", observer: .init(latitudeDegrees: 40.015, longitudeDegrees: -105.2705, ellipsoidalHeightMeters: 1655),
             azimuth: 313.006434, elevation: 24.671133, range: 23128.033),
        Case(tle: gpsLike, time: "2026-09-28T06:00:00Z", observer: .init(latitudeDegrees: 51.4779, longitudeDegrees: -0.0015, ellipsoidalHeightMeters: 46),
             azimuth: 325.202351, elevation: -44.974473, range: 30863.305),
        Case(tle: galileoLike, time: "2026-09-29T00:17:30Z", observer: .init(latitudeDegrees: 51.4779, longitudeDegrees: -0.0015, ellipsoidalHeightMeters: 46),
             azimuth: 69.471042, elevation: 53.726002, range: 24234.348),
        Case(tle: galileoLike, time: "2026-09-29T05:17:30Z", observer: .init(latitudeDegrees: -33.8688, longitudeDegrees: 151.2093, ellipsoidalHeightMeters: 58),
             azimuth: 235.473441, elevation: 17.749293, range: 27037.653),
        Case(tle: galileoLike, time: "2026-09-29T13:17:30Z", observer: .init(latitudeDegrees: 40.015, longitudeDegrees: -105.2705, ellipsoidalHeightMeters: 1655),
             azimuth: 317.255918, elevation: 20.256995, range: 26800.051),
        Case(tle: eutelsat, time: "2006-06-26T00:17:30Z", observer: .init(latitudeDegrees: -33.8688, longitudeDegrees: 151.2093, ellipsoidalHeightMeters: 58),
             azimuth: 298.105969, elevation: 30.557146, range: 38920.490),
        Case(tle: eutelsat, time: "2006-06-26T12:00:00Z", observer: .init(latitudeDegrees: 48.8566, longitudeDegrees: 2.3522, ellipsoidalHeightMeters: 35),
             azimuth: 78.356549, elevation: -14.180896, range: 43712.115),
    ]

    func testLookAnglesMatchSkyfield() throws {
        for c in cases {
            let date = try XCTUnwrap(ISO8601DateFormatter().date(from: c.time))
            let satellite = CatalogSatellite(
                identity: SatelliteIdentity(constellation: .gps, number: nil, catalogNumber: c.tle.catalogNumber, objectName: ""),
                propagator: SGP4(c.tle))
            let p = try XCTUnwrap(SatelliteEngine.positions(of: [satellite], from: c.observer, at: date).first)
            // 0.005° is ~1/20 of a pixel on the watch plot; the residual is Skyfield's UT1 − UTC.
            XCTAssertEqual(p.azimuthDegrees, c.azimuth, accuracy: 0.005, "\(c.tle.catalogNumber) \(c.time)")
            XCTAssertEqual(p.elevationDegrees, c.elevation, accuracy: 0.005, "\(c.tle.catalogNumber) \(c.time)")
            XCTAssertEqual(p.rangeKm, c.range, accuracy: 0.5, "\(c.tle.catalogNumber) \(c.time)")
        }
    }

    func testZenithAndCardinalDirections() {
        let observer = Observer(latitudeDegrees: 0, longitudeDegrees: 0)
        let r = 26_560.0
        let overhead = Geodesy.lookAngles(from: observer, to: SIMD3(r, 0, 0))
        XCTAssertEqual(overhead.elevationDegrees, 90, accuracy: 1e-9)

        let north = Geodesy.lookAngles(from: observer, to: SIMD3(r, 0, 20_000))
        XCTAssertEqual(north.azimuthDegrees, 0, accuracy: 1e-9)
        let east = Geodesy.lookAngles(from: observer, to: SIMD3(r, 20_000, 0))
        XCTAssertEqual(east.azimuthDegrees, 90, accuracy: 1e-9)
        let west = Geodesy.lookAngles(from: observer, to: SIMD3(r, -20_000, 0))
        XCTAssertEqual(west.azimuthDegrees, 270, accuracy: 1e-9)
    }

    func testJulianDateRoundTrip() {
        let date = Date(timeIntervalSince1970: 1_790_000_000)
        XCTAssertEqual(Date(julianDate: date.julianDate).timeIntervalSince1970, 1_790_000_000, accuracy: 1e-4)
        XCTAssertEqual(Date(timeIntervalSince1970: 946_728_000).julianDate, 2_451_545.0, accuracy: 1e-9) // J2000.0
    }
}
