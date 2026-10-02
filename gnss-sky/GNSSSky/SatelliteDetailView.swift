import SwiftUI
import GNSSCore

/// One satellite, as predicted at the moment it was tapped.
struct SatelliteDetailView: View {
    let position: SkyPosition
    let computedAt: Date

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    MarkerGlyph(constellation: position.identity.constellation, size: 10)
                    Text(position.identity.label).font(Theme.mono(20, .semibold))
                    Spacer()
                }
                Text("PREDICTED · NOT RECEIVER DATA")
                    .font(Theme.mono(7))
                    .foregroundStyle(Theme.textDim)
                Divider()
                row("SYS", position.identity.constellation.name)
                row("AZ", String(format: "%05.1f°", position.azimuthDegrees))
                row("EL", String(format: "%04.1f°", position.elevationDegrees))
                row("RNG", String(format: "%.0f km", position.rangeKm))
                row("ELEM AGE", Duration.seconds(position.elementAge).compactAge,
                    caution: Freshness(elementAge: position.elementAge) != .fresh)
                row("AT", computedAt.utcClock + "Z")
                Divider()
                row("NORAD", String(position.identity.catalogNumber))
                Text(position.identity.objectName)
                    .font(Theme.mono(9))
                    .foregroundStyle(Theme.textDim)
                    .lineLimit(2)
            }
        }
        .foregroundStyle(Theme.text)
    }

    private func row(_ label: String, _ value: String, caution: Bool = false) -> some View {
        HStack {
            Text(label).foregroundStyle(Theme.textDim)
            Spacer()
            Text(value).foregroundStyle(caution ? Theme.caution : Theme.text)
        }
        .font(Theme.mono(11))
    }
}
