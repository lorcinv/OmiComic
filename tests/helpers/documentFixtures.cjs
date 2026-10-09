function zip(entries, deflate = false) {
  const local = [], central = []; let offset = 0;
  function crc32(data) { let crc = -1; for (const byte of data) { crc ^= byte; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ -1) >>> 0; }
  for (const [name, value] of entries) {
    const n = Buffer.from(name), data = Buffer.from(value); const crc = crc32(data); const payload = deflate ? require("node:zlib").deflateRawSync(data) : data;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14); h.writeUInt32LE(payload.length, 18); h.writeUInt16LE(deflate ? 8 : 0, 8); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    local.push(h, n, payload);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(payload.length, 20); c.writeUInt16LE(deflate ? 8 : 0, 10); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42); central.push(c, n); offset += h.length + n.length + payload.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...local, cd, end]);
}

module.exports = { zip };
