import { saveAs } from "file-saver";

const MIME_EXTENSIONS: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/ogg": "ogv",
    "video/mpeg": "mpeg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
};

export function inferMediaFileName(source?: string, fallback = "download"): string {
    if (!source || typeof source !== "string") return fallback;
    try {
        const parsed = new URL(source, window.location.href);
        const segments = parsed.pathname.split("/").filter(Boolean);
        const last = segments[segments.length - 1];
        if (last && last.includes(".")) {
            return decodeURIComponent(last);
        }
    } catch {
        // Not a valid URL, ignore
    }
    return fallback;
}

export function resolveDownloadFileName(source?: string, fileName?: string, mimeType?: string): string {
    if (fileName && fileName.trim()) {
        const trimmed = fileName.trim();
        if (trimmed.includes(".")) return trimmed;
        const ext = (mimeType ? MIME_EXTENSIONS[mimeType.toLowerCase()] : undefined)
            || inferFileExtension(source)
            || "png";
        return `${trimmed}.${ext}`;
    }
    if (source) {
        const fromUrl = inferMediaFileName(source);
        if (fromUrl && fromUrl !== "download") return fromUrl;
    }
    const ext = (mimeType ? MIME_EXTENSIONS[mimeType.toLowerCase()] : undefined) || "png";
    return `download.${ext}`;
}

function inferFileExtension(source?: string): string | undefined {
    if (!source || typeof source !== "string") return undefined;
    const name = inferMediaFileName(source);
    if (name && name.includes(".")) {
        const parts = name.split(".");
        return parts[parts.length - 1];
    }
    return undefined;
}

/**
 * Converts img.xcstudio.pw URLs to same-origin /media-proxy/ URLs.
 * On Vercel and Nginx, /media-proxy/ rewrites to https://img.xcstudio.pw/ so the browser
 * fetches it as same-origin, completely eliminating CORS restrictions on any domain
 * (including *.vercel.app preview branches).
 */
export function toProxyUrl(source: string): string {
    if (typeof source !== "string") return source;
    const match = source.match(/^https?:\/\/img\.xcstudio\.pw\/(.*)$/i);
    if (match) {
        return `/media-proxy/${match[1]}`;
    }
    return source;
}

function imageToBlob(imgUrl: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("Canvas 2D context not available"));
                    return;
                }
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error("Failed to convert canvas to blob"));
                }, "image/png");
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = (err) => reject(err);
        try {
            const u = new URL(imgUrl, window.location.href);
            u.searchParams.set("_dl", String(Date.now()));
            img.src = u.toString();
        } catch {
            img.src = imgUrl;
        }
    });
}

/**
 * Downloads a media file (remote URL, Blob, data URL, or blob URL) to the user's filesystem.
 */
export async function downloadMediaFile(
    source: string | Blob | undefined | null,
    fileName?: string
): Promise<void> {
    if (!source) return;

    if (source instanceof Blob) {
        const finalName = resolveDownloadFileName(undefined, fileName, source.type);
        saveAs(source, finalName);
        return;
    }

    if (typeof source === "string" && (source.startsWith("data:") || source.startsWith("blob:"))) {
        const finalName = resolveDownloadFileName(source, fileName);
        saveAs(source, finalName);
        return;
    }

    // 1. If it's an img.xcstudio.pw resource, try the same-origin /media-proxy/ route first
    const proxyUrl = toProxyUrl(source);
    if (proxyUrl !== source) {
        try {
            const response = await fetch(proxyUrl, { cache: "no-store" });
            if (response.ok) {
                const blob = await response.blob();
                const finalName = resolveDownloadFileName(source, fileName, blob.type);
                saveAs(blob, finalName);
                return;
            }
        } catch (proxyError) {
            console.warn("[downloadMediaFile] Same-origin media proxy fetch failed, falling back to direct fetch:", proxyError);
        }
    }

    // 2. Direct fetch with cache-busting to bypass Chrome tainted image cache
    try {
        let fetchUrl = source;
        if (typeof source === "string" && (source.startsWith("http://") || source.startsWith("https://"))) {
            const urlObj = new URL(source, window.location.href);
            urlObj.searchParams.set("_cors_dl", String(Date.now()));
            fetchUrl = urlObj.toString();
        }
        const response = await fetch(fetchUrl, {
            mode: "cors",
            cache: "no-store",
        });
        if (response.ok) {
            const blob = await response.blob();
            const finalName = resolveDownloadFileName(source, fileName, blob.type);
            saveAs(blob, finalName);
            return;
        }
    } catch (fetchError) {
        console.warn("[downloadMediaFile] Direct fetch failed, trying canvas fallback:", fetchError);
    }

    // 3. For images: fallback to Image element + Canvas export
    const isLikelyImage = typeof source === "string" && (
        /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(source) ||
        source.includes("/image/")
    );
    if (isLikelyImage && typeof source === "string") {
        try {
            const blob = await imageToBlob(proxyUrl);
            const finalName = resolveDownloadFileName(source, fileName, blob.type);
            saveAs(blob, finalName);
            return;
        } catch (canvasError) {
            console.warn("[downloadMediaFile] Canvas fallback failed:", canvasError);
        }
    }

    // 4. Fallback: try direct fetch of original source
    try {
        const response = await fetch(source, { mode: "cors" });
        if (response.ok) {
            const blob = await response.blob();
            const finalName = resolveDownloadFileName(source, fileName, blob.type);
            saveAs(blob, finalName);
            return;
        }
    } catch {
        // Ignore
    }

    // 5. Final fallback: anchor click on proxyUrl (same-origin so download attribute works)
    const fallbackTarget = proxyUrl !== source ? proxyUrl : source;
    const anchor = document.createElement("a");
    anchor.href = fallbackTarget;
    anchor.download = resolveDownloadFileName(source, fileName);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
}
