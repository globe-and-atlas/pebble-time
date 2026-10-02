import Foundation

/// A timestamped set of element sets: the unit that is downloaded, cached and used offline.
public struct OrbitalCatalog: Sendable, Codable, Equatable {
    public struct Record: Sendable, Codable, Equatable {
        public let elements: TwoLineElementSet
        /// Set when the source group itself defines the system (CelesTrak "sbas"); otherwise the
        /// constellation is read from the object name.
        public let constellationHint: Constellation?

        public init(elements: TwoLineElementSet, constellationHint: Constellation? = nil) {
            self.elements = elements
            self.constellationHint = constellationHint
        }
    }

    public let retrievedAt: Date
    public let source: String
    public let records: [Record]

    public init(retrievedAt: Date, source: String, records: [Record]) {
        self.retrievedAt = retrievedAt
        self.source = source
        self.records = records
    }

    /// Median element-set epoch. Element age, not download age, is what limits SGP4 accuracy.
    public var medianEpoch: Date? {
        let epochs = records.map(\.elements.epochJulianDate).sorted()
        guard !epochs.isEmpty else { return nil }
        return Date(julianDate: epochs[epochs.count / 2])
    }

    public func freshness(at now: Date) -> Freshness {
        guard let epoch = medianEpoch else { return .stale }
        return Freshness(elementAge: now.timeIntervalSince(epoch))
    }

    /// Recognised GNSS satellites, ready to propagate. Unrecognised objects are dropped.
    public func satellites() -> [CatalogSatellite] {
        var seen = Set<Int>()
        return records.compactMap { record in
            let tle = record.elements
            guard seen.insert(tle.catalogNumber).inserted,
                  let identity = SatelliteIdentity(objectName: tle.name ?? "",
                                                   catalogNumber: tle.catalogNumber,
                                                   constellationHint: record.constellationHint)
            else { return nil }
            return CatalogSatellite(identity: identity, propagator: SGP4(tle))
        }
    }
}

/// How far element sets can be trusted for a sky plot. SGP4 error for GNSS orbits grows from about
/// a kilometre at epoch to tens of kilometres after a few weeks; at 20 000 km range that is still
/// well under a degree, so "aging" data is plotted, "stale" data is plotted but flagged.
public enum Freshness: Sendable, Equatable {
    case fresh, aging, stale

    public init(elementAge: TimeInterval) {
        switch elementAge {
        case ..<(3 * 86_400): self = .fresh
        case ..<(14 * 86_400): self = .aging
        default: self = .stale
        }
    }
}

public struct CatalogSatellite: Sendable {
    public let identity: SatelliteIdentity
    public let propagator: SGP4

    public init(identity: SatelliteIdentity, propagator: SGP4) {
        self.identity = identity
        self.propagator = propagator
    }
}
