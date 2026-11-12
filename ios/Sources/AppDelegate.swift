import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = ReaderViewController()
        self.window = window
        window.makeKeyAndVisible()
        return true
    }
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        (window?.rootViewController as? ReaderViewController)?.openExternal(url)
        return true
    }
    func applicationWillResignActive(_ application: UIApplication) { (window?.rootViewController as? ReaderViewController)?.lifecycle("omi-pause") }
    func applicationDidBecomeActive(_ application: UIApplication) { (window?.rootViewController as? ReaderViewController)?.lifecycle("omi-app-resume") }
}
