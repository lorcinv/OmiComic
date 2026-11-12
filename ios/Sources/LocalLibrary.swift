import Foundation
import UIKit
import PDFKit
import ImageIO
import CryptoKit

final class LocalLibrary {
    let queue = DispatchQueue(label: "io.omicomic.files", qos: .userInitiated)
    private let fm = FileManager.default
    let store: URL
    private let mediaFolder: URL
    private var grants: [String: Data] = [:]
    private var roots: [String: URL] = [:]
    private var media: [String: URL] = [:]
    private var mediaKeys: [String: String] = [:]
    private var documents: [String: URL] = [:]
    private var epubs: [String: EPUBBook] = [:]
    private var pdfs: [String: PDFDocument] = [:]
    private var archives: [String: [ArchiveReader.Entry]] = [:]
    var external: [String] = []
    private let cancellation = NSLock()
    private var scanCancelled = false

    init(store: URL? = nil) throws {
        self.store = store ?? fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("OmiComic", isDirectory: true)
        mediaFolder = fm.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("OmiComicMedia", isDirectory: true)
        try fm.createDirectory(at: self.store, withIntermediateDirectories: true)
        try fm.createDirectory(at: mediaFolder, withIntermediateDirectories: true)
        if let data = try? Data(contentsOf: self.store.appendingPathComponent("grants.json")), let saved = try? JSONDecoder().decode([String: Data].self, from: data) {
            grants = saved
            for (id, bookmark) in saved {
                var stale = false
                if let url = try? URL(resolvingBookmarkData: bookmark, options: [.withoutUI], relativeTo: nil, bookmarkDataIsStale: &stale) {
                    _ = url.startAccessingSecurityScopedResource(); roots[id] = url
                    if stale, let renewed = try? url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil) { grants[id] = renewed }
                }
            }
            try saveGrants()
        }
    }
    deinit { for url in roots.values { url.stopAccessingSecurityScopedResource() } }
    private func saveGrants() throws { try JSONEncoder().encode(grants).write(to: store.appendingPathComponent("grants.json"), options: .atomic) }
    func grant(_ url: URL) throws -> String {
        if let old = roots.first(where: { $0.value.standardizedFileURL == url.standardizedFileURL }) { return "/local/\(old.key)/\(url.lastPathComponent)" }
        _ = url.startAccessingSecurityScopedResource()
        do {
            let bookmark = try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
            let id = UUID().uuidString
            grants[id] = bookmark; roots[id] = url
            do { try saveGrants() } catch { grants[id] = nil; roots[id] = nil; throw error }
            return "/local/\(id)/\(url.lastPathComponent)"
        } catch { url.stopAccessingSecurityScopedResource(); throw error }
    }
    func resolve(_ path: String) throws -> URL {
        let parts = path.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        guard parts.count >= 4, parts[0] == "", parts[1] == "local", let root = roots[parts[2]], parts[3] == root.lastPathComponent,
              !parts.dropFirst(3).contains(where: { $0 == ".." || $0 == "." || $0.isEmpty || $0.contains("\0") || $0.contains("\\") }) else { throw OmiError("目录授权已失效，请重新选择文件夹。") }
        let url = parts.dropFirst(4).reduce(root) { $0.appendingPathComponent($1) }.standardizedFileURL
        let physicalRoot = root.resolvingSymlinksInPath().path
        let physical = url.resolvingSymlinksInPath().path
        guard physical == physicalRoot || physical.hasPrefix(physicalRoot + "/") else { throw OmiError("文件链接指向未授权目录。") }
        return url
    }
    private func coordinated<T>(_ url: URL, _ read: (URL) throws -> T) throws -> T {
        let coordinator = NSFileCoordinator()
        var error: NSError?
        var result: Result<T, Error>?
        coordinator.coordinate(readingItemAt: url, options: [], error: &error) { actual in result = Result { try read(actual) } }
        if let error { throw error }
        guard let result else { throw OmiError("文件提供程序没有返回内容。") }
        return try result.get()
    }
    static func kind(_ url: URL, directory: Bool = false) -> String {
        if directory { return "folder" }
        switch url.pathExtension.lowercased() {
        case "jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "tif", "tiff": return "image"
        case "zip", "cbz", "rar", "cbr", "7z", "cb7": return "archive"
        case "pdf": return "pdf"
        case "epub": return "epub"
        case "mobi": return "mobi"
        default: return "unknown"
        }
    }
    private func info(_ url: URL, path: String) throws -> [String: Any] {
        let values = try url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey, .contentModificationDateKey])
        return ["id": path, "name": url.lastPathComponent, "path": path, "type": Self.kind(url, directory: values.isDirectory == true), "extension": url.pathExtension.lowercased(), "size": values.fileSize ?? 0, "modifiedAt": (values.contentModificationDate?.timeIntervalSince1970 ?? 0) * 1000]
    }
    private func children(_ path: String) throws -> [[String: Any]] {
        let url = try resolve(path)
        return try coordinated(url) { actual in
            let entries = try fm.contentsOfDirectory(at: actual, includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey, .contentModificationDateKey], options: .skipsHiddenFiles)
            guard entries.count <= 30000 else { throw OmiError("目录内容过多，请选择较小的子目录。") }
            return try entries.compactMap { child -> [String: Any]? in
                let childPath = path + "/" + child.lastPathComponent
                guard (try? resolve(childPath)) != nil else { return nil }
                let item = try info(child, path: childPath)
                return item["type"] as? String == "unknown" ? nil : item
            }.sorted { ($0["name"] as! String).localizedStandardCompare($1["name"] as! String) == .orderedAscending }
        }
    }
    private func archiveEntries(_ path: String) throws -> [ArchiveReader.Entry] {
        let url = try resolve(path)
        let values = try url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
        let key = path + ":\(values.fileSize ?? 0):\(values.contentModificationDate?.timeIntervalSince1970 ?? 0)"
        if let cached = archives[key] { return cached }
        let entries = try coordinated(url) { try ArchiveReader.entries($0) }
        if archives.count >= 16 { archives.removeAll() }; archives[key] = entries
        return entries
    }
    private func pages(_ path: String) throws -> [String: Any] {
        let url = try resolve(path), item = try info(url, path: path), type = item["type"] as! String
        var pages: [[String: Any]] = []
        if type == "folder" || type == "image" {
            let files = type == "folder" ? try children(path).filter { $0["type"] as? String == "image" } : [item]
            pages = files.enumerated().map { index, file in ["index": index, "name": file["name"]!, "sourcePath": file["path"]!, "type": "folder-image", "modifiedAt": file["modifiedAt"]!] }
        } else if type == "archive" {
            pages = try archiveEntries(path).filter { Self.kind(URL(fileURLWithPath: $0.name)) == "image" }.enumerated().map { index, entry in ["index": index, "name": entry.name, "sourcePath": path, "archiveInnerPath": entry.name, "type": "archive-image"] }
        } else if !["pdf", "epub", "mobi"].contains(type) { throw OmiError("不支持此文件格式。") }
        if pages.isEmpty && !["pdf", "epub", "mobi"].contains(type) { throw OmiError("NO_IMAGES:未在该文件夹中找到可阅读图片。") }
        let key = "\(type == "image" ? "folder" : type):\(path)"
        return ["key": key, "resourceKey": key, "title": url.lastPathComponent, "sourcePath": path, "sourceType": type, "pages": pages, "total": pages.count]
    }
    private func imageData(_ path: String, entry: String? = nil) throws -> Data {
        let url = try resolve(path)
        return try coordinated(url) { actual in
            if let entry { return try ArchiveReader.read(actual, entry: entry) }
            guard (try actual.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max) <= 128 * 1024 * 1024 else { throw OmiError("图片文件超过 128 MB。") }
            return try Data(contentsOf: actual, options: .mappedIfSafe)
        }
    }
    private func publish(_ data: Data, key: String, suffix: String = "jpg") throws -> String {
        let contentKey = key + ":" + SHA256.hash(data: data).description
        if let existing = mediaKeys[contentKey], media[existing] != nil { return "omi://app/media/\(existing)" }
        // Derived previews are disposable; bound disk usage, retaining the most recent files.
        let files = try fm.contentsOfDirectory(at: mediaFolder, includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey])
        var total = files.reduce(0) { $0 + ((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
        if total > 384 * 1024 * 1024 {
            for file in files.sorted(by: { ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) < ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) }) {
                if total < 256 * 1024 * 1024 { break }
                total -= (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                try? fm.removeItem(at: file)
                media = media.filter { $0.value != file }
            }
        }
        let id = UUID().uuidString, url = mediaFolder.appendingPathComponent(id + "." + suffix)
        try data.write(to: url, options: .atomic)
        media[id] = url; mediaKeys[contentKey] = id
        if mediaKeys.count > 2048 { mediaKeys.removeAll() }
        return "omi://app/media/\(id)"
    }
    private func raster(_ data: Data, key: String, preview: Bool) throws -> [String: Any] {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any], let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int, width > 0, height > 0, width <= 100000, height <= 100000 else { throw OmiError("图片无法解码。") }
        // Bound decoded memory by pixels, retaining readable width on tall comic pages.
        let ratio = min(1.0, sqrt(16_000_000.0 / (Double(width) * Double(height))), 4096.0 / Double(min(width, height)), 24000.0 / Double(max(width, height)))
        let edge = preview ? 512 : max(1, Int(Double(max(width, height)) * ratio))
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: edge, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceShouldCacheImmediately: true] as CFDictionary), let encoded = UIImage(cgImage: image).jpegData(compressionQuality: preview ? 0.82 : 0.94) else { throw OmiError("图片解码失败。") }
        return ["url": try publish(encoded, key: key + ":\(edge)"), "width": image.width, "height": image.height, "encodedBytes": encoded.count]
    }
    func cancelScan() { cancellation.lock(); scanCancelled = true; cancellation.unlock() }
    private func checkScan() throws { cancellation.lock(); let cancelled = scanCancelled; cancellation.unlock(); if cancelled { throw OmiError("扫描已取消。") } }
    func bytesForURL(_ url: URL) throws -> (Data, String) {
        if url.path.hasPrefix("/media/") {
            guard let file = media[url.lastPathComponent] else { throw OmiError("图片缓存已失效。") }
            return (try Data(contentsOf: file), "image/jpeg")
        }
        if url.path.hasPrefix("/documents/") {
            let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
            let begin = Int(query.first(where: { $0.name == "begin" })?.value ?? "") ?? -1
            let end = Int(query.first(where: { $0.name == "end" })?.value ?? "") ?? -1
            guard let file = documents[url.lastPathComponent], begin >= 0, end > begin, end - begin <= 16 * 1024 * 1024 else { throw OmiError("文档读取范围无效。") }
            let handle = try FileHandle(forReadingFrom: file); defer { try? handle.close() }
            try handle.seek(toOffset: UInt64(begin)); let data = try handle.read(upToCount: end - begin) ?? Data()
            guard data.count == end - begin else { throw OmiError("文档读取中断。") }
            return (data, "application/octet-stream")
        }
        throw OmiError("资源不存在。")
    }
    private func json(_ name: String) throws -> Any {
        let path = store.appendingPathComponent(name)
        return fm.fileExists(atPath: path.path) ? try JSONSerialization.jsonObject(with: Data(contentsOf: path)) : NSNull()
    }
    private func save(_ value: Any, _ name: String) throws {
        let bytes = try JSONSerialization.data(withJSONObject: value)
        guard bytes.count <= 64 * 1024 * 1024 else { throw OmiError("应用数据超过保存上限。") }
        try bytes.write(to: store.appendingPathComponent(name), options: .atomic)
    }
    private func pdfPage(_ pdf: PDFDocument, index: Int, key: String, preview: Bool) throws -> [String: Any] {
        guard let page = pdf.page(at: index) else { throw OmiError("PDF 页面不存在。") }
        let bounds = page.bounds(for: .cropBox)
        guard bounds.width > 0, bounds.height > 0 else { throw OmiError("PDF 页面尺寸无效。") }
        let scale = (preview ? 512.0 : 2560.0) / max(bounds.width, bounds.height)
        let size = CGSize(width: max(1, bounds.width * scale), height: max(1, bounds.height * scale))
        let image = page.thumbnail(of: size, for: .cropBox)
        guard let data = image.jpegData(compressionQuality: 0.94) else { throw OmiError("PDF 页面渲染失败。") }
        return ["url": try publish(data, key: key + ":\(index):\(preview)"), "width": Int(image.size.width * image.scale), "height": Int(image.size.height * image.scale)]
    }
    func call(_ method: String, _ args: [String: Any]) throws -> Any {
        func string(_ name: String) throws -> String { guard let value = args[name] as? String, !value.isEmpty else { throw OmiError("缺少参数 \(name)。") }; return value }
        switch method {
        case "loadData": return try json("data.json")
        case "saveData": try save(args["data"] ?? [:], "data.json"); return NSNull()
        case "backupData": try save(args["data"] ?? [:], "backup.json"); return NSNull()
        case "importDataBackup": try save(args["before"] ?? [:], "import-backup.json"); try save(args["data"] ?? [:], "data.json"); return NSNull()
        case "hasDataImportBackup": return fm.fileExists(atPath: store.appendingPathComponent("import-backup.json").path)
        case "restoreDataBackup": let data = try json("import-backup.json"); guard !(data is NSNull) else { throw OmiError("没有可恢复的备份。") }; try save(data, "data.json"); return data
        case "takeExternalFile": return external.isEmpty ? NSNull() : external.removeFirst() as Any
        case "listDirectory": let path = try string("path"), items = try children(path); return ["path": path, "parentPath": path.split(separator: "/").count > 3 ? (path as NSString).deletingLastPathComponent as Any : NSNull(), "items": items, "total": items.count]
        case "scanLibrary":
            cancellation.lock(); scanCancelled = false; cancellation.unlock()
            var pending = [try string("path")], output: [[String: Any]] = [], directories = 0, skipped = 0
            var visited = Set<String>()
            let excluded = args["excludedPaths"] as? [String] ?? [], deadline = Date().addingTimeInterval(60)
            while let path = pending.popLast() {
                try checkScan()
                guard Date() < deadline, output.count < 30000 else { throw OmiError("目录扫描超过上限，请选择较小的子目录。") }
                if excluded.contains(where: { path == $0 || path.hasPrefix($0 + "/") }) { continue }
                if let physical = try? resolve(path).resolvingSymlinksInPath().path, !visited.insert(physical).inserted { continue }
                let list: [[String: Any]]
                do { list = try children(path) } catch { skipped += 1; continue }
                directories += 1
                for item in list {
                    if item["type"] as? String == "folder" { pending.append(item["path"] as! String) }
                    if args["booksOnly"] as? Bool != true || item["type"] as? String != "image" { output.append(item) }
                }
            }
            return ["items": output, "directories": directories, "skipped": skipped, "scannedAt": Date().timeIntervalSince1970 * 1000, "complete": true]
        case "getResourcePages": return try pages(string("path"))
        case "getReadablePageCount":
            let path = try string("path"), url = try resolve(path)
            if Self.kind(url) == "pdf" { return PDFDocument(url: url)?.pageCount as Any? ?? NSNull() }
            if Self.kind(url) == "epub" { return try EPUBBook(url).chapters.count }
            if Self.kind(url) == "mobi" { return NSNull() }
            return try pages(path)["total"] ?? 0
        case "checkResourcePath":
            do { let url = try resolve(string("path")); let values = try url.resourceValues(forKeys: [.isReadableKey, .isDirectoryKey]); return ["exists": true, "readable": values.isReadable ?? true, "isDirectory": values.isDirectory ?? false] }
            catch { return ["exists": false, "readable": false, "isDirectory": false, "reason": error.localizedDescription] }
        case "getPageImage":
            let path = try string("sourcePath"), inner = args["archiveInnerPath"] as? String
            return try raster(imageData(path, entry: inner), key: path + ":" + (inner ?? ""), preview: args["preview"] as? Bool == true)
        case "getThumbnail", "getBookmarkPagePreview":
            let path = try string(method == "getThumbnail" ? "path" : "sourcePath"), url = try resolve(path), item = try info(url, path: path)
            let type = item["type"] as! String
            if ["epub", "mobi"].contains(type) { return ["url": NSNull(), "pdfPath": path] }
            var image: [String: Any]
            if type == "pdf" {
                guard let pdf = PDFDocument(url: url) else { throw OmiError("PDF 无法打开。") }
                image = try pdfPage(pdf, index: args["pageIndex"] as? Int ?? 0, key: path, preview: true)
            } else {
                let resource: [String: Any]
                do { resource = try pages(path) } catch { if type == "folder" { return ["url": NSNull(), "emptyFolder": true, "itemCount": 0] }; throw error }
                let list = resource["pages"] as! [[String: Any]], index = min(max(0, args["pageIndex"] as? Int ?? 0), list.count - 1), page = list[index]
                image = try raster(imageData(page["sourcePath"] as! String, entry: args["archiveInnerPath"] as? String ?? page["archiveInnerPath"] as? String), key: path + ":\(index)", preview: true)
                image["itemCount"] = list.count
            }
            if method == "getBookmarkPagePreview" { return ["dataUrl": image["url"]!] }
            return image
        case "refreshThumbnails": mediaKeys.removeAll(); archives.removeAll(); return NSNull()
        case "releaseReaderResource": return NSNull()
        case "openDocument":
            let path = try string("path"), id = try string("id"), url = try resolve(path), type = try string("type")
            guard documents.count < 16 || documents[id] != nil else { throw OmiError("打开的文档过多，请关闭后重试。") }
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size > 0, size <= 2 * 1024 * 1024 * 1024, Self.kind(url) == type else { throw OmiError("文档格式无效或超过 2 GB。") }
            var result: [String: Any] = ["size": size, "chapters": []]
            if type == "pdf" {
                guard let pdf = PDFDocument(url: url), !pdf.isLocked else { throw OmiError("PDF 无法打开或需要密码。") }
                pdfs[id] = pdf; result["nativePdf"] = true
                result["chapters"] = (0..<pdf.pageCount).map { ["index": $0, "name": "\($0 + 1)"] as [String: Any] }
            } else if type == "epub" {
                let book = try coordinated(url) { try EPUBBook($0) }; epubs[id] = book
                result["chapters"] = book.chapters.enumerated().map { ["index": $0.offset, "name": URL(fileURLWithPath: $0.element).deletingPathExtension().lastPathComponent, "fixedLayout": book.fixedLayout] as [String: Any] }
            }
            documents[id] = url; return result
        case "readDocumentChapter":
            let id = try string("id"), index = args["index"] as? Int ?? -1
            guard let book = epubs[id], book.chapters.indices.contains(index) else { throw OmiError("章节不存在。") }
            let html = try ArchiveReader.read(book.url, entry: book.chapters[index], limit: 8 * 1024 * 1024)
            guard let source = String(data: html, encoding: .utf8) else { throw OmiError("章节编码不受支持。") }
            let json = try JSONSerialization.data(withJSONObject: ["html": source, "path": id, "entry": book.chapters[index]])
            return String(decoding: json, as: UTF8.self)
        case "epubImage":
            let id = try string("path")
            guard let book = epubs[id] else { throw OmiError("文档已关闭。") }
            let entry = try EPUBBook.resolve(string("entry"), string("href"))
            return try raster(ArchiveReader.read(book.url, entry: entry), key: book.url.path + ":" + entry, preview: false)
        case "renderDocumentPage":
            let id = try string("id")
            guard let pdf = pdfs[id] else { throw OmiError("文档已关闭。") }
            return try pdfPage(pdf, index: args["index"] as? Int ?? -1, key: documents[id]!.path, preview: args["preview"] as? Bool == true)
        case "closeDocument": let id = try string("id"); documents[id] = nil; epubs[id] = nil; pdfs[id] = nil; return NSNull()
        case "changeLocalResource":
            let path = try string("path"), url = try resolve(path), action = try string("action")
            guard path.split(separator: "/").count > 3 else { throw OmiError("请在文件 App 中修改已授权的根目录。") }
            if action == "rename" {
                let name = try string("name")
                guard ![".", ".."].contains(name), !name.contains("/"), !name.contains("\\"), !name.contains("\0") else { throw OmiError("文件名无效。") }
                let target = url.deletingLastPathComponent().appendingPathComponent(name)
                try fm.moveItem(at: url, to: target); archives.removeAll(); mediaKeys.removeAll()
                return ["newPath": (path as NSString).deletingLastPathComponent + "/" + name]
            }
            if action == "trash" {
                let trash = store.appendingPathComponent("RecentlyDeleted", isDirectory: true)
                try fm.createDirectory(at: trash, withIntermediateDirectories: true)
                try fm.moveItem(at: url, to: trash.appendingPathComponent(UUID().uuidString + "-" + url.lastPathComponent))
                return ["newPath": NSNull()]
            }
            throw OmiError("未知文件操作。")
        default: throw OmiError("此操作暂不可用：\(method)。")
        }
    }
}
