import XCTest
@testable import GNSSCore

final class CatalogTests: XCTestCase {
    // MARK: Element sets

    func testParsesFieldsAndImpliedDecimals() throws {
        let tle = try TwoLineElementSet(
            name: "SL-6 R/B(2)",
            line1: "1 16925U 86065D   06151.67415771  .02550794 -30915-6  18784-3 0  4486",
            line2: "2 16925  62.0906 295.0239 5596327 245.1593  47.9690  4.88511875148616")
        XCTAssertEqual(tle.catalogNumber, 16925)
        XCTAssertEqual(tle.meanMotionDDot, -0.30915e-6, accuracy: 1e-15)
        XCTAssertEqual(tle.bstar, 0.18784e-3, accuracy: 1e-12)
        XCTAssertEqual(tle.eccentricity, 0.5596327, accuracy: 1e-12)
        XCTAssertEqual(tle.meanMotionRevsPerDay, 4.88511875, accuracy: 1e-12)
        // 2006 day 151.67415771 = 31 May 2006 16:10:47.226 UTC
        let expected = try XCTUnwrap(ISO8601DateFormatter().date(from: "2006-05-31T16:10:47Z"))
        XCTAssertEqual(tle.epoch.timeIntervalSince(expected), 0.226, accuracy: 0.01)
    }

    func testAlpha5CatalogNumbers() {
        XCTAssertEqual(TwoLineElementSet.decodeAlpha5("A0000"), 100_000)
        XCTAssertEqual(TwoLineElementSet.decodeAlpha5("J1234"), 181_234)   // I is skipped
        XCTAssertEqual(TwoLineElementSet.decodeAlpha5("Z9999"), 339_999)
        XCTAssertEqual(TwoLineElementSet.decodeAlpha5("05123"), 5123)
    }

    func testRejectsShiftedLine() {
        XCTAssertThrowsError(try TwoLineElementSet(
            line1: "1 16925U 86065D  06151.67415771  .02550794 -30915-6  18784-3 0  4486",
            line2: "2 16925  62.0906 295.0239 5596327 245.1593  47.9690  4.88511875148616"))
    }

    func testParseManySkipsBrokenRecordsAndReadsNames() {
        let text = """
        GPS TEST (PRN 31)
        \(LookAngleTests.gpsLike.line1)
        \(LookAngleTests.gpsLike.line2)
        BROKEN
        1 garbage
        2 garbage
        0 GSAT TEST (PRN E36)
        \(LookAngleTests.galileoLike.line1)\r
        \(LookAngleTests.galileoLike.line2)
        """
        let sets = TwoLineElementSet.parseMany(text)
        XCTAssertEqual(sets.map(\.catalogNumber), [99901, 99902])
        XCTAssertEqual(sets.map(\.name), ["GPS TEST (PRN 31)", "GSAT TEST (PRN E36)"])
    }

    // MARK: Identity

    func testIdentifiesConstellationsAndNumbers() {
        func label(_ name: String, hint: Constellation? = nil) -> String? {
            SatelliteIdentity(objectName: name, catalogNumber: 1, constellationHint: hint)?.label
        }
        XCTAssertEqual(label("GPS BIIF-3  (PRN 24)"), "G24")
        XCTAssertEqual(label("GPS BIII-1  (PRN 04)"), "G04")
        XCTAssertEqual(label("GSAT0101 (PRN E11)"), "E11")
        XCTAssertEqual(label("GSAT0210 (GALILEO 14)"), "E??")
        XCTAssertEqual(label("BEIDOU-3 M1 (C19)"), "C19")
        XCTAssertEqual(label("QZS-2 (QZSS/PRN 194)"), "J02")
        XCTAssertEqual(label("SES-5 (PRN 136)", hint: .sbas), "S36")
        // GLONASS names carry no slot: shown as unknown, never guessed.
        XCTAssertEqual(label("COSMOS 2433 (720)"), "R??")
        XCTAssertEqual(label("COSMOS 2433 (R07)"), "R07")
        XCTAssertNil(label("IRNSS-1B"))
        XCTAssertNil(label("ISS (ZARYA)"))
    }

    // MARK: Visibility and projection

    func testVisibilityAppliesMaskAndCounts() {
        func position(_ c: Constellation, _ n: Int, el: Double) -> SkyPosition {
            SkyPosition(identity: SatelliteIdentity(constellation: c, number: n, catalogNumber: n, objectName: ""),
                        azimuthDegrees: 0, elevationDegrees: el, rangeKm: 20_000, elementAge: 0)
        }
        let positions = [position(.gps, 1, el: 45), position(.gps, 2, el: 9.99), position(.galileo, 3, el: 10),
                         position(.beidou, 4, el: -30), position(.gps, 5, el: 80)]
        let snapshot = VisibilityEngine.snapshot(of: positions, observer: Observer(latitudeDegrees: 0, longitudeDegrees: 0),
                                                 at: Date())
        XCTAssertEqual(snapshot.visible.map(\.id), [5, 1, 3])
        XCTAssertEqual(snapshot.counts, [.gps: 2, .galileo: 1])
    }

    func testProjectionOrientation() {
        func p(_ az: Double, _ el: Double) -> (Double, Double) {
            let q = SkyPlotProjection.point(azimuthDegrees: az, elevationDegrees: el)
            return ((q.x * 1e9).rounded() / 1e9, (q.y * 1e9).rounded() / 1e9)
        }
        XCTAssertTrue(p(0, 90) == (0, 0))        // zenith at centre
        XCTAssertTrue(p(0, 0) == (0, -1))        // north on the horizon, top
        XCTAssertTrue(p(90, 0) == (1, 0))        // east, right
        XCTAssertTrue(p(180, 0) == (0, 1))       // south, bottom
        XCTAssertTrue(p(270, 0) == (-1, 0))      // west, left
        XCTAssertTrue(p(90, 45) == (0.5, 0))     // equidistant in zenith angle
        XCTAssertEqual(SkyPlotProjection.radius(elevationDegrees: 30), 2.0 / 3, accuracy: 1e-12)
        XCTAssertEqual(SkyPlotProjection.radius(elevationDegrees: 60), 1.0 / 3, accuracy: 1e-12)
    }

    func testNearestSelection() {
        let a = SkyPosition(identity: SatelliteIdentity(constellation: .gps, number: 1, catalogNumber: 1, objectName: ""),
                            azimuthDegrees: 90, elevationDegrees: 45, rangeKm: 0, elementAge: 0)
        let b = SkyPosition(identity: SatelliteIdentity(constellation: .gps, number: 2, catalogNumber: 2, objectName: ""),
                            azimuthDegrees: 90, elevationDegrees: 0, rangeKm: 0, elementAge: 0)
        XCTAssertEqual(SkyPlotProjection.nearest(to: (0.55, 0), in: [a, b], tolerance: 0.1)?.id, 1)
        XCTAssertNil(SkyPlotProjection.nearest(to: (0, 0.5), in: [a, b], tolerance: 0.1))
    }

    // MARK: Cache and freshness

    func testStoreRoundTripsAndCatalogBuildsSatellites() throws {
        let catalog = OrbitalCatalog(retrievedAt: Date(timeIntervalSince1970: 1_790_000_000), source: "test",
                                     records: [.init(elements: LookAngleTests.gpsLike),
                                               .init(elements: LookAngleTests.gpsLike),   // duplicate dropped
                                               .init(elements: LookAngleTests.galileoLike)])
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = EphemerisStore(directory: dir)
        XCTAssertNil(store.load())
        try store.save(catalog)
        XCTAssertEqual(store.load(), catalog)
        XCTAssertEqual(catalog.satellites().map(\.identity.label), ["G31", "E36"])
    }

    func testFreshnessAndRefreshPolicy() throws {
        let catalog = OrbitalCatalog(retrievedAt: LookAngleTests.gpsLike.epoch, source: "test",
                                     records: [.init(elements: LookAngleTests.gpsLike)])
        let epoch = LookAngleTests.gpsLike.epoch
        XCTAssertEqual(catalog.freshness(at: epoch.addingTimeInterval(86_400)), .fresh)
        XCTAssertEqual(catalog.freshness(at: epoch.addingTimeInterval(5 * 86_400)), .aging)
        XCTAssertEqual(catalog.freshness(at: epoch.addingTimeInterval(20 * 86_400)), .stale)
        XCTAssertTrue(RefreshPolicy.isDue(nil, now: epoch))
        XCTAssertFalse(RefreshPolicy.isDue(catalog, now: epoch.addingTimeInterval(3600)))
        XCTAssertTrue(RefreshPolicy.isDue(catalog, now: epoch.addingTimeInterval(25 * 3600)))
    }
}
