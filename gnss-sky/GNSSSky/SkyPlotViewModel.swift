import Foundation
import Observation
import GNSSCore

/// Orchestrates location, orbital data and the engines, at a pace set by what the wearer is doing.
///
/// | State                         | Satellite recompute | Location               | Orbital data      |
/// |-------------------------------|---------------------|------------------------|-------------------|
/// | Active (wrist up, app front)  | every 15 s          | one fix per 10 min     | daily, if due     |
/// | Inactive (wrist down, AOD)    | every 60 s          | off                    | off               |
/// | Background                    | none                | off                    | off               |
///
/// Satellites cross the sky at under 0.01°/s as seen from the ground, so 15 s moves a marker by a
/// fraction of a pixel; anything faster would spend battery on nothing visible.
@MainActor
@Observable
final class SkyPlotViewModel {
    enum Activity { case active, inactive, background }

    static let activeRecomputeInterval: Duration = .seconds(15)
    static let inactiveRecomputeInterval: Duration = .seconds(60)
    static let fixRefreshInterval: TimeInterval = 10 * 60

    private(set) var fix: ObserverFix?
    private(set) var snapshot: SkySnapshot?
    private(set) var catalog: OrbitalCatalog?
    private(set) var isAcquiringFix = false
    private(set) var isLocationDenied = false
    private(set) var isDownloadingOrbits = false
    var elevationMaskDegrees = VisibilityEngine.defaultElevationMaskDegrees

    @ObservationIgnored private var satellites: [CatalogSatellite] = []
    @ObservationIgnored private let location: LocationService
    @ObservationIgnored private let orbitalData: OrbitalDataService
    /// Set for previews: show the given state, start nothing.
    @ObservationIgnored private var isFrozen = false

    init(location: LocationService = LocationService(), orbitalData: OrbitalDataService = OrbitalDataService()) {
        self.location = location
        self.orbitalData = orbitalData
        setCatalog(orbitalData.catalog)
    }

    /// Runs for as long as the calling task (the view's `.task(id:)`) lives in this activity state.
    func run(_ activity: Activity) async {
        guard !isFrozen else { return }
        switch activity {
        case .background:
            return
        case .inactive:
            await recomputeLoop(every: Self.inactiveRecomputeInterval)
        case .active:
            async let orbits: Void = refreshOrbitsIfDue()
            async let fixes: Void = fixLoop()
            async let plot: Void = recomputeLoop(every: Self.activeRecomputeInterval)
            _ = await (orbits, fixes, plot)
        }
    }

    func recompute(at date: Date = Date()) {
        guard let observer = fix?.observer, !satellites.isEmpty else { snapshot = nil; return }
        let positions = SatelliteEngine.positions(of: satellites, from: observer, at: date)
        snapshot = VisibilityEngine.snapshot(of: positions, observer: observer, at: date,
                                             elevationMaskDegrees: elevationMaskDegrees)
    }

    private func recomputeLoop(every interval: Duration) async {
        while !Task.isCancelled {
            recompute()
            try? await Task.sleep(for: interval)
        }
    }

    private func fixLoop() async {
        while !Task.isCancelled {
            if fix.map({ Date().timeIntervalSince($0.timestamp) >= Self.fixRefreshInterval }) ?? true {
                isAcquiringFix = true
                await location.acquireFix { [weak self] fix in
                    guard let self else { return }
                    let isFirst = self.fix == nil
                    self.fix = fix
                    if isFirst { self.recompute() }
                }
                isAcquiringFix = false
                isLocationDenied = location.isAuthorizationDenied
            }
            // Without any fix yet (no sky, timeout indoors), try again soon rather than in 10 min.
            try? await Task.sleep(for: .seconds(fix == nil ? 60 : Self.fixRefreshInterval))
        }
    }

    private func refreshOrbitsIfDue() async {
        guard RefreshPolicy.isDue(catalog, now: Date()) else { return }
        isDownloadingOrbits = true
        defer { isDownloadingOrbits = false }
        if let fresh = await orbitalData.refreshIfDue() {
            setCatalog(fresh)
            recompute()
        }
    }

    private func setCatalog(_ catalog: OrbitalCatalog?) {
        self.catalog = catalog
        satellites = catalog?.satellites() ?? []
    }
}

#if DEBUG
extension SkyPlotViewModel {
    /// Previews only: a fixed sky that never touches Core Location or the network.
    static func preview(_ snapshot: SkySnapshot?, fix: ObserverFix? = nil, catalog: OrbitalCatalog? = nil) -> SkyPlotViewModel {
        let model = SkyPlotViewModel(orbitalData: OrbitalDataService(store: EphemerisStore(directory: .temporaryDirectory)))
        model.isFrozen = true
        model.snapshot = snapshot
        model.fix = fix
        model.catalog = catalog
        return model
    }
}
#endif
