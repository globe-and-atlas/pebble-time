import Foundation
import GNSSCore

/// Keeps one orbital catalog on hand: the cached copy at launch, a fresh download when the
/// refresh policy says one is due. The watch never needs a connection to show a plot once a
/// catalog has been downloaded; it only needs one to keep the elements current.
@MainActor
final class OrbitalDataService {
    private let source: any EphemerisSource
    private let store: EphemerisStore
    private var lastFailure: Date?

    private(set) var catalog: OrbitalCatalog?
    private var isDownloading = false

    init(source: any EphemerisSource = CelesTrakSource(),
         store: EphemerisStore = EphemerisStore(directory: .applicationSupportDirectory)) {
        self.source = source
        self.store = store
        catalog = store.load()
    }

    /// Downloads a new catalog if one is due and no recent attempt failed. Returns the new catalog,
    /// or nil when nothing changed. A failure keeps the cached catalog in service.
    func refreshIfDue(now: Date = Date()) async -> OrbitalCatalog? {
        guard !isDownloading, RefreshPolicy.isDue(catalog, now: now) else { return nil }
        if let lastFailure, now.timeIntervalSince(lastFailure) < RefreshPolicy.retryInterval { return nil }
        isDownloading = true
        defer { isDownloading = false }
        do {
            let fresh = try await source.fetchCatalog()
            try? store.save(fresh)
            catalog = fresh
            lastFailure = nil
            return fresh
        } catch {
            lastFailure = now
            return nil
        }
    }
}
