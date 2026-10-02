import XCTest
@testable import GNSSCore

/// Runs every case of Vallado's official SGP4 verification set (SGP4-VER.TLE → tcppver.out, as
/// shipped with the reference implementation) through the Swift port. This is the refutation test
/// for the propagator: one wrong sign in the deep-space code shows up here as kilometres of error.
final class SGP4VerificationTests: XCTestCase {
    func testMatchesVerificationOutput() throws {
        let tleText = try fixture("SGP4-VER.TLE")
        // Blocks in file order: the set lists one satellite (20413) twice with different time grids.
        var expectedBlocks = try parseExpectedOutput(fixture("tcppver.out")).makeIterator()

        var lines = tleText.split(whereSeparator: \.isNewline).map(String.init).makeIterator()
        var checkedPoints = 0
        var deepSpaceSatellites = 0
        var errors: [SGP4.PropagationError] = []

        while let line1 = lines.next() {
            guard line1.hasPrefix("1") else { continue }
            let line2 = try XCTUnwrap(lines.next())
            let tle = try TwoLineElementSet(line1: line1, line2: line2)
            let sgp4 = SGP4(tle)
            if sgp4.isDeepSpace { deepSpaceSatellites += 1 }
            let block = try XCTUnwrap(expectedBlocks.next())
            XCTAssertEqual(block.satellite, tle.catalogNumber)
            let rows = block.rows

            // Walk the satellite's own time grid (columns 70+ of line 2), as the reference harness
            // does: expected output ends where the reference hit an error, so we must step past it.
            var expectedRows = rows.makeIterator()
            for tsince in timeGrid(line2) {
                do {
                    let (r, v) = try sgp4.propagate(minutesSinceEpoch: tsince)
                    let row = try XCTUnwrap(expectedRows.next(), "sat \(tle.catalogNumber) t=\(tsince) beyond reference")
                    XCTAssertEqual(row.tsince, tsince, accuracy: 1e-6)
                    for i in 0..<3 {
                        XCTAssertEqual(r[i], row.position[i], accuracy: 1e-5,
                                       "sat \(tle.catalogNumber) t=\(tsince) r[\(i)]")
                        XCTAssertEqual(v[i], row.velocity[i], accuracy: 1e-8,
                                       "sat \(tle.catalogNumber) t=\(tsince) v[\(i)]")
                    }
                    checkedPoints += 1
                } catch let error as SGP4.PropagationError {
                    errors.append(error)
                    break
                }
            }
        }

        // The verification set deliberately contains seven satellites that fail: the reference
        // reports error codes [1, 1, 6, 6, 4, 3, 6] in this order.
        XCTAssertEqual(errors, [.meanEccentricityOutOfRange, .meanEccentricityOutOfRange, .decayed, .decayed,
                                .semilatusRectumNegative, .perturbedEccentricityOutOfRange, .decayed])
        XCTAssertGreaterThan(checkedPoints, 600)
        XCTAssertGreaterThan(deepSpaceSatellites, 10)
    }

    /// t = 0, then start…stop by step (skipping a duplicate 0), then stop itself if the step overshot.
    private func timeGrid(_ line2: String) -> [Double] {
        let f = line2.dropFirst(69).split(separator: " ").compactMap { Double($0) }
        let (start, stop, step) = (f[0], f[1], f[2])
        var times = [0.0]
        var t = start
        while t <= stop {
            if !(t == 0 && start == 0) { times.append(t) }
            t += step
        }
        if t - stop < step - 1e-6 { times.append(stop) }
        return times
    }

    private struct Row { let tsince: Double; let position: SIMD3<Double>; let velocity: SIMD3<Double> }

    private func parseExpectedOutput(_ text: String) -> [(satellite: Int, rows: [Row])] {
        var result: [(satellite: Int, rows: [Row])] = []
        for raw in text.split(whereSeparator: \.isNewline) {
            let fields = raw.split(separator: " ")
            if fields.count == 2, fields[1] == "xx", let sat = Int(fields[0]) {
                result.append((sat, []))
                continue
            }
            let n = fields.prefix(7).compactMap { Double($0) }
            guard n.count == 7, !result.isEmpty else { continue }
            result[result.count - 1].rows.append(Row(tsince: n[0], position: SIMD3(n[1], n[2], n[3]),
                                                     velocity: SIMD3(n[4], n[5], n[6])))
        }
        return result
    }
}

func fixture(_ name: String) throws -> String {
    let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: nil, subdirectory: "Fixtures"))
    return try String(contentsOf: url, encoding: .ascii)
}
