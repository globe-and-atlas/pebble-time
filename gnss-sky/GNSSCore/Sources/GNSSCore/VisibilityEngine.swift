import Foundation

/// Where a satellite's sky position came from. Public watchOS APIs offer no receiver-level
/// satellite data, so every snapshot today is `.predicted`; the case exists so an external
/// receiver (or a future API) can never be confused with orbital prediction on screen.
public enum Provenance: Sendable, Equatable {
    /// Computed from orbital elements: geometrically above the mask, not necessarily received.
    case predicted
    /// Reported by a GNSS receiver as tracked.
    case receiverTracked
}

/// What the sky plot shows at one instant: satellites above the elevation mask.
public struct SkySnapshot: Sendable, Equatable {
    public let provenance: Provenance
    public let date: Date
    public let observer: Observer
    public let elevationMaskDegrees: Double
    /// Above the mask, highest first.
    public let visible: [SkyPosition]

    public init(provenance: Provenance = .predicted, date: Date, observer: Observer,
                elevationMaskDegrees: Double, visible: [SkyPosition]) {
        self.provenance = provenance
        self.date = date
        self.observer = observer
        self.elevationMaskDegrees = elevationMaskDegrees
        self.visible = visible
    }

    public var counts: [Constellation: Int] {
        Dictionary(grouping: visible, by: \.identity.constellation).mapValues(\.count)
    }
}

public enum VisibilityEngine {
    public static let defaultElevationMaskDegrees = 10.0

    public static func snapshot(of positions: [SkyPosition], observer: Observer, at date: Date,
                                elevationMaskDegrees: Double = defaultElevationMaskDegrees) -> SkySnapshot {
        SkySnapshot(date: date,
                    observer: observer,
                    elevationMaskDegrees: elevationMaskDegrees,
                    visible: positions
                        .filter { $0.elevationDegrees >= elevationMaskDegrees }
                        .sorted { $0.elevationDegrees > $1.elevationDegrees })
    }
}
