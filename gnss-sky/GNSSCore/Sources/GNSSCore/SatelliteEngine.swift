import Foundation

/// One satellite's predicted place in the observer's sky at one instant.
public struct SkyPosition: Sendable, Hashable, Identifiable {
    public let identity: SatelliteIdentity
    public let azimuthDegrees: Double
    public let elevationDegrees: Double
    public let rangeKm: Double
    /// Time from the element-set epoch to the computed instant.
    public let elementAge: TimeInterval

    public var id: Int { identity.catalogNumber }

    public init(identity: SatelliteIdentity, azimuthDegrees: Double, elevationDegrees: Double,
                rangeKm: Double, elementAge: TimeInterval) {
        self.identity = identity
        self.azimuthDegrees = azimuthDegrees
        self.elevationDegrees = elevationDegrees
        self.rangeKm = rangeKm
        self.elementAge = elementAge
    }
}

/// Propagates every catalogued satellite to an instant and converts to the observer's sky.
public enum SatelliteEngine {
    public static func positions(of satellites: [CatalogSatellite], from observer: Observer, at date: Date) -> [SkyPosition] {
        let jd = date.julianDate
        return satellites.compactMap { satellite in
            let epoch = satellite.propagator.elements.epochJulianDate
            let minutes = (jd - epoch) * 1440
            // A satellite whose elements fail to propagate is omitted, never drawn at a guessed place.
            guard let state = try? satellite.propagator.propagate(minutesSinceEpoch: minutes) else { return nil }
            let look = Geodesy.lookAngles(from: observer, to: Geodesy.temeToECEF(state.position, julianDate: jd))
            return SkyPosition(identity: satellite.identity,
                               azimuthDegrees: look.azimuthDegrees,
                               elevationDegrees: look.elevationDegrees,
                               rangeKm: look.rangeKm,
                               elementAge: minutes * 60)
        }
    }
}
