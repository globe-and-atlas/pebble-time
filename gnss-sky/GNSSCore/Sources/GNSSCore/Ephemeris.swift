@preconcurrency import Foundation
#if canImport(FoundationNetworking)
@preconcurrency import FoundationNetworking
#endif

/// Anything that can supply orbital data. CelesTrak element sets today; a companion iPhone
/// app, an offline package or broadcast almanacs can conform later without touching the engines.
public protocol EphemerisSource: Sendable {
    func fetchCatalog() async throws -> OrbitalCatalog
}

/// CelesTrak general-perturbation element sets, fetched as TLE text.
///
/// "gnss" covers GPS, GLONASS, Galileo, BeiDou and QZSS operational satellites (plus NavIC,
/// which the identifier drops). SBAS satellites are geostationary communication satellites
/// carrying a navigation payload and live in their own "sbas" group.
public struct CelesTrakSource: EphemerisSource {
    public struct Group: Sendable {
        public let name: String
        public let constellationHint: Constellation?
    }

    public static let defaultGroups = [Group(name: "gnss", constellationHint: nil),
                                       Group(name: "sbas", constellationHint: .sbas)]

    let groups: [Group]
    let session: URLSession

    public init(groups: [Group] = defaultGroups, session: URLSession = .shared) {
        self.groups = groups
        self.session = session
    }

    public static func url(for group: Group) -> URL {
        URL(string: "https://celestrak.org/NORAD/elements/gp.php?GROUP=\(group.name)&FORMAT=tle")!
    }

    public enum FetchError: Error { case badResponse(group: String, status: Int), empty(group: String) }

    public func fetchCatalog() async throws -> OrbitalCatalog {
        var records: [OrbitalCatalog.Record] = []
        for group in groups {
            let (data, response) = try await download(Self.url(for: group))
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard status == 200 else { throw FetchError.badResponse(group: group.name, status: status) }
            let sets = TwoLineElementSet.parseMany(String(decoding: data, as: UTF8.self))
            guard !sets.isEmpty else { throw FetchError.empty(group: group.name) }
            records += sets.map { OrbitalCatalog.Record(elements: $0, constellationHint: group.constellationHint) }
        }
        return OrbitalCatalog(retrievedAt: Date(), source: "CelesTrak GP", records: records)
    }

    // The callback API exists on every platform, including Linux, where tests build this file.
    private func download(_ url: URL) async throws -> (Data, URLResponse) {
        try await withCheckedThrowingContinuation { continuation in
            session.dataTask(with: url) { data, response, error in
                if let data, let response {
                    continuation.resume(returning: (data, response))
                } else {
                    continuation.resume(throwing: error ?? URLError(.badServerResponse))
                }
            }.resume()
        }
    }
}

/// On-device cache: the last good catalog survives relaunch and works with no connection.
public struct EphemerisStore: Sendable {
    public let fileURL: URL

    public init(directory: URL) {
        fileURL = directory.appendingPathComponent("orbital-catalog.json")
    }

    public func load() -> OrbitalCatalog? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(OrbitalCatalog.self, from: data)
    }

    public func save(_ catalog: OrbitalCatalog) throws {
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(),
                                                withIntermediateDirectories: true)
        try JSONEncoder().encode(catalog).write(to: fileURL, options: .atomic)
    }
}

/// When to go back to the network. Element sets are republished several times a day, but a
/// sky plot needs nothing like that: once a day keeps error far below a marker's width.
public enum RefreshPolicy {
    public static let downloadInterval: TimeInterval = 24 * 3600
    /// After a failed attempt, wait this long before trying again.
    public static let retryInterval: TimeInterval = 30 * 60

    public static func isDue(_ catalog: OrbitalCatalog?, now: Date) -> Bool {
        guard let catalog else { return true }
        return now.timeIntervalSince(catalog.retrievedAt) >= downloadInterval
    }
}
