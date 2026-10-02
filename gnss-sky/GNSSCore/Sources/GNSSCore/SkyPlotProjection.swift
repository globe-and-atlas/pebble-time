import Foundation

/// Polar sky-plot geometry, independent of any drawing framework.
///
/// Azimuthal equidistant: distance from the centre is proportional to zenith angle, so the
/// elevation rings at 0°, 30° and 60° are evenly spaced. North is up and east is right, the
/// convention of GNSS receiver sky plots (a map of the sky seen from above, not a star chart).
public enum SkyPlotProjection {
    /// Unit-disc point in screen orientation (x right, y down); the horizon is radius 1.
    public static func point(azimuthDegrees: Double, elevationDegrees: Double) -> (x: Double, y: Double) {
        let r = (90 - min(max(elevationDegrees, 0), 90)) / 90
        let az = azimuthDegrees * .pi / 180
        return (r * sin(az), -r * cos(az))
    }

    /// Radius of an elevation ring on the unit disc.
    public static func radius(elevationDegrees: Double) -> Double {
        (90 - elevationDegrees) / 90
    }

    /// The position nearest a unit-disc point, if within `tolerance` — used for tap selection.
    public static func nearest(to point: (x: Double, y: Double), in positions: [SkyPosition],
                               tolerance: Double) -> SkyPosition? {
        positions
            .map { position -> (SkyPosition, Double) in
                let p = Self.point(azimuthDegrees: position.azimuthDegrees, elevationDegrees: position.elevationDegrees)
                return (position, hypot(p.x - point.x, p.y - point.y))
            }
            .filter { $0.1 <= tolerance }
            .min { $0.1 < $1.1 }?
            .0
    }
}
