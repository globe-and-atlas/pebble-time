import SwiftUI

@main
struct GNSSSkyApp: App {
    var body: some Scene {
        WindowGroup {
            SkyPlotScreen()
                .preferredColorScheme(.dark)
        }
    }
}
