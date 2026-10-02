import Foundation

private let unixEpochJulianDate = 2_440_587.5
private let secondsPerDay = 86_400.0

/// Julian date at 0h UTC of a Gregorian calendar date (Vallado's `jday`, valid 1900–2100).
func julianDate(year: Int, month: Int, day: Int) -> Double {
    let y = Double(year), m = Double(month)
    return 367 * y
        - floor(7 * (y + floor((m + 9) / 12)) * 0.25)
        + floor(275 * m / 9)
        + Double(day) + 1_721_013.5
}

extension Date {
    /// Julian date (UTC). UT1 − UTC stays under 0.9 s, far below what a sky plot can show.
    public var julianDate: Double { timeIntervalSince1970 / secondsPerDay + unixEpochJulianDate }

    public init(julianDate: Double) {
        self.init(timeIntervalSince1970: (julianDate - unixEpochJulianDate) * secondsPerDay)
    }
}

/// Greenwich mean sidereal time in radians, IAU-82 (Vallado's `gstime`).
/// This is the angle SGP4's TEME frame is defined against, so it must match the propagator.
func greenwichMeanSiderealTime(julianDateUT1 jd: Double) -> Double {
    let tut1 = (jd - 2_451_545.0) / 36_525.0
    let seconds = -6.2e-6 * tut1 * tut1 * tut1 + 0.093104 * tut1 * tut1
        + (876_600.0 * 3600 + 8_640_184.812866) * tut1 + 67_310.54841
    var theta = (seconds * (.pi / 180) / 240).truncatingRemainder(dividingBy: 2 * .pi)
    if theta < 0 { theta += 2 * .pi }
    return theta
}
