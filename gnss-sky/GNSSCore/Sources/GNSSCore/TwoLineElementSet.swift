import Foundation

/// One NORAD two-line element set: SGP4 mean elements for one satellite at one epoch.
///
/// Column positions follow the CelesTrak/Space-Track TLE format. Angles are kept in
/// degrees and mean motion in revolutions per day, exactly as written; `SGP4` converts.
public struct TwoLineElementSet: Sendable, Hashable, Codable {
    public let name: String?
    public let catalogNumber: Int
    /// Epoch as a Julian date (UTC), kept as a Double because SGP4 measures time from it.
    public let epochJulianDate: Double
    public let meanMotionDot: Double        // rev/day², as written (already halved in the format)
    public let meanMotionDDot: Double       // rev/day³, as written (already divided by 6)
    public let bstar: Double                // 1/earth radii
    public let inclinationDegrees: Double
    public let rightAscensionDegrees: Double
    public let eccentricity: Double
    public let argumentOfPerigeeDegrees: Double
    public let meanAnomalyDegrees: Double
    public let meanMotionRevsPerDay: Double
    public let line1: String
    public let line2: String

    public var epoch: Date { Date(julianDate: epochJulianDate) }

    public enum ParseError: Error, Equatable {
        case malformedLine1(String)
        case malformedLine2(String)
        case catalogNumberMismatch
    }

    public init(name: String? = nil, line1: String, line2: String) throws {
        let l1 = Array(line1.trimmingTrailingWhitespace.utf8)
        let l2 = Array(line2.trimmingTrailingWhitespace.utf8)
        // The same structural checks the reference implementation makes: fixed
        // separators in fixed columns catch shifted or truncated lines.
        guard l1.count >= 64, l1.starts(with: Array("1 ".utf8)),
              l1[8] == .space, l1[23] == .dot, l1[32] == .space, l1[34] == .dot,
              l1[43] == .space, l1[52] == .space, l1[61] == .space, l1[63] == .space
        else { throw ParseError.malformedLine1(line1) }
        guard l2.count >= 68, l2.starts(with: Array("2 ".utf8)),
              l2[7] == .space, l2[11] == .dot, l2[16] == .space, l2[20] == .dot,
              l2[25] == .space, l2[33] == .space, l2[37] == .dot, l2[42] == .space,
              l2[46] == .dot, l2[51] == .space
        else { throw ParseError.malformedLine2(line2) }
        guard l1[2..<7] == l2[2..<7] else { throw ParseError.catalogNumberMismatch }

        func field(_ line: [UInt8], _ range: Range<Int>) -> String {
            String(decoding: line[range], as: UTF8.self).trimmingCharacters(in: .whitespaces)
        }
        func number(_ text: String, _ line: Int) throws -> Double {
            guard let value = Double(text) else {
                throw line == 1 ? ParseError.malformedLine1(line1) : ParseError.malformedLine2(line2)
            }
            return value
        }
        // "Assumed decimal point" fields such as " 12808-3" mean 0.12808e-3.
        func impliedDecimal(_ mantissa: Range<Int>, exponent: Range<Int>) throws -> Double {
            let sign = l1[mantissa.lowerBound] == UInt8(ascii: "-") ? "-" : ""
            let digits = field(l1, (mantissa.lowerBound + 1)..<mantissa.upperBound)
            let m = try number("\(sign)0.\(digits.isEmpty ? "0" : digits)", 1)
            guard let e = Int(field(l1, exponent)) else { throw ParseError.malformedLine1(line1) }
            return m * pow(10, Double(e))
        }

        guard let catalog = Self.decodeAlpha5(field(l1, 2..<7)) else { throw ParseError.malformedLine1(line1) }
        guard let twoDigitYear = Int(field(l1, 18..<20)) else { throw ParseError.malformedLine1(line1) }
        let epochDays = try number(field(l1, 20..<32), 1)
        let year = twoDigitYear < 57 ? 2000 + twoDigitYear : 1900 + twoDigitYear

        self.name = name.map { $0.trimmingCharacters(in: .whitespaces) }.flatMap { $0.isEmpty ? nil : $0 }
        self.catalogNumber = catalog
        self.epochJulianDate = julianDate(year: year, month: 1, day: 1) + epochDays - 1
        self.meanMotionDot = try number(field(l1, 33..<43), 1)
        self.meanMotionDDot = try impliedDecimal(44..<50, exponent: 50..<52)
        self.bstar = try impliedDecimal(53..<59, exponent: 59..<61)
        self.inclinationDegrees = try number(field(l2, 8..<16), 2)
        self.rightAscensionDegrees = try number(field(l2, 17..<25), 2)
        self.eccentricity = try number("0." + field(l2, 26..<33).replacingOccurrences(of: " ", with: "0"), 2)
        self.argumentOfPerigeeDegrees = try number(field(l2, 34..<42), 2)
        self.meanAnomalyDegrees = try number(field(l2, 43..<51), 2)
        self.meanMotionRevsPerDay = try number(field(l2, 52..<63), 2)
        self.line1 = String(decoding: l1, as: UTF8.self)
        self.line2 = String(decoding: l2.prefix(69), as: UTF8.self)
    }

    /// Catalog numbers above 99999 use "Alpha-5": a leading letter (I and O skipped) worth 10000 each from A=10.
    static func decodeAlpha5(_ text: String) -> Int? {
        guard let first = text.unicodeScalars.first else { return nil }
        if CharacterSet.decimalDigits.contains(first) { return Int(text) }
        let letters = Array("ABCDEFGHJKLMNPQRSTUVWXYZ")
        guard let index = letters.firstIndex(of: Character(first)), let rest = Int(text.dropFirst()) else { return nil }
        return (10 + index) * 10000 + rest
    }

    /// Parses 2-line or 3-line (name + 2 lines) TLE text. Unparseable sets are skipped, not fatal:
    /// one corrupt record should not blank the whole sky.
    public static func parseMany(_ text: String) -> [TwoLineElementSet] {
        var result: [TwoLineElementSet] = []
        var name: String?
        var pendingLine1: String?
        for raw in text.split(whereSeparator: \.isNewline) {
            let line = String(raw)
            if line.hasPrefix("1 ") {
                pendingLine1 = line
            } else if line.hasPrefix("2 "), let l1 = pendingLine1 {
                if let set = try? TwoLineElementSet(name: name, line1: l1, line2: line) { result.append(set) }
                pendingLine1 = nil
                name = nil
            } else if !line.trimmingCharacters(in: .whitespaces).isEmpty {
                name = line.hasPrefix("0 ") ? String(line.dropFirst(2)) : line
                pendingLine1 = nil
            }
        }
        return result
    }
}

private extension UInt8 {
    static let space = UInt8(ascii: " ")
    static let dot = UInt8(ascii: ".")
}

private extension String {
    var trimmingTrailingWhitespace: String {
        var s = Substring(self)
        while let last = s.last, last.isWhitespace { s = s.dropLast() }
        return String(s)
    }
}
