import { useState, useMemo, useRef, type ReactNode } from "react";
import { Popover } from "antd";
import { SlidersHorizontal, ChevronDown } from "lucide-react";

import type { AiConfig } from "@/stores/use-config-store";
import { mergedImageCapabilityConfig } from "@/lib/model-selection";
import { defaultImageCapabilityConfig, modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { qualityOptions, countOptions } from "@/pages/create/creation-types";
import {
    supportsImageResolutionPresets,
    buildImageResolutionOptions,
    formatImageResolutionSize,
} from "@/lib/image-resolution-tiers";
import { imageResolutionUsesQuality } from "@/lib/image-size-presets";
import { ImageSizePicker } from "@/components/image-size-picker";

export interface GenerationSettingsMenuProps {
    config: AiConfig;
    selectedModel: string;
    ratio: string;
    onChangeRatio: (ratio: string) => void;
    quality: string;
    onChangeQuality: (quality: string) => void;
    count: string;
    onChangeCount: (count: string) => void;
    referenceImageSize?: { width: number; height: number };
}

function SettingSection({ title, value, children }: { title: string; value?: string; children: ReactNode }) {
    return (
        <section className="creation-parameter-section">
            <header>
                <h3>{title}</h3>
                {value ? <span>{value}</span> : null}
            </header>
            {children}
        </section>
    );
}

export function GenerationSettingsMenu({
    config,
    selectedModel,
    ratio,
    onChangeRatio,
    quality,
    onChangeQuality,
    count,
    onChangeCount,
    referenceImageSize,
}: GenerationSettingsMenuProps) {
    const [open, setOpen] = useState(false);
    const [computedPlacement, setComputedPlacement] = useState<"bottomLeft" | "topLeft">("bottomLeft");
    const [availableMaxHeight, setAvailableMaxHeight] = useState<number | undefined>(undefined);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const model = selectedModel || config.imageModel || "";
    const imageProfile = useMemo(() => {
        return modelCapabilityConfigFor(config, model)?.image || defaultImageCapabilityConfig(undefined, model);
    }, [config, model]);
    const mergedProfile = useMemo(() => mergedImageCapabilityConfig(config, model), [config, model]);

    const activeQualityOptions = imageProfile.quality.values.map(
        (value) => qualityOptions.find((item) => item.value === value) || { value, label: value.toUpperCase(), description: "模型支持的质量/分辨率" }
    );
    const qualityLabel = activeQualityOptions.find((item) => item.value === quality)?.label || qualityOptions.find((item) => item.value === quality)?.label || quality || "自动";

    const usesImageResolutionPicker = supportsImageResolutionPresets(mergedProfile.size);
    const imageResolutionOptions = usesImageResolutionPicker ? buildImageResolutionOptions(mergedProfile.size.values) : [];

    const referenceImageSizeValue = referenceImageSize && mergedProfile.size.allowCustom ? `${referenceImageSize.width}x${referenceImageSize.height}` : "";
    const referenceImageSizeLabel = referenceImageSize && mergedProfile.size.allowCustom ? `${referenceImageSize.width} × ${referenceImageSize.height}` : "";
    const referenceImageSizeSelected = Boolean(referenceImageSizeValue && ratio === referenceImageSizeValue);

    const selectReferenceImageSize = () => {
        if (!referenceImageSizeValue) return;
        onChangeRatio(referenceImageSizeValue);
    };

    const summary = [
        ...(mergedProfile.size.parameter !== "none" ? [referenceImageSizeSelected ? referenceImageSizeLabel : usesImageResolutionPicker ? formatImageResolutionSize(ratio, imageResolutionOptions) : ratio] : []),
        ...(imageProfile.quality.supported ? [qualityLabel] : []),
        ...(imageProfile.maxOutputs > 1 ? [count] : []),
    ].join(" · ");

    const panel = (
        <div
            className="creation-parameter-menu"
            style={{
                maxHeight: availableMaxHeight ? `${availableMaxHeight}px` : "min(520px, calc(100vh - 64px))",
                overflowY: "auto",
            }}
        >
            <ImageSizePicker
                profile={mergedProfile}
                size={ratio}
                quality={quality}
                onChange={(nextSize, nextQuality) => {
                    onChangeRatio(nextSize);
                    if (nextQuality) onChangeQuality(nextQuality);
                }}
            />
            {referenceImageSizeValue ? (
                <button type="button" className="creation-custom-trigger" onClick={selectReferenceImageSize}>
                    使用参考图尺寸 · {referenceImageSizeLabel}
                </button>
            ) : null}
            {imageProfile.quality.supported && !imageResolutionUsesQuality(mergedProfile) ? (
                <SettingSection
                    title={activeQualityOptions.some((item) => item.value === "1k" || item.value === "2k") ? "分辨率" : "图片质量"}
                    value={qualityLabel}
                >
                    <div className="creation-choice-grid is-quality">
                        {activeQualityOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                aria-pressed={option.value === quality}
                                className={option.value === quality ? "is-selected" : ""}
                                onClick={() => onChangeQuality(option.value)}
                            >
                                <span>{option.label}</span>
                                <small>{option.description}</small>
                            </button>
                        ))}
                    </div>
                </SettingSection>
            ) : null}
            {imageProfile.maxOutputs > 1 ? (
                <SettingSection title="生成数量" value={`${count} 张`}>
                    <div className="creation-parameter-content">
                        <div className="creation-choice-grid is-count">
                            {countOptions.filter((option) => Number(option) <= imageProfile.maxOutputs).map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    aria-pressed={option === count}
                                    className={option === count ? "is-selected" : ""}
                                    onClick={() => onChangeCount(option)}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                        <label className="creation-custom-value">
                            <span>自定义</span>
                            <input
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={count}
                                onChange={(event) => onChangeCount(String(Math.max(1, Math.min(imageProfile.maxOutputs, Number(event.target.value) || 1))))}
                                aria-label={`生成数量，范围 1 到 ${imageProfile.maxOutputs}`}
                            />
                            <em>张</em>
                        </label>
                    </div>
                </SettingSection>
            ) : null}
        </div>
    );

    const handleOpenChange = (nextOpen: boolean) => {
        if (nextOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const spaceAbove = rect.top;
            const spaceBelow = window.innerHeight - rect.bottom;
            // 如果上面空间不够（< 480px），坚决往下不要往上，避免顶部菜单项被顶出屏幕点击不到
            if (spaceAbove < 480) {
                setComputedPlacement("bottomLeft");
                setAvailableMaxHeight(Math.max(240, Math.floor(spaceBelow - 16)));
            } else if (spaceBelow < 380) {
                // 上方空间充足（>= 480px）且下方空间不足（< 380px）时才往上弹
                setComputedPlacement("topLeft");
                setAvailableMaxHeight(Math.max(240, Math.floor(spaceAbove - 16)));
            } else {
                setComputedPlacement("bottomLeft");
                setAvailableMaxHeight(Math.max(240, Math.floor(spaceBelow - 16)));
            }
        }
        setOpen(nextOpen);
    };

    return (
        <Popover
            open={open}
            onOpenChange={handleOpenChange}
            trigger="click"
            placement={computedPlacement}
            autoAdjustOverflow={false}
            arrow={false}
            classNames={{
                root: "creation-control-popover",
                container: "creation-control-popover-surface",
                content: "creation-control-popover-content",
            }}
            content={panel}
        >
            <button
                ref={triggerRef}
                type="button"
                className="creation-chat-control"
                aria-label={`生成设置：${summary}`}
            >
                <SlidersHorizontal />
                <span>{summary}</span>
                <ChevronDown className={open ? "is-open" : ""} />
            </button>
        </Popover>
    );
}
