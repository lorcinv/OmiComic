import UIKit
import WebKit
import UniformTypeIdentifiers

final class ReaderViewController: UIViewController, WKScriptMessageHandlerWithReply, WKURLSchemeHandler, WKNavigationDelegate, WKUIDelegate, UIDocumentPickerDelegate {
    private(set) var webView: WKWebView!
    private(set) var library: LocalLibrary!
    private var pickerReply: ((Any?, String?) -> Void)?
    private var pickerMode = ""
    private var stoppedTasks = Set<ObjectIdentifier>()
    private let taskLock = NSLock()
    private var fullscreen = false
    private var darkChrome = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.95, green: 0.95, blue: 0.94, alpha: 1)
        do { library = try LocalLibrary() } catch {
            let label = UILabel(frame: view.bounds); label.numberOfLines = 0; label.text = "启动失败：\(error.localizedDescription)"; view.addSubview(label); return
        }
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(self, forURLScheme: "omi")
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "omi")
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self; webView.uiDelegate = self
        webView.isOpaque = false; webView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        // The whole app viewport stays inside the notch and home indicator, also after rotation.
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor), webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
        let back = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(goBack(_:))); back.edges = .left; webView.addGestureRecognizer(back)
        webView.load(URLRequest(url: URL(string: "omi://app/index.html")!))
    }
    @objc private func goBack(_ gesture: UIScreenEdgePanGestureRecognizer) {
        if gesture.state == .ended && gesture.translation(in: webView).x > 70 { webView.evaluateJavaScript("window.dispatchEvent(new Event('omi-back'))") }
    }
    override var prefersHomeIndicatorAutoHidden: Bool { fullscreen }
    override var prefersStatusBarHidden: Bool { fullscreen }
    override var preferredStatusBarStyle: UIStatusBarStyle { darkChrome ? .lightContent : .darkContent }
    func lifecycle(_ name: String) { webView?.evaluateJavaScript("window.dispatchEvent(new Event('\(name)'))") }
    func openExternal(_ url: URL) {
        loadViewIfNeeded()
        library.queue.async { [weak self] in
            guard let self else { return }
            do {
                self.library.external.append(try self.library.grant(url))
                DispatchQueue.main.async { self.webView.evaluateJavaScript("window.dispatchEvent(new Event('omi-external-open'))") }
            } catch { DispatchQueue.main.async { self.showError(error.localizedDescription) } }
        }
    }
    private func showError(_ message: String) {
        let alert = UIAlertController(title: "OmiComic", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "好", style: .default)); present(alert, animated: true)
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == "omi", message.frameInfo.securityOrigin.host == "app",
              let body = message.body as? [String: Any], let method = body["method"] as? String else { replyHandler(nil, "无权访问文件服务。"); return }
        let args = body["args"] as? [String: Any] ?? [:]
        switch method {
        case "chooseFolder", "chooseFile", "readBackupFile", "exportBackupFile":
            guard pickerReply == nil else { replyHandler(nil, "文件选择器已经打开。"); return }
            pickerReply = replyHandler; pickerMode = method
            if method == "exportBackupFile" {
                guard let text = args["text"] as? String, text.utf8.count <= 64 * 1024 * 1024, let filename = args["filename"] as? String, !filename.contains("/"), !filename.contains("\\") else { finishPicker(nil, error: "备份内容无效。"); return }
                do {
                    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("OmiExport", isDirectory: true)
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    let file = folder.appendingPathComponent(filename); try text.write(to: file, atomically: true, encoding: .utf8)
                    let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true); picker.delegate = self; present(picker, animated: true)
                } catch { finishPicker(nil, error: error.localizedDescription) }
            } else {
                let picker = UIDocumentPickerViewController(forOpeningContentTypes: method == "chooseFolder" ? [.folder] : method == "readBackupFile" ? [.json] : [.item], asCopy: false)
                picker.allowsMultipleSelection = false; picker.delegate = self; present(picker, animated: true)
            }
        case "cancelLibraryScan": library.cancelScan(); replyHandler(NSNull(), nil)
        case "isFullscreen": replyHandler(fullscreen, nil)
        case "setFullscreen": fullscreen = args["enabled"] as? Bool == true; setNeedsUpdateOfHomeIndicatorAutoHidden(); setNeedsStatusBarAppearanceUpdate(); replyHandler(fullscreen, nil)
        case "setColorTheme":
            let theme = args["theme"] as? String ?? "mist"
            let colors = ["mist": 0xf8f8f7, "nord": 0xe2e8f2, "sand": 0xf3efe9, "night": 0x2e3440], rgb = colors[theme] ?? 0xf8f8f7
            view.backgroundColor = UIColor(red: CGFloat((rgb >> 16) & 255) / 255, green: CGFloat((rgb >> 8) & 255) / 255, blue: CGFloat(rgb & 255) / 255, alpha: 1)
            darkChrome = theme == "night"; setNeedsStatusBarAppearanceUpdate(); replyHandler(NSNull(), nil)
        case "setReaderChrome", "prepareEpubReaderViewport", "setReaderVolumeKeys": replyHandler(false, nil)
        case "background", "close": replyHandler(NSNull(), nil)
        default:
            library.queue.async { [weak self] in
                guard let self else { return }
                do { let result = try self.library.call(method, args); DispatchQueue.main.async { replyHandler(result, nil) } }
                catch { DispatchQueue.main.async { replyHandler(nil, error.localizedDescription) } }
            }
        }
    }
    private func finishPicker(_ result: Any?, error: String? = nil) {
        let reply = pickerReply; pickerReply = nil; pickerMode = ""; reply?(result ?? NSNull(), error)
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finishPicker(nil) }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { finishPicker(nil); return }
        let mode = pickerMode
        library.queue.async { [weak self] in
            guard let self else { return }
            do {
                let result: Any
                if mode == "readBackupFile" {
                    _ = url.startAccessingSecurityScopedResource(); defer { url.stopAccessingSecurityScopedResource() }
                    guard (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max) <= 64 * 1024 * 1024 else { throw OmiError("备份文件超过 64 MB。") }
                    result = try String(contentsOf: url, encoding: .utf8)
                } else if mode == "exportBackupFile" { result = url.lastPathComponent }
                else { result = try self.library.grant(url) }
                DispatchQueue.main.async { self.finishPicker(result) }
            } catch { DispatchQueue.main.async { self.finishPicker(nil, error: error.localizedDescription) } }
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "omi", url.host == "app", navigationAction.targetFrame?.isMainFrame != false {
            decisionHandler(url.path == "/index.html" ? .allow : .cancel); return
        }
        if navigationAction.targetFrame?.isMainFrame == false && ["about", "blob"].contains(url.scheme ?? "") { decisionHandler(.allow); return }
        if navigationAction.navigationType == .linkActivated, url.scheme == "https" { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.navigationType == .linkActivated, let url = navigationAction.request.url, url.scheme == "https" { UIApplication.shared.open(url) }
        return nil
    }
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let id = ObjectIdentifier(urlSchemeTask as AnyObject)
        taskLock.lock(); stoppedTasks.remove(id); taskLock.unlock()
        library.queue.async { [weak self] in
            guard let self else { return }
            let result = Result { () throws -> (Data, String) in
                guard let url = urlSchemeTask.request.url, url.scheme == "omi", url.host == "app" else { throw OmiError("资源地址无效。") }
                if url.path.hasPrefix("/media/") || url.path.hasPrefix("/documents/") { return try self.library.bytesForURL(url) }
                guard let base = Bundle.main.url(forResource: "dist-ios", withExtension: nil) else { throw OmiError("应用资源缺失。") }
                let path = url.path == "/" ? "index.html" : String(url.path.dropFirst())
                let file = base.appendingPathComponent(path).standardizedFileURL
                guard file.path.hasPrefix(base.path + "/"), !path.contains("..") else { throw OmiError("资源路径无效。") }
                let mime: String
                switch file.pathExtension {
                case "js", "mjs": mime = "application/javascript"
                case "css": mime = "text/css"
                case "html": mime = "text/html"
                case "json": mime = "application/json"
                case "wasm": mime = "application/wasm"
                case "svg": mime = "image/svg+xml"
                default: mime = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
                }
                return (try Data(contentsOf: file), mime)
            }
            DispatchQueue.main.async {
                self.taskLock.lock(); let stopped = self.stoppedTasks.remove(id) != nil; self.taskLock.unlock()
                guard !stopped else { return }
                switch result {
                case .success(let (data, mime)):
                    let response = HTTPURLResponse(url: urlSchemeTask.request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": mime, "Content-Length": String(data.count), "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store"] )!
                    urlSchemeTask.didReceive(response); urlSchemeTask.didReceive(data); urlSchemeTask.didFinish()
                case .failure(let error): urlSchemeTask.didFailWithError(error)
                }
            }
        }
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) { taskLock.lock(); stoppedTasks.insert(ObjectIdentifier(urlSchemeTask as AnyObject)); taskLock.unlock() }
}
