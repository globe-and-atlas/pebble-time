import SwiftUI
import GNSSCore

/// The primary screen: a polar sky plot filling the width, four corner readouts in the space the
/// circle leaves, constellation counts beneath, and the provenance as the title beside the clock.
struct SkyPlotScreen: View {
    @State private var model: SkyPlotViewModel
    @State private var selection: SkyPosition?
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced

    init(model: SkyPlotViewModel = SkyPlotViewModel()) {
        _model = State(initialValue: model)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 2) {
                SkyPlot(positions: model.snapshot?.visible ?? [],
                        elevationMaskDegrees: model.elevationMaskDegrees,
                        dimmed: isLuminanceReduced) { selection = $0 }
                    .overlay { CornerReadouts(model: model) }
                    .overlay { placeholder }
                    .layoutPriority(1)
                ConstellationCounts(counts: model.snapshot?.counts ?? [:])
            }
            .navigationTitle(model.snapshot?.provenance == .receiverTracked ? "Tracked" : "Predicted")
            .navigationDestination(item: $selection) { position in
                SatelliteDetailView(position: position, computedAt: model.snapshot?.date ?? Date())
            }
        }
        .task(id: activity) { await model.run(activity) }
    }

    private var activity: SkyPlotViewModel.Activity {
        switch scenePhase {
        case .active: .active
        case .inactive: .inactive
        default: .background
        }
    }

    /// Says why the plot is empty instead of showing an empty sky that looks like data.
    @ViewBuilder private var placeholder: some View {
        if let message = placeholderMessage {
            Text(message)
                .font(Theme.mono(9, .semibold))
                .foregroundStyle(Theme.caution)
                .padding(.horizontal, 4)
                .background(.black)
        }
    }

    private var placeholderMessage: String? {
        if model.isLocationDenied { return "LOCATION OFF" }
        if model.catalog == nil { return model.isDownloadingOrbits ? "LOADING ORBITS" : "NO ORBIT DATA" }
        if model.fix == nil { return model.isAcquiringFix ? "ACQUIRING FIX" : "NO FIX" }
        return nil
    }
}

// MARK: - Plot

struct SkyPlot: View {
    let positions: [SkyPosition]
    let elevationMaskDegrees: Double
    let dimmed: Bool
    let onSelect: (SkyPosition) -> Void

    private static let markerSize: CGFloat = 7
    private static let hitRadius: CGFloat = 14

    var body: some View {
        GeometryReader { geometry in
            let side = min(geometry.size.width, geometry.size.height)
            let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
            let radius = side / 2 - 1
            Canvas { context, _ in
                drawGrid(in: &context, center: center, radius: radius)
                drawSatellites(in: &context, center: center, radius: radius)
            }
            .contentShape(Rectangle())
            .gesture(SpatialTapGesture().onEnded { tap in
                let unit = (x: Double((tap.location.x - center.x) / radius),
                            y: Double((tap.location.y - center.y) / radius))
                if let hit = SkyPlotProjection.nearest(to: unit, in: positions, tolerance: Double(Self.hitRadius / radius)) {
                    onSelect(hit)
                }
            })
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityElement()
        .accessibilityLabel("Sky plot, \(positions.count) satellites predicted above \(Int(elevationMaskDegrees)) degrees")
    }

    private func drawGrid(in context: inout GraphicsContext, center: CGPoint, radius: CGFloat) {
        func circle(_ elevation: Double) -> Path {
            let r = radius * SkyPlotProjection.radius(elevationDegrees: elevation)
            return Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r))
        }

        // Below-mask band: shaded so "excluded" reads differently from "empty".
        var band = circle(0)
        band.addPath(circle(elevationMaskDegrees))
        context.fill(band, with: .color(Theme.maskFill), style: FillStyle(eoFill: true))
        context.stroke(circle(elevationMaskDegrees), with: .color(Theme.caution.opacity(0.45)),
                       style: StrokeStyle(lineWidth: 0.5, dash: [2, 2]))

        // Elevation rings, azimuth spokes and 30° ticks.
        context.stroke(circle(0), with: .color(Theme.grid), lineWidth: 1)
        for elevation in [30.0, 60.0] {
            context.stroke(circle(elevation), with: .color(Theme.gridFaint), lineWidth: 0.5)
        }
        var spokes = Path()
        var ticks = Path()
        for azimuth in stride(from: 0.0, to: 360, by: 30) {
            let edge = SkyPlotProjection.point(azimuthDegrees: azimuth, elevationDegrees: 0)
            let outer = CGPoint(x: center.x + edge.x * radius, y: center.y + edge.y * radius)
            if azimuth.truncatingRemainder(dividingBy: 90) == 0 {
                spokes.move(to: center)
                spokes.addLine(to: outer)
            } else {
                ticks.move(to: outer)
                ticks.addLine(to: CGPoint(x: center.x + edge.x * (radius - 4), y: center.y + edge.y * (radius - 4)))
            }
        }
        context.stroke(spokes, with: .color(Theme.gridFaint), lineWidth: 0.5)
        context.stroke(ticks, with: .color(Theme.grid), lineWidth: 0.5)

        // Ring labels beside the north spoke; cardinal letters just inside the horizon.
        for elevation in [30.0, 60.0] {
            let y = center.y - radius * SkyPlotProjection.radius(elevationDegrees: elevation)
            context.draw(Text("\(Int(elevation))").font(Theme.mono(7)).foregroundColor(Theme.textDim),
                         at: CGPoint(x: center.x + 2, y: y + 1), anchor: .topLeading)
        }
        let inset = radius - 7
        for (letter, dx, dy) in [("N", 0.0, -1.0), ("E", 1.0, 0.0), ("S", 0.0, 1.0), ("W", -1.0, 0.0)] {
            context.draw(Text(letter).font(Theme.mono(8, .semibold))
                            .foregroundColor(letter == "N" ? Theme.text : Theme.textDim),
                         at: CGPoint(x: center.x + dx * inset, y: center.y + dy * inset))
        }
    }

    private func drawSatellites(in context: inout GraphicsContext, center: CGPoint, radius: CGFloat) {
        let opacity = dimmed ? 0.55 : 1
        // Lowest first, so the higher (better-placed) satellites draw on top.
        for position in positions.reversed() {
            let unit = SkyPlotProjection.point(azimuthDegrees: position.azimuthDegrees,
                                               elevationDegrees: position.elevationDegrees)
            let point = CGPoint(x: center.x + unit.x * radius, y: center.y + unit.y * radius)
            let constellation = position.identity.constellation
            let marker = constellation.markerPath.applying(
                CGAffineTransform(translationX: point.x, y: point.y).scaledBy(x: Self.markerSize, y: Self.markerSize))
            context.fill(marker, with: .color(constellation.color.opacity(opacity)))
            context.stroke(marker, with: .color(.black), lineWidth: 0.5)

            // Labels sit right of the marker, or left near the east edge so they stay on screen.
            let onLeft = unit.x > 0.55
            context.draw(Text(position.identity.label).font(Theme.mono(8, .medium))
                            .foregroundColor(Theme.text.opacity(opacity)),
                         at: CGPoint(x: point.x + (onLeft ? -5 : 5), y: point.y),
                         anchor: onLeft ? .trailing : .leading)
        }
    }
}

// MARK: - Readouts

/// Four readouts in the corners the circle leaves free: count above mask, UTC, fix accuracy, orbit age.
private struct CornerReadouts: View {
    let model: SkyPlotViewModel

    var body: some View {
        VStack {
            HStack(alignment: .top) {
                readout("PRED ≥\(Int(model.elevationMaskDegrees))°",
                        model.snapshot.map { String(format: "%02d", $0.visible.count) } ?? "--")
                Spacer()
                TimelineView(.everyMinute) { context in
                    readout("UTC", context.date.utcClock, trailing: true)
                }
            }
            Spacer()
            HStack(alignment: .bottom) {
                readout("FIX", fixText, caution: model.fix == nil)
                Spacer()
                readout("ORB", orbitText, trailing: true, caution: orbitFreshness != .fresh)
            }
        }
        .allowsHitTesting(false)
    }

    private var fixText: String {
        guard let fix = model.fix else { return model.isAcquiringFix ? "ACQ" : "--" }
        let accuracy = fix.horizontalAccuracy
        return accuracy < 1000 ? "±\(Int(accuracy.rounded()))m" : String(format: "±%.0fkm", accuracy / 1000)
    }

    private var orbitFreshness: Freshness { model.catalog?.freshness(at: Date()) ?? .stale }

    private var orbitText: String {
        guard let epoch = model.catalog?.medianEpoch else { return model.isDownloadingOrbits ? "DL" : "--" }
        return Duration.seconds(Date().timeIntervalSince(epoch)).compactAge
    }

    private func readout(_ label: String, _ value: String, trailing: Bool = false, caution: Bool = false) -> some View {
        VStack(alignment: trailing ? .trailing : .leading, spacing: 0) {
            Text(label).font(Theme.mono(7)).foregroundStyle(Theme.textDim)
            Text(value).font(Theme.mono(11, .semibold)).foregroundStyle(caution ? Theme.caution : Theme.text)
        }
    }
}

/// Per-constellation counts above the mask, each keyed by its plot marker.
private struct ConstellationCounts: View {
    let counts: [Constellation: Int]

    var body: some View {
        Grid(horizontalSpacing: 6, verticalSpacing: 1) {
            ForEach([Array(Constellation.allCases.prefix(3)), Array(Constellation.allCases.suffix(3))], id: \.self) { row in
                GridRow {
                    ForEach(row, id: \.self) { constellation in
                        HStack(spacing: 2) {
                            MarkerGlyph(constellation: constellation, size: 6)
                            Text(constellation.abbreviation)
                                .foregroundStyle(Theme.textDim)
                            Text(String(format: "%02d", counts[constellation] ?? 0))
                                .foregroundStyle(Theme.text)
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(constellation.name) \(counts[constellation] ?? 0)")
                    }
                }
            }
        }
        .font(Theme.mono(9))
        .minimumScaleFactor(0.7)
        .lineLimit(1)
    }
}

// MARK: - Formatting

extension Date {
    /// "14:02"
    var utcClock: String {
        let c = Calendar(identifier: .gregorian).dateComponents(in: TimeZone(identifier: "UTC")!, from: self)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }
}

extension Duration {
    /// "42m", "18h", "4d": coarse ages for a narrow readout.
    var compactAge: String {
        let seconds = max(0, components.seconds)
        switch seconds {
        case ..<3600: return "\(seconds / 60)m"
        case ..<(2 * 86_400): return "\(seconds / 3600)h"
        default: return "\(seconds / 86_400)d"
        }
    }
}
