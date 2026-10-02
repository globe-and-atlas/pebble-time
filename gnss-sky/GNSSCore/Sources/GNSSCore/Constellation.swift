import Foundation

/// The navigation systems the viewer plots. Raw values are RINEX system letters.
public enum Constellation: String, CaseIterable, Sendable, Codable, Comparable {
    case gps = "G"
    case glonass = "R"
    case galileo = "E"
    case beidou = "C"
    case qzss = "J"
    case sbas = "S"

    /// Three-letter tag for compact status readouts.
    public var abbreviation: String {
        switch self {
        case .gps: "GPS"
        case .glonass: "GLO"
        case .galileo: "GAL"
        case .beidou: "BDS"
        case .qzss: "QZS"
        case .sbas: "SBA"
        }
    }

    public var name: String {
        switch self {
        case .gps: "GPS"
        case .glonass: "GLONASS"
        case .galileo: "Galileo"
        case .beidou: "BeiDou"
        case .qzss: "QZSS"
        case .sbas: "SBAS"
        }
    }

    public static func < (lhs: Self, rhs: Self) -> Bool {
        allCases.firstIndex(of: lhs)! < allCases.firstIndex(of: rhs)!
    }

    /// Classifies a CelesTrak GNSS object name ("GPS BIIF-3  (PRN 24)", "BEIDOU-3 M1 (C19)", …).
    /// Only meaningful for names drawn from navigation-satellite groups: "COSMOS" means GLONASS there.
    public static func identify(objectName name: String) -> Constellation? {
        let upper = name.uppercased()
        if upper.hasPrefix("GPS") || upper.contains("NAVSTAR") { return .gps }
        if upper.hasPrefix("COSMOS") || upper.contains("GLONASS") { return .glonass }
        if upper.hasPrefix("GSAT") || upper.contains("GALILEO") { return .galileo }
        if upper.contains("BEIDOU") { return .beidou }
        if upper.hasPrefix("QZS") || upper.contains("QZSS") || upper.contains("MICHIBIKI") { return .qzss }
        return nil
    }
}

/// Who a satellite is, as far as the orbital data says.
public struct SatelliteIdentity: Sendable, Hashable, Codable {
    public let constellation: Constellation
    /// System-local number as it appears in RINEX ("G12" → 12). Nil when the source name does not
    /// carry it, which is normal for GLONASS: CelesTrak names those by Cosmos and GLONASS number,
    /// not orbital slot. Nil is shown as unknown rather than guessed.
    public let number: Int?
    public let catalogNumber: Int
    public let objectName: String

    public init(constellation: Constellation, number: Int?, catalogNumber: Int, objectName: String) {
        self.constellation = constellation
        self.number = number
        self.catalogNumber = catalogNumber
        self.objectName = objectName
    }

    /// Compact plot label: "G12", "E24", "R07", "C19", "J03", "S33" — or "R??" when unknown.
    public var label: String {
        guard let number else { return constellation.rawValue + "??" }
        return constellation.rawValue + (number < 10 ? "0\(number)" : "\(number)")
    }

    public init?(objectName: String, catalogNumber: Int, constellationHint: Constellation? = nil) {
        guard let constellation = constellationHint ?? Constellation.identify(objectName: objectName) else { return nil }
        self.init(constellation: constellation,
                  number: Self.systemNumber(in: objectName, constellation: constellation),
                  catalogNumber: catalogNumber,
                  objectName: objectName)
    }

    private static let prnPattern = try! Regex(#"PRN\s*[A-Z]?\s*(\d{1,3})"#)
    private static let codePattern = try! Regex(#"\(([GRECJS])(\d{2})\)"#)

    /// Reads "PRN 13", "PRN E11", "(C19)"; maps QZSS PRN 193… to J01… and SBAS PRN 120… to S20…
    /// (the RINEX convention).
    static func systemNumber(in name: String, constellation: Constellation) -> Int? {
        let upper = name.uppercased()
        if let match = upper.firstMatch(of: codePattern),
           let letter = match.output[1].substring, letter == Substring(constellation.rawValue),
           let digits = match.output[2].substring {
            return Int(digits)
        }
        guard let match = upper.firstMatch(of: prnPattern),
              let digits = match.output[1].substring, let prn = Int(digits) else { return nil }
        switch constellation {
        case .qzss: return prn > 192 ? prn - 192 : prn
        case .sbas: return prn >= 100 ? prn - 100 : prn
        default: return prn
        }
    }
}
