/**
 * The two things Air Aware needs from CloudTAK that the Plugin API does not expose.
 * Importing them from the app's source would put a second copy of the app inside the
 * runtime bundle, so they are read the way the app stores them: Capacitor Preferences
 * (the `CapacitorGlobal` the app registers, on both web and native).
 */
interface Preferences {
    get(opts: { key: string }): Promise<{ value: string | null }>;
}

const TIMEOUT_MS = 20000;

async function preference(key: string): Promise<string | undefined> {
    const prefs = (globalThis as unknown as {
        Capacitor?: { Plugins?: { Preferences?: Preferences } };
    }).Capacitor?.Plugins?.Preferences;
    if (!prefs) throw new Error('CloudTAK preferences are not available');
    return (await prefs.get({ key })).value || undefined;
}

export function getToken(): Promise<string | undefined> {
    return preference('token');
}

/** The CloudTAK server: the one signed in to on iOS and Android, this origin in a browser. */
export async function getServerUrl(): Promise<string> {
    return await preference('serverUrl') || location.origin;
}

/** Absolute URL of an API path. A full URL is returned unchanged. */
export async function apiUrl(path: string): Promise<URL> {
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return new URL(path);
    return new URL((await getServerUrl()).replace(/\/$/, '') + path);
}

/** Authenticated request: parsed JSON for a JSON response, otherwise the Response. */
export async function std(url: string | URL): Promise<unknown> {
    const target = await apiUrl(String(url));
    const token = await getToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(target, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({})) as { message?: string };
            throw new Error(body.message || `Status Code: ${res.status}`);
        }
        if (res.headers.get('Content-Type')?.includes('application/json')) return await res.json();
        // Read the body inside the timeout
        return new Response(await res.blob(), { status: res.status, headers: res.headers });
    } catch (err) {
        if (controller.signal.aborted) throw new Error(`Request timed out: ${target.pathname}`, { cause: err });
        throw err;
    } finally {
        clearTimeout(timer);
    }
}
