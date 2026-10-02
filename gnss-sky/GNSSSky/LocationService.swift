import CoreLocation
import GNSSCore

/// The observer position, plus what Core Location says about its quality. This is the whole of
/// what watchOS exposes about the GNSS fix: no satellites, signal levels or DOP (see
/// docs/watchOS-GNSS-capabilities.md).
struct ObserverFix: Sendable, Equatable {
    let observer: Observer
    let horizontalAccuracy: CLLocationAccuracy
    let timestamp: Date

    init(_ location: CLLocation) {
        observer = Observer(
            latitudeDegrees: location.coordinate.latitude,
            longitudeDegrees: location.coordinate.longitude,
            // A negative vertical accuracy marks the altitude invalid. Height barely moves a
            // look angle to a satellite 20 000 km away, so sea level is a safe fallback.
            ellipsoidalHeightMeters: location.verticalAccuracy >= 0 ? location.ellipsoidalAltitude : 0)
        horizontalAccuracy = location.horizontalAccuracy
        timestamp = location.timestamp
    }
}

/// Acquires observer fixes in short sessions instead of tracking continuously.
///
/// A sky plot barely needs the observer's position: moving 10 km shifts a GNSS satellite's look
/// angle by about 0.03°, a tenth of a pixel. So the receiver is switched on until one good fix
/// arrives (or a timeout), then off again. See docs/architecture.md, "Power".
@MainActor
final class LocationService {
    private let manager = CLLocationManager()

    var isAuthorizationDenied: Bool {
        [.denied, .restricted].contains(manager.authorizationStatus)
    }

    /// Streams improving fixes to `onFix` until one is within `targetAccuracy` metres, `timeout`
    /// passes, or the calling task is cancelled; then the location session ends.
    func acquireFix(targetAccuracy: CLLocationAccuracy = 50,
                    timeout: Duration = .seconds(45),
                    onFix: @escaping @MainActor (ObserverFix) -> Void) async {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        let session = Task { @MainActor in
            var best: CLLocationAccuracy = .infinity
            do {
                for try await update in CLLocationUpdate.liveUpdates() {
                    guard let location = update.location, location.horizontalAccuracy >= 0 else { continue }
                    if location.horizontalAccuracy <= best {
                        best = location.horizontalAccuracy
                        onFix(ObserverFix(location))
                    }
                    if best <= targetAccuracy { return }
                }
            } catch {
                // Updates end on cancellation or a Core Location failure; the last fix stands.
            }
        }
        let watchdog = Task {
            try? await Task.sleep(for: timeout)
            session.cancel()
        }
        await withTaskCancellationHandler {
            await session.value
        } onCancel: {
            session.cancel()
        }
        watchdog.cancel()
    }
}
