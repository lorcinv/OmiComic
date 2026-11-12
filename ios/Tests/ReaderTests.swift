import XCTest
import WebKit
@testable import OmiComic

final class ReaderTests: XCTestCase {
    private func fixture() throws -> URL {
        try XCTUnwrap(Bundle(for: Self.self).url(forResource: "TestFixtures", withExtension: nil))
    }
    func testAuthorizedFilesArchivesAndDocuments() throws {
        let temp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: temp, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: temp) }
        let library = try LocalLibrary(store: temp.appendingPathComponent("state")), root = try library.grant(fixture())
        XCTAssertThrowsError(try library.resolve(root + "/../../secret"))
        XCTAssertThrowsError(try library.resolve("/local/unknown/secret"))
        XCTAssertFalse(ArchiveReader.validName("../../secret"))
        for name in ["Sample.cbz", "RAR4.rar", "RAR5.cbr", "Seven.7z", "Solid.cb7"] {
            let resource = try XCTUnwrap(try library.call("getResourcePages", ["path": root + "/" + name]) as? [String: Any])
            let pages = try XCTUnwrap(resource["pages"] as? [[String: Any]])
            XCTAssertGreaterThan(pages.count, 0, name)
            let image = try XCTUnwrap(try library.call("getPageImage", pages[0]) as? [String: Any])
            let url = try XCTUnwrap(URL(string: image["url"] as! String))
            let (bytes, _) = try library.bytesForURL(url)
            XCTAssertNotNil(UIImage(data: bytes), name)
        }
        let pdf = try XCTUnwrap(try library.call("openDocument", ["path": root + "/three-pages.pdf", "type": "pdf", "id": "test-pdf"]) as? [String: Any])
        XCTAssertEqual((pdf["chapters"] as? [Any])?.count, 3)
        XCTAssertEqual(pdf["nativePdf"] as? Bool, true)
        _ = try library.call("renderDocumentPage", ["id": "test-pdf", "index": 2, "preview": false])
        let epub = try XCTUnwrap(try library.call("openDocument", ["path": root + "/Sample.epub", "type": "epub", "id": "test-epub"]) as? [String: Any])
        XCTAssertEqual((epub["chapters"] as? [Any])?.count, 1)
        let chapter = try XCTUnwrap(try library.call("readDocumentChapter", ["id": "test-epub", "index": 0]) as? String)
        XCTAssertTrue(chapter.contains("Omi iOS"))
        _ = try library.call("epubImage", ["path": "test-epub", "entry": "OPS/chapter.xhtml", "href": "page.jpg"])
        XCTAssertThrowsError(try EPUBBook.resolve("OPS/chapter.xhtml", "../../../private/image.png"))
        _ = try library.call("saveData", ["data": ["readingProgress": ["book": ["currentPageIndex": 2]]]])
        let reopened = try LocalLibrary(store: temp.appendingPathComponent("state"))
        XCTAssertEqual(try reopened.resolve(root), try library.resolve(root))
        XCTAssertNotNil((try reopened.call("loadData", [:]) as? [String: Any])?["readingProgress"])
    }

    @MainActor func testRealWebKitBridgeAndReader() async throws {
        let app = try XCTUnwrap(UIApplication.shared.delegate as? AppDelegate)
        let controller = try XCTUnwrap(app.window?.rootViewController as? ReaderViewController)
        controller.loadViewIfNeeded()
        let web = try XCTUnwrap(controller.webView)
        for _ in 0..<100 {
            if (try? await web.evaluateJavaScript("Boolean(window.omicomic && document.querySelector('.omi-home'))")) as? Bool == true { break }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        let info = try await web.callAsyncJavaScript("return await window.omicomic.getAppInfo()", arguments: [:], in: nil, contentWorld: .page) as? [String: Any]
        XCTAssertEqual(info?["platform"] as? String, "ios")
        let layout = try await web.evaluateJavaScript("document.documentElement.dataset.omiLayout") as? String
        XCTAssertEqual(layout, "mobile")
        let root = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String, Error>) in
            controller.library.queue.async { continuation.resume(with: Result { try controller.library.grant(self.fixture()) }) }
        }
        let added = try await web.callAsyncJavaScript("return await window.omicomic.addLibraryRoot({path, name:'Apple test'})", arguments: ["path": root], in: nil, contentWorld: .page) as? [String: Any]
        XCTAssertEqual(added?["ok"] as? Bool, true)
        let book = root + "/Sample.cbz"
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in controller.library.queue.async { controller.library.external.append(book); continuation.resume() } }
        _ = try await web.evaluateJavaScript("window.dispatchEvent(new Event('omi-external-open'))")
        var reading = false
        for _ in 0..<100 {
            reading = (try? await web.evaluateJavaScript("Boolean(document.querySelector('.reader-layout') && [...document.querySelectorAll('canvas')].some(c=>c.width>0 && c.height>0))")) as? Bool == true
            if reading { break }; try await Task.sleep(nanoseconds: 200_000_000)
        }
        XCTAssertTrue(reading, "Real WKWebView should open and paint the selected comic")
        let bounds = web.bounds
        XCTAssertGreaterThan(bounds.width, 300); XCTAssertGreaterThan(bounds.height, 300)
        let image = UIGraphicsImageRenderer(bounds: web.bounds).image { _ in web.drawHierarchy(in: web.bounds, afterScreenUpdates: true) }
        let attachment = XCTAttachment(image: image); attachment.name = "iOS-reader"; attachment.lifetime = .keepAlways; add(attachment)
    }
}
