import Foundation

/// Where the sky is seen from: WGS-84 geodetic coordinates.
public struct Observer: Sendable, Hashable, Codable {
    public var latitudeDegrees: Double
    public var longitudeDegrees: Double
    /// Height above the WGS-84 ellipsoid (Core Location's `ellipsoidalAltitude`), metres.
    public var ellipsoidalHeightMeters: Double

    public init(latitudeDegrees: Double, longitudeDegrees: Double, ellipsoidalHeightMeters: Double = 0) {
        self.latitudeDegrees = latitudeDegrees
        self.longitudeDegrees = longitudeDegrees
        self.ellipsoidalHeightMeters = ellipsoidalHeightMeters
    }

    /// Earth-fixed (ECEF) position in km.
    var ecef: SIMD3<Double> {
        let a = 6378.137, f = 1 / 298.257223563
        let e2 = f * (2 - f)
        let lat = latitudeDegrees * .pi / 180, lon = longitudeDegrees * .pi / 180
        let h = ellipsoidalHeightMeters / 1000
        let n = a / (1 - e2 * sin(lat) * sin(lat)).squareRoot()
        return SIMD3((n + h) * cos(lat) * cos(lon),
                     (n + h) * cos(lat) * sin(lon),
                     (n * (1 - e2) + h) * sin(lat))
    }
}

/// Direction to a satellite as seen by an observer.
public struct LookAngles: Sendable, Hashable {
    /// Degrees clockwise from true north, 0 ..< 360.
    public let azimuthDegrees: Double
    /// Degrees above the local horizon (geodetic normal), −90 ... 90.
    public let elevationDegrees: Double
    public let rangeKm: Double
}

enum Geodesy {
    /// TEME (SGP4's output frame) to Earth-fixed: rotate by Greenwich mean sidereal time.
    /// Polar motion (≈ 10 m at the surface) is ignored; it moves a GNSS satellite by < 0.0001°.
    static func temeToECEF(_ r: SIMD3<Double>, julianDate: Double) -> SIMD3<Double> {
        let g = greenwichMeanSiderealTime(julianDateUT1: julianDate)
        return SIMD3(cos(g) * r.x + sin(g) * r.y,
                     -sin(g) * r.x + cos(g) * r.y,
                     r.z)
    }

    static func lookAngles(from observer: Observer, to satelliteECEF: SIMD3<Double>) -> LookAngles {
        let d = satelliteECEF - observer.ecef
        let lat = observer.latitudeDegrees * .pi / 180, lon = observer.longitudeDegrees * .pi / 180
        // Project the line of sight onto the local east-north-up axes.
        let east = -sin(lon) * d.x + cos(lon) * d.y
        let north = -sin(lat) * cos(lon) * d.x - sin(lat) * sin(lon) * d.y + cos(lat) * d.z
        let up = cos(lat) * cos(lon) * d.x + cos(lat) * sin(lon) * d.y + sin(lat) * d.z
        let range = (d * d).sum().squareRoot()
        var azimuth = atan2(east, north) * 180 / .pi
        if azimuth < 0 { azimuth += 360 }
        return LookAngles(azimuthDegrees: azimuth,
                          elevationDegrees: asin(up / range) * 180 / .pi,
                          rangeKm: range)
    }
}
