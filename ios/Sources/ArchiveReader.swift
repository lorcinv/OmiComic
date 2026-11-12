import Foundation
import libarchive

struct OmiError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

enum ArchiveReader {
    struct Entry { let name: String; let size: Int64 }
    static func validName(_ name: String) -> Bool {
        !name.hasPrefix("/") && !name.contains("\\") && !name.contains("\0") && !name.split(separator: "/").contains("..")
    }
    // Read selected entries in memory. Never extract archive paths into the filesystem.
    private static func walk(_ url: URL, visit: (OpaquePointer, Entry) throws -> Bool) throws {
        guard let archive = archive_read_new() else { throw OmiError("压缩包初始化失败。") }
        defer { archive_read_free(archive) }
        archive_read_support_filter_all(archive)
        archive_read_support_format_all(archive)
        guard archive_read_open_filename(archive, url.path, 64 * 1024) == ARCHIVE_OK else { throw OmiError("压缩包无法打开，可能已损坏或需要密码。") }
        var entry: OpaquePointer?
        var count = 0
        let deadline = Date().addingTimeInterval(30)
        while true {
            let status = archive_read_next_header(archive, &entry)
            if status == ARCHIVE_EOF { break }
            guard status >= ARCHIVE_WARN, let entry else { throw OmiError("压缩包目录读取失败。") }
            count += 1
            guard count <= 30000, Date() < deadline else { throw OmiError("压缩包内容过多，请拆分后打开。") }
            guard let raw = archive_entry_pathname_utf8(entry) ?? archive_entry_pathname(entry) else { continue }
            let name = String(cString: raw)
            if archive_entry_filetype(entry) == AE_IFREG && validName(name) && archive_entry_symlink(entry) == nil && archive_entry_hardlink(entry) == nil {
                if try visit(archive, Entry(name: name, size: archive_entry_size(entry))) { break }
            }
            archive_read_data_skip(archive)
        }
    }
    static func entries(_ url: URL) throws -> [Entry] {
        var entries: [Entry] = []
        try walk(url) { _, entry in entries.append(entry); return false }
        return entries.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
    static func read(_ url: URL, entry requested: String, limit: Int = 128 * 1024 * 1024) throws -> Data {
        guard validName(requested) else { throw OmiError("压缩包路径无效。") }
        var result: Data?
        try walk(url) { archive, entry in
            guard entry.name == requested else { return false }
            guard entry.size >= 0, entry.size <= Int64(limit) else { throw OmiError("压缩包内文件超过读取上限。") }
            var output = Data()
            var buffer = [UInt8](repeating: 0, count: 64 * 1024)
            let deadline = Date().addingTimeInterval(30)
            while true {
                let size = archive_read_data(archive, &buffer, buffer.count)
                if size == 0 { break }
                guard size > 0, output.count + size <= limit, Date() < deadline else { throw OmiError("压缩包文件无法读取或超过安全限制。") }
                output.append(contentsOf: buffer.prefix(size))
            }
            result = output
            return true
        }
        guard let result else { throw OmiError("压缩包内文件已不存在。") }
        return result
    }
}
