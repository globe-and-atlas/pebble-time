import SwiftUI
import GNSSCore

/// Instrument palette: black field, hairline grid, muted signal colours. Every constellation is
/// told apart by marker shape first and colour second, so the plot reads without colour vision.
enum Theme {
    static let grid = Color(white: 0.32)
    static let gridFaint = Color(white: 0.18)
    static let text = Color(white: 0.86)
    static let textDim = Color(white: 0.52)
    static let caution = Color(red: 0.95, green: 0.70, blue: 0.25)
    static let maskFill = Color(red: 0.95, green: 0.70, blue: 0.25).opacity(0.08)

    static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

extension Constellation {
    var color: Color {
        switch self {
        case .gps: Color(red: 0.42, green: 0.85, blue: 0.52)
        case .glonass: Color(red: 0.96, green: 0.45, blue: 0.40)
        case .galileo: Color(red: 0.45, green: 0.68, blue: 1.00)
        case .beidou: Color(red: 0.98, green: 0.80, blue: 0.35)
        case .qzss: Color(red: 0.78, green: 0.58, blue: 0.98)
        case .sbas: Color(white: 0.80)
        }
    }

    /// Marker outline in a unit square centred on the origin (−0.5 … 0.5).
    var markerPath: Path {
        switch self {
        case .gps:      // circle
            return Path(ellipseIn: CGRect(x: -0.5, y: -0.5, width: 1, height: 1))
        case .glonass:  // triangle, apex up
            return polygon([(0, -0.55), (0.5, 0.4), (-0.5, 0.4)])
        case .galileo:  // square
            return Path(CGRect(x: -0.42, y: -0.42, width: 0.84, height: 0.84))
        case .beidou:   // diamond
            return polygon([(0, -0.55), (0.55, 0), (0, 0.55), (-0.55, 0)])
        case .qzss:     // triangle, apex down
            return polygon([(0, 0.55), (0.5, -0.4), (-0.5, -0.4)])
        case .sbas:     // plus
            var p = Path()
            p.addRect(CGRect(x: -0.5, y: -0.14, width: 1, height: 0.28))
            p.addRect(CGRect(x: -0.14, y: -0.5, width: 0.28, height: 1))
            return p
        }
    }

    private func polygon(_ points: [(Double, Double)]) -> Path {
        var p = Path()
        p.addLines(points.map { CGPoint(x: $0.0, y: $0.1) })
        p.closeSubpath()
        return p
    }
}

/// A constellation's marker drawn at a given size, for legends and lists.
struct MarkerGlyph: View {
    let constellation: Constellation
    var size: CGFloat = 7

    var body: some View {
        Canvas { context, canvasSize in
            let path = constellation.markerPath.applying(
                CGAffineTransform(translationX: canvasSize.width / 2, y: canvasSize.height / 2).scaledBy(x: size, y: size))
            context.fill(path, with: .color(constellation.color))
        }
        .frame(width: size + 2, height: size + 2)
        .accessibilityHidden(true)
    }
}
