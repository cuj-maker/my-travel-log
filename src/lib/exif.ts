/** Minimal JPEG EXIF reader: capture time and GPS position (no dependencies). */
export interface ExifInfo { takenAt?: string; lat?: number; lng?: number }

export async function readExif(file: File): Promise<ExifInfo> {
  if (!/jpe?g/i.test(file.type)) return {};
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xffd8) return {};
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off);
      const len = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
      if ((marker & 0xff00) !== 0xff00) break;
      off += 2 + len;
    }
  } catch { /* unreadable EXIF is not an error */ }
  return {};
}

function parseTiff(v: DataView, base: number): ExifInfo {
  const little = v.getUint16(base) === 0x4949;
  const u16 = (o: number) => v.getUint16(base + o, little);
  const u32 = (o: number) => v.getUint32(base + o, little);
  const entries = (ifd: number) => {
    const n = u16(ifd), out: Record<number, { type: number; count: number; valueOff: number }> = {};
    for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), valueOff: e + 8 }; }
    return out;
  };
  const dataOff = (e: { type: number; count: number; valueOff: number }) => {
    const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 } as Record<number, number>)[e.type] ?? 1;
    // values wider than 4 bytes are stored elsewhere; the field then holds an offset from the TIFF start
    return size * e.count > 4 ? u32(e.valueOff) : e.valueOff;
  };
  const str = (e: { type: number; count: number; valueOff: number }) => {
    const o = dataOff(e); let s = '';
    for (let i = 0; i < e.count - 1; i++) s += String.fromCharCode(v.getUint8(base + o + i));
    return s;
  };
  const rationals = (e: { type: number; count: number; valueOff: number }) => {
    const o = dataOff(e); const r: number[] = [];
    for (let i = 0; i < e.count; i++) { const d = u32(o + i * 8 + 4); r.push(d ? u32(o + i * 8) / d : 0); }
    return r;
  };

  const info: ExifInfo = {};
  const ifd0 = entries(u32(4));
  if (ifd0[0x8769]) {
    const exif = entries(u32(ifd0[0x8769].valueOff));
    const dt = exif[0x9003] ?? exif[0x9004];
    if (dt) { const m = str(dt).match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/); if (m) info.takenAt = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`; }
  }
  if (ifd0[0x8825]) {
    const gps = entries(u32(ifd0[0x8825].valueOff));
    if (gps[2] && gps[4]) {
      const dms = (a: number[]) => a[0] + a[1] / 60 + a[2] / 3600;
      let lat = dms(rationals(gps[2])), lng = dms(rationals(gps[4]));
      if (gps[1] && str(gps[1]).startsWith('S')) lat = -lat;
      if (gps[3] && str(gps[3]).startsWith('W')) lng = -lng;
      if (Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)) { info.lat = lat; info.lng = lng; }
    }
  }
  return info;
}
