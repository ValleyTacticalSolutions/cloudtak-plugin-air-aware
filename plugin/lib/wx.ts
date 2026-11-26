/**
 * Flight weather: turns a METAR into planner values and checks them against the pilot's
 * alarm limits. No imports with side effects, so it runs outside CloudTAK too.
 * Values are kept in °F, mph, statute miles and ft.
 */
import type { MetarRow } from './data.ts';

export type Sky = 'clear' | 'cloudy' | 'rain' | 'snow';

export interface WxValues {
    sky?: Sky;
    /** Reported at the station; a manual change of Conditions clears these. */
    thunder?: 'station' | 'vicinity';
    freezing?: boolean;
    windMph?: number;
    /** Degrees true the wind is from. */
    windDirDeg?: number;
    windVariable?: boolean;
    /** Undefined with a wind speed present means no gusts are reported. */
    gustMph?: number;
    tempF?: number;
    dewF?: number;
    visSm?: number;
    /** The station reported "or more" (10+). */
    visPlus?: boolean;
    ceilingFt?: number;
    /** No broken, overcast or obscured layer. */
    noCeiling?: boolean;
}

/** Alarm limits. null switches a numeric alarm off. */
export interface WxLimits {
    maxWindMph: number | null;
    maxGustMph: number | null;
    minTempF: number | null;
    maxTempF: number | null;
    /** Warn when temperature minus dew point is below this, °F. */
    minSpreadF: number | null;
    minVisSm: number | null;
    minCeilingFt: number | null;
    /** Vertical distance required between the planned altitude and the ceiling, ft. */
    cloudClearanceFt: number | null;
    alarmRain: boolean;
    alarmSnow: boolean;
    alarmCloudy: boolean;
    /** Warn when the observation is older than this, minutes. */
    maxAgeMin: number | null;
    /** Warn when the station is further from Home than this, statute miles. */
    maxStationMi: number | null;
}

export const DEFAULT_WX_LIMITS: WxLimits = {
    maxWindMph: 25,
    maxGustMph: 30,
    minTempF: 14,
    maxTempF: 104,
    minSpreadF: 5,
    // 14 CFR 107.51: 3 SM visibility, 500 ft below clouds.
    minVisSm: 3,
    minCeilingFt: 900,
    cloudClearanceFt: 500,
    alarmRain: true,
    alarmSnow: true,
    alarmCloudy: false,
    maxAgeMin: 90,
    maxStationMi: 20
};

/** Spread alarms become out-of-limits at or below this temperature: frost and icing. */
export const ICING_TEMP_F = 38;

export const MPH_PER_KT = 1.150779;

const num = (v: unknown): number | undefined => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : undefined;
};

const cToF = (c: number): number => Math.round((c * 9 / 5 + 32) * 10) / 10;

export function fromMetar(m: MetarRow): WxValues {
    const out: WxValues = {};

    // ---- weather groups ----
    const groups = (m.wxString || '').toUpperCase().split(/\s+/).filter(Boolean);
    let rain = false;
    let snow = false;
    for (const g of groups) {
        const near = g.startsWith('VC');
        if (g.includes('TS')) {
            if (!near) out.thunder = 'station';
            else if (!out.thunder) out.thunder = 'vicinity';
        }
        if (near) continue;
        const code = g.replace(/^[+-]/, '');
        if (/SN|SG|PL|GS|GR|IC/.test(code)) snow = true;
        if (/RA|DZ|UP/.test(code)) rain = true;
        if (/FZ(RA|DZ|FG)/.test(code)) out.freezing = true;
    }

    // ---- sky ----
    const layers = [...(m.clouds || [])];
    const cover = (m.cover || '').toUpperCase();
    const covers = [cover, ...layers.map((c) => c.cover.toUpperCase())];
    const ceilings = layers
        .filter((c) => /^(BKN|OVC|OVX|VV)$/i.test(c.cover) && num(c.base) !== undefined)
        .map((c) => num(c.base) as number);
    // Vertical visibility into an obscuration is the ceiling, in hundreds of feet.
    const vv = /(?:^|\s)VV(\d{3})(?:\s|$)/.exec(m.rawOb || '');
    if (vv) ceilings.push(Number(vv[1]) * 100);
    const overcast = covers.some((c) => /^(BKN|OVC|OVX|VV)$/.test(c)) || !!vv;
    const reported = covers.some((c) => /^(CLR|SKC|CAVOK|NSC|NCD|FEW|SCT)$/.test(c));
    if (ceilings.length) out.ceilingFt = Math.min(...ceilings);
    else if (!overcast && reported) out.noCeiling = true;

    if (snow) out.sky = 'snow';
    else if (rain || out.thunder === 'station') out.sky = 'rain';
    else if (overcast) out.sky = 'cloudy';
    else if (reported) out.sky = 'clear';

    // ---- wind (knots) ----
    const kt = num(m.wspd);
    if (kt !== undefined) {
        out.windMph = Math.round(kt * MPH_PER_KT);
        if (String(m.wdir).toUpperCase() === 'VRB') out.windVariable = true;
        else if (kt > 0) out.windDirDeg = num(m.wdir);
    }
    const gust = num(m.wgst);
    if (gust !== undefined) out.gustMph = Math.round(gust * MPH_PER_KT);

    // ---- temperature, visibility ----
    const t = num(m.temp), d = num(m.dewp);
    if (t !== undefined) out.tempF = cToF(t);
    if (d !== undefined) out.dewF = cToF(d);
    const vis = num(m.visib);
    if (vis !== undefined) {
        out.visSm = vis;
        if (String(m.visib).includes('+')) out.visPlus = true;
    }
    return out;
}

/** Observation time, ms since the epoch. */
export function obsTimeMs(m: MetarRow): number | undefined {
    const t = num(m.obsTime);
    if (t !== undefined) return t * 1000;
    const parsed = Date.parse(m.reportTime || '');
    return Number.isFinite(parsed) ? parsed : undefined;
}

export type Level = 'ok' | 'warn' | 'fail';

export type CheckKey = 'sky' | 'wind' | 'gust' | 'temp' | 'spread' | 'vis' | 'ceiling' | 'clearance' | 'age' | 'station';

export interface WxCheck {
    key: CheckKey;
    label: string;
    value: string;
    level: Level;
    /** Why it is not ok. */
    note?: string;
}

export interface WxFormat {
    temp(f: number): string;
    /** A temperature difference. */
    delta(f: number): string;
    speed(mph: number): string;
    vis(sm: number): string;
    height(ft: number): string;
}

export interface WxContext {
    /** Planned altitude, ft above Home. */
    altitudeFt?: number;
    ageMin?: number;
    stationMi?: number;
}

export const SKY_LABELS: Record<Sky, string> = { clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', snow: 'Snow' };

export function compassPoint(deg: number): string {
    const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return names[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

export function evaluate(v: WxValues, l: WxLimits, f: WxFormat, ctx: WxContext = {}): WxCheck[] {
    const checks: WxCheck[] = [];
    const add = (key: CheckKey, label: string, value: string, level: Level = 'ok', note?: string): void => {
        checks.push({ key, label, value, level, note });
    };
    const missing = (key: CheckKey, label: string): void => add(key, label, '—', 'warn', 'Not reported: check on site');
    const set = (x: number | null): x is number => typeof x === 'number' && Number.isFinite(x);

    // ---- conditions ----
    if (!v.sky) {
        missing('sky', 'Conditions');
    } else {
        const notes: string[] = [];
        let level: Level = 'ok';
        if (v.sky === 'rain' && l.alarmRain) { level = 'fail'; notes.push('Rain'); }
        if (v.sky === 'snow' && l.alarmSnow) { level = 'fail'; notes.push('Snow or ice'); }
        if (v.sky === 'cloudy' && l.alarmCloudy) { level = 'warn'; notes.push('Cloudy'); }
        if (v.freezing) { level = 'fail'; notes.push('Freezing precipitation or fog'); }
        if (v.thunder === 'station') { level = 'fail'; notes.push('Thunderstorm'); }
        if (v.thunder === 'vicinity') {
            if (level === 'ok') level = 'warn';
            notes.push('Thunderstorm in the vicinity');
        }
        add('sky', 'Conditions', SKY_LABELS[v.sky], level, notes.join(', ') || undefined);
    }

    // ---- wind ----
    if (v.windMph === undefined) {
        missing('wind', 'Wind');
    } else {
        const from = v.windMph === 0 ? 'Calm'
            : v.windVariable ? 'Variable'
                : v.windDirDeg !== undefined ? `${compassPoint(v.windDirDeg)} ${Math.round(v.windDirDeg)}°` : '';
        const value = v.windMph === 0 ? 'Calm' : `${from} ${f.speed(v.windMph)}`.trim();
        const over = set(l.maxWindMph) && v.windMph > l.maxWindMph;
        add('wind', 'Wind', value, over ? 'fail' : 'ok', over ? `Max ${f.speed(l.maxWindMph as number)}` : undefined);
    }
    if (v.gustMph !== undefined) {
        const over = set(l.maxGustMph) && v.gustMph > l.maxGustMph;
        add('gust', 'Gusts', f.speed(v.gustMph), over ? 'fail' : 'ok', over ? `Max ${f.speed(l.maxGustMph as number)}` : undefined);
    } else if (v.windMph === undefined) {
        missing('gust', 'Gusts');
    } else {
        add('gust', 'Gusts', 'None reported');
    }

    // ---- temperature ----
    if (v.tempF === undefined) {
        missing('temp', 'Temperature');
    } else {
        const low = set(l.minTempF) && v.tempF < l.minTempF;
        const high = set(l.maxTempF) && v.tempF > l.maxTempF;
        add('temp', 'Temperature', f.temp(v.tempF), low || high ? 'fail' : 'ok',
            low ? `Min ${f.temp(l.minTempF as number)}` : high ? `Max ${f.temp(l.maxTempF as number)}` : undefined);
    }
    if (v.tempF === undefined || v.dewF === undefined) {
        missing('spread', 'Dew Point');
    } else {
        const spread = Math.round((v.tempF - v.dewF) * 10) / 10;
        const value = `${f.temp(v.dewF)} (Δ ${f.delta(spread)})`;
        if (set(l.minSpreadF) && spread < l.minSpreadF) {
            const icing = v.tempF <= ICING_TEMP_F;
            add('spread', 'Dew Point', value, icing ? 'fail' : 'warn',
                `Spread under ${f.delta(l.minSpreadF)}: ${icing ? 'icing risk' : 'fog or moisture risk'}`);
        } else {
            add('spread', 'Dew Point', value);
        }
    }

    // ---- visibility ----
    if (v.visSm === undefined) {
        missing('vis', 'Visibility');
    } else {
        const under = set(l.minVisSm) && v.visSm < l.minVisSm;
        add('vis', 'Visibility', `${f.vis(v.visSm)}${v.visPlus ? '+' : ''}`, under ? 'fail' : 'ok',
            under ? `Min ${f.vis(l.minVisSm as number)}` : undefined);
    }

    // ---- ceiling ----
    if (v.ceilingFt !== undefined) {
        const under = set(l.minCeilingFt) && v.ceilingFt < l.minCeilingFt;
        add('ceiling', 'Ceiling', f.height(v.ceilingFt), under ? 'fail' : 'ok',
            under ? `Min ${f.height(l.minCeilingFt as number)}` : undefined);
        if (set(l.cloudClearanceFt) && ctx.altitudeFt !== undefined) {
            const gap = v.ceilingFt - ctx.altitudeFt;
            if (gap < l.cloudClearanceFt) {
                add('clearance', 'Cloud Clearance', f.height(Math.max(0, gap)), 'fail',
                    `Needs ${f.height(l.cloudClearanceFt)} below clouds: fly at or under ${f.height(Math.max(0, v.ceilingFt - l.cloudClearanceFt))}`);
            }
        }
    } else if (v.noCeiling) {
        add('ceiling', 'Ceiling', 'None');
    } else {
        missing('ceiling', 'Ceiling');
    }

    // ---- how far to trust it ----
    if (ctx.ageMin !== undefined && set(l.maxAgeMin) && ctx.ageMin > l.maxAgeMin) {
        add('age', 'Report Age', `${Math.round(ctx.ageMin)} min`, 'warn', `Older than ${l.maxAgeMin} min`);
    }
    if (ctx.stationMi !== undefined && set(l.maxStationMi) && ctx.stationMi > l.maxStationMi) {
        add('station', 'Station Distance', f.vis(ctx.stationMi), 'warn', `Further than ${f.vis(l.maxStationMi)} from Home`);
    }
    return checks;
}

export function worst(checks: WxCheck[]): Level {
    if (checks.some((c) => c.level === 'fail')) return 'fail';
    return checks.some((c) => c.level === 'warn') ? 'warn' : 'ok';
}
