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
    // 1. img.xcstudio.pw URLs -> same-origin /media-proxy/
    const imgMatch = source.match(/^https?:\/\/img\.xcstudio\.pw\/(.*)$/i);
    if (imgMatch) {
        return `/media-proxy/${imgMatch[1]}`;
    }
    // 2. /resources/:id/file?direct=1 -> force proxy=1 so the backend streams directly with attachment header
    if (source.includes("/resources/") && source.includes("/file")) {
        try {
            const urlObj = new URL(source, window.location.href);
            if (urlObj.searchParams.get("direct") === "1" || !urlObj.searchParams.has("proxy")) {
                urlObj.searchParams.delete("direct");
                urlObj.searchParams.set("proxy", "1");
                return urlObj.toString();
            }
        } catch {
            return source.replace(/([?&])direct=1(&|$)/, "$1proxy=1$2");
        }
    }
    return source;
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = fileName;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
        try {
            document.body.removeChild(anchor);
            URL.revokeObjectURL(blobUrl);
        } catch {
            // Ignore if already removed
        }
    }, 40000);
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
 * Never navigates the current window or opens a new tab.
 */
export async function downloadMediaFile(
    source: string | Blob | undefined | null,
    fileName?: string
): Promise<void> {
    if (!source) return;

    if (source instanceof Blob) {
        const finalName = resolveDownloadFileName(undefined, fileName, source.type);
        triggerBlobDownload(source, finalName);
        return;
    }

    if (typeof source === "string" && (source.startsWith("data:") || source.startsWith("blob:"))) {
        const finalName = resolveDownloadFileName(source, fileName);
        if (source.startsWith("blob:")) {
            const anchor = document.createElement("a");
            anchor.href = source;
            anchor.download = finalName;
            anchor.style.display = "none";
            document.body.appendChild(anchor);
            anchor.click();
            setTimeout(() => document.body.removeChild(anchor), 1000);
            return;
        }
        // Convert data URL to blob
        try {
            const res = await fetch(source);
            const blob = await res.blob();
            triggerBlobDownload(blob, finalName);
            return;
        } catch {
            saveAs(source, finalName);
            return;
        }
    }

    // 1. If it's an img.xcstudio.pw resource or backend resource, try the proxy URL first
    const proxyUrl = toProxyUrl(source);
    if (proxyUrl !== source) {
        try {
            const response = await fetch(proxyUrl, { cache: "no-store", credentials: "include" });
            const contentType = response.headers.get("content-type") || "";
            if (response.ok && !contentType.includes("text/html")) {
                const blob = await response.blob();
                const finalName = resolveDownloadFileName(source, fileName, blob.type);
                triggerBlobDownload(blob, finalName);
                return;
            }
        } catch (proxyError) {
            console.warn("[downloadMediaFile] Media proxy fetch failed, trying fallbacks:", proxyError);
        }
    }

    // 2. Direct fetch with cache-busting
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
        const contentType = response.headers.get("content-type") || "";
        if (response.ok && !contentType.includes("text/html")) {
            const blob = await response.blob();
            const finalName = resolveDownloadFileName(source, fileName, blob.type);
            triggerBlobDownload(blob, finalName);
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
            triggerBlobDownload(blob, finalName);
            return;
        } catch (canvasError) {
            console.warn("[downloadMediaFile] Canvas fallback failed:", canvasError);
        }
    }

    // 4. Try direct fetch of original source without cache buster
    try {
        const response = await fetch(source, { mode: "cors" });
        const contentType = response.headers.get("content-type") || "";
        if (response.ok && !contentType.includes("text/html")) {
            const blob = await response.blob();
            const finalName = resolveDownloadFileName(source, fileName, blob.type);
            triggerBlobDownload(blob, finalName);
            return;
        }
    } catch {
        // Ignore
    }

    // 5. DO NOT navigate to the cross-origin URL. Throw an error so caller can display message.error
    throw new Error("媒体文件下载失败，无法跨域获取文件流。请刷新页面或检查网络。");
}

