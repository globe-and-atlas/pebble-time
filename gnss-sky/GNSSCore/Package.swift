// swift-tools-version:5.9
// GNSSCore holds every calculation the watch app makes, with no UI or
// Core Location dependency, so it builds and tests on macOS and Linux alike.
import PackageDescription

let package = Package(
    name: "GNSSCore",
    platforms: [.watchOS(.v10), .iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "GNSSCore", targets: ["GNSSCore"]),
    ],
    targets: [
        .target(name: "GNSSCore"),
        .testTarget(
            name: "GNSSCoreTests",
            dependencies: ["GNSSCore"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
