export type ImageAspectRatio = string;

export type ImageQualityTier = string;

export type ImageOutputFormat = "png" | "jpg" | "webp";

export const MAX_REFERENCE_IMAGES = 10;

export interface ImageGenParams {
    ratio: string;
    quality: string;
    format: ImageOutputFormat;
    count: string;
}

export interface UploadedReferenceImage {
    id: string;
    url: string;
    storageKey?: string;
    name: string;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
    assetId?: string;
}

export interface GeneratedImageItem {
    id: string;
    url: string;
    storageKey?: string;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
    prompt?: string;
    model?: string;
    assetId?: string;
    createdAt: string;
}

export interface ImageGenHistoryRecord {
    id: string;
    title: string;
    prompt: string;
    model: string;
    params: ImageGenParams;
    references: UploadedReferenceImage[];
    results: GeneratedImageItem[];
    createdAt: string;
}

export interface ImageGenProject {
    id: string;
    canvasId?: string;
    title: string;
    prompt: string;
    model: string;
    params: ImageGenParams;
    references: UploadedReferenceImage[];
    results: GeneratedImageItem[];
    pinned: boolean;
    createdAt: string;
    updatedAt: string;
}

export type GeneratorViewMode = "discovery" | "workspace";
