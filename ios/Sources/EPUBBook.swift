import Foundation

final class XMLNodes: NSObject, XMLParserDelegate {
    var elements: [(String, [String: String])] = []
    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String]) {
        elements.append((name.components(separatedBy: ":").last ?? name, attributes))
        if elements.count > 30000 { parser.abortParsing() }
    }
    static func parse(_ data: Data) throws -> [(String, [String: String])] {
        let collector = XMLNodes(), parser = XMLParser(data: data)
        parser.shouldResolveExternalEntities = false
        parser.delegate = collector
        guard parser.parse(), collector.elements.count <= 30000 else { throw OmiError("EPUB 目录格式无效。") }
        return collector.elements
    }
}

struct EPUBBook {
    let url: URL
    let chapters: [String]
    let fixedLayout: Bool
    init(_ url: URL) throws {
        self.url = url
        let container = try XMLNodes.parse(ArchiveReader.read(url, entry: "META-INF/container.xml", limit: 1024 * 1024))
        guard let package = container.first(where: { $0.0 == "rootfile" })?.1["full-path"], ArchiveReader.validName(package) else { throw OmiError("EPUB 缺少目录。") }
        let data = try ArchiveReader.read(url, entry: package, limit: 8 * 1024 * 1024)
        let nodes = try XMLNodes.parse(data)
        var items: [String: String] = [:]
        for (name, attributes) in nodes where name == "item" {
            if let id = attributes["id"], let href = attributes["href"], ["application/xhtml+xml", "text/html"].contains(attributes["media-type"] ?? "") {
                items[id] = try Self.resolve(package, href)
            }
        }
        chapters = nodes.filter { $0.0 == "itemref" && $0.1["linear"] != "no" }.compactMap { items[$0.1["idref"] ?? ""] }
        guard !chapters.isEmpty, chapters.count <= 20000 else { throw OmiError("EPUB 没有可阅读章节。") }
        fixedLayout = String(data: data, encoding: .utf8)?.contains("pre-paginated") == true
    }
    static func resolve(_ entry: String, _ href: String) throws -> String {
        guard !href.contains(":"), !href.hasPrefix("/"), !href.contains("\\") else { throw OmiError("EPUB 资源路径无效。") }
        let relative = href.components(separatedBy: "#")[0].components(separatedBy: "?")[0].removingPercentEncoding ?? href
        var parts = Array(entry.split(separator: "/").dropLast()).map(String.init)
        for part in relative.split(separator: "/").map(String.init) {
            if part == "." { continue }
            if part == ".." { guard !parts.isEmpty else { throw OmiError("EPUB 资源越界。") }; parts.removeLast() }
            else { parts.append(part) }
        }
        let name = parts.joined(separator: "/")
        guard ArchiveReader.validName(name) else { throw OmiError("EPUB 资源路径无效。") }
        return name
    }
}
