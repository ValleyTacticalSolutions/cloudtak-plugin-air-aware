/**
 * The FAA TFR feed: a national list with no coordinates, and one XNOTAM XML document per
 * TFR that carries the geometry, vertical limits and schedule. Port of the ATAK plugin's
 * TfrFeed / TfrParser.
 */

export interface TfrListRow {
    notam_id: string;
    type: string;
    facility: string;
    state: string;
    description: string;
    creation_date: string;
}

export interface Vert {
    raw: string;
    present: boolean;
    surface: boolean;
    feet: number;
    agl: boolean;
    flightLevel: boolean;
}

export interface TfrArea {
    name: string;
    ring: Array<[number, number]>;
    radiusNm: number;
    center?: [number, number];
    floor: Vert;
    ceiling: Vert;
    effectiveMs: number;
    expireMs: number;
}

export interface Tfr {
    notamId: string;
    type: string;
    state: string;
    facility: string;
    description: string;
    creationDate: string;
    timeZone: string;
    city: string;
    stateName: string;
    notamText: string;
    effectiveMs: number;
    expireMs: number;
    windowApproximate: boolean;
    areas: TfrArea[];
    detailLoaded: boolean;
}

const ZONES: Record<string, number> = {
    UTC: 0, GMT: 0, Z: 0,
    AST: -4, EDT: -4, EST: -5, CDT: -5, CST: -6, MDT: -6, MST: -7, PDT: -7, PST: -8,
    AKDT: -8, AKST: -9, HDT: -9, HST: -10, SST: -11, CHST: 10, GUAM: 10
};

export function validNotamId(id: string): boolean {
    return /^\d{1,4}\/\d{1,6}$/.test(id.trim());
}

export function fromListRow(r: TfrListRow): Tfr {
    return {
        notamId: String(r.notam_id || '').trim(),
        type: String(r.type || '').trim(),
        state: String(r.state || '').trim(),
        facility: String(r.facility || '').trim(),
        description: String(r.description || '').trim(),
        creationDate: String(r.creation_date || '').trim(),
        timeZone: '',
        city: '',
        stateName: '',
        notamText: '',
        effectiveMs: 0,
        expireMs: 0,
        windowApproximate: false,
        areas: [],
        detailLoaded: false
    };
}

function first(el: Element | Document, tag: string): Element | null {
    const list = el.getElementsByTagName(tag);
    return list.length ? list[0] : null;
}

function text(el: Element | Document | null, tag: string): string {
    if (!el) return '';
    const f = first(el, tag);
    return f && f.textContent ? f.textContent.trim() : '';
}

/** Text of a direct child only, so a nested ScheduleGroup's dates are not taken for the NOTAM's. */
function childText(el: Element, tag: string): string {
    for (const c of Array.from(el.children)) {
        if (c.tagName === tag) return (c.textContent || '').trim();
    }
    return '';
}

function millis(iso: string, zone: string, approx: { v: boolean }): number {
    if (!iso) return 0;
    let off = ZONES[zone.trim().toUpperCase()];
    if (off === undefined) {
        approx.v = true;
        off = 0;
    }
    const t = Date.parse(iso.trim() + 'Z');
    if (isNaN(t)) {
        approx.v = true;
        return 0;
    }
    return t - off * 3600_000;
}

export function coord(s: string, isLat: boolean): number | null {
    let v = s.trim().toUpperCase();
    if (!v) return null;
    let sign = 1;
    const last = v.charAt(v.length - 1);
    if ('NSEW'.includes(last)) {
        sign = last === 'S' || last === 'W' ? -1 : 1;
        v = v.slice(0, -1).trim();
    }
    if (!v) return null;
    const dot = v.indexOf('.');
    const intDigits = dot < 0 ? v.length : dot;
    let out: number;
    if (intDigits <= 3) {
        out = sign * Number(v);
    } else {
        const degLen = intDigits - 4;
        if (degLen < 1) return null;
        const d = Number(v.slice(0, degLen));
        const m = Number(v.slice(degLen, degLen + 2));
        const sec = Number(v.slice(degLen + 2));
        out = sign * (d + m / 60 + sec / 3600);
    }
    const limit = isLat ? 90 : 180;
    if (!isFinite(out) || out < -limit || out > limit) return null;
    return out;
}

function vert(val: string, uom: string, code: string, isFloor: boolean): Vert {
    const v: Vert = { raw: `${val} ${uom} ${code}`.trim(), present: false, surface: false, feet: 0, agl: false, flightLevel: false };
    if (!val) {
        if (code.toUpperCase() === 'SFC') {
            v.present = true;
            v.surface = true;
        }
        return v;
    }
    const n = Number(val.trim());
    if (!isFinite(n)) {
        const s = val.trim().toUpperCase();
        if (s.startsWith('SFC') || s.startsWith('GND')) {
            v.present = true;
            v.surface = true;
        }
        return v;
    }
    v.present = true;
    const u = uom.trim().toUpperCase();
    if (u === 'FL') {
        v.flightLevel = true;
        v.feet = Math.round(n * 100);
    } else if (u === 'M') {
        v.feet = Math.round(n / 0.3048);
    } else if (u === 'KM') {
        v.feet = Math.round(n * 1000 / 0.3048);
    } else {
        v.feet = Math.round(n);
    }
    if (!v.flightLevel) v.agl = code.trim().toUpperCase() === 'HEI';
    if (v.feet === 0 && !v.flightLevel) {
        if (isFloor) v.surface = true;
        else v.present = false;
    }
    return v;
}

function nm(val: string, uom: string): number {
    const n = Number(val.trim());
    if (!isFinite(n)) return 0;
    const u = uom.trim().toUpperCase();
    if (u === 'KM') return n / 1.852;
    if (u === 'M') return n / 1852;
    return n;
}

function area(g: Element, zone: string): TfrArea {
    const a: TfrArea = {
        name: text(g, 'txtLocalName') || text(g, 'txtName'),
        ring: [],
        radiusNm: 0,
        floor: vert(text(g, 'valDistVerLower'), text(g, 'uomDistVerLower'), text(g, 'codeDistVerLower'), true),
        ceiling: vert(text(g, 'valDistVerUpper'), text(g, 'uomDistVerUpper'), text(g, 'codeDistVerUpper'), false),
        effectiveMs: 0,
        expireMs: 0
    };

    const merged = first(g, 'abdMergedArea');
    if (merged) {
        for (const v of Array.from(merged.getElementsByTagName('Avx'))) {
            const lat = coord(text(v, 'geoLat'), true);
            const lon = coord(text(v, 'geoLong'), false);
            if (lat !== null && lon !== null) a.ring.push([lon, lat]);
        }
    }

    const abd = first(g, 'Abd');
    if (abd) {
        for (const v of Array.from(abd.getElementsByTagName('Avx'))) {
            if (text(v, 'codeType') !== 'CIR') continue;
            a.radiusNm = nm(text(v, 'valRadiusArc'), text(v, 'uomRadiusArc'));
            const lat = coord(text(v, 'geoLat'), true);
            const lon = coord(text(v, 'geoLong'), false);
            if (lat !== null && lon !== null) a.center = [lon, lat];
            break;
        }
    }

    const sched = first(g, 'ScheduleGroup');
    if (sched) {
        const ignored = { v: false };
        a.effectiveMs = millis(childText(sched, 'dateEffective'), zone, ignored);
        a.expireMs = millis(childText(sched, 'dateExpire'), zone, ignored);
    }
    return a;
}

export function parseDetail(xml: string, t: Tfr): void {
    // DOMParser never fetches external entities or DTDs, so a hostile document cannot
    // reach the network or the file system from here.
    const doc = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ''), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('TFR detail was not readable XML');
    const not = first(doc, 'Not');
    const root: Element = not || doc.documentElement;

    t.timeZone = text(root, 'codeTimeZone');
    t.city = text(root, 'txtNameCity');
    t.stateName = text(root, 'txtNameUSState');
    t.notamText = text(root, 'txtDescrTraditional').replace(/\s+/g, ' ').trim();
    const approx = { v: false };
    t.effectiveMs = millis(childText(root, 'dateEffective'), t.timeZone, approx);
    t.expireMs = millis(childText(root, 'dateExpire'), t.timeZone, approx);
    t.windowApproximate = approx.v;
    t.areas = Array.from(doc.getElementsByTagName('TFRAreaGroup')).map((g) => area(g, t.timeZone));
    t.detailLoaded = true;
}

/** In effect now (red), or scheduled for later (amber). */
export function tfrActive(t: Tfr, a: TfrArea | undefined, now = Date.now()): boolean {
    const eff = (a && a.effectiveMs) || t.effectiveMs;
    const exp = (a && a.expireMs) || t.expireMs;
    if (eff && now < eff) return false;
    if (exp && now > exp) return false;
    return true;
}

export function vertText(v: Vert): string {
    if (!v.present) return v.raw || 'unspecified';
    if (v.surface) return 'SFC';
    if (v.flightLevel) return `FL${Math.round(v.feet / 100)}`;
    return `${v.feet.toLocaleString('en-US')} ft ${v.agl ? 'AGL' : 'MSL'}`;
}
