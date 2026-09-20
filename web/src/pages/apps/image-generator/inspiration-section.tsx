import { useState } from "react";
import { Sparkles, ArrowUpRight, ChevronDown } from "lucide-react";
import { Button } from "antd";
import { creationFeaturedWorks } from "@/pages/create/creation-inspirations";

interface InspirationSectionProps {
    onSelectPrompt: (prompt: string) => void;
}

type ModeFilter = "all" | "image" | "video" | "text";

const MODE_LABELS: Record<ModeFilter, string> = {
    all: "全部灵感",
    image: "图像精选",
    video: "视频分镜",
    text: "文案创意",
};

export function InspirationSection({ onSelectPrompt }: InspirationSectionProps) {
    const [activeFilter, setActiveFilter] = useState<ModeFilter>("all");
    const [displayCount, setDisplayCount] = useState(12);

    const filtered = creationFeaturedWorks.filter(
        (item) => activeFilter === "all" || item.mode === activeFilter,
    );

    const visibleItems = filtered.slice(0, displayCount);

    return (
        <section className="image-gen-inspiration-section" aria-label="精选灵感发现">
            <div className="image-gen-inspiration-header">
                <h2 className="image-gen-inspiration-title">
                    <Sparkles className="size-5" />
                    <span>精选灵感</span>
                    <span style={{ fontSize: 13, fontWeight: 400, color: "var(--muted-foreground)" }}>
                        {creationFeaturedWorks.length} 个创意起点 · 点击直接填入提示词
                    </span>
                </h2>

                {/* 筛选药丸 */}
                <div className="image-gen-inspiration-tabs">
                    {(["all", "image", "video", "text"] as const).map((filterKey) => {
                        const count = creationFeaturedWorks.filter(
                            (it) => filterKey === "all" || it.mode === filterKey,
                        ).length;
                        return (
                            <button
                                key={filterKey}
                                type="button"
                                className={`image-gen-tab-btn ${activeFilter === filterKey ? "is-active" : ""}`}
                                onClick={() => {
                                    setActiveFilter(filterKey);
                                    setDisplayCount(12);
                                }}
                            >
                                {MODE_LABELS[filterKey]} ({count})
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 灵感画廊网格 */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: 16,
                    width: "100%",
                }}
            >
                {visibleItems.map((item) => (
                    <div
                        key={item.title}
                        className="product-collection-card"
                        style={{
                            borderRadius: "var(--r-xl, 14px)",
                            border: "1px solid var(--border)",
                            background: "var(--card)",
                            overflow: "hidden",
                            display: "flex",
                            flexDirection: "column",
                            cursor: "pointer",
                            transition: "transform 0.2s ease, box-shadow 0.2s ease",
                            position: "relative",
                        }}
                        onClick={() => {
                            onSelectPrompt(item.prompt);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                    >
                        {/* 封面区域 */}
                        <div
                            style={{
                                position: "relative",
                                width: "100%",
                                aspectRatio: "16 / 10",
                                overflow: "hidden",
                                background: "var(--surface, #1e1e1e)",
                            }}
                        >
                            <img
                                src={item.image}
                                alt={item.title}
                                loading="lazy"
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    transition: "transform 0.3s ease",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = "scale(1.04)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = "scale(1)";
                                }}
                            />
                            <div
                                style={{
                                    position: "absolute",
                                    bottom: 8,
                                    right: 8,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    background: "rgba(0,0,0,0.7)",
                                    backdropFilter: "blur(8px)",
                                    color: "#ffffff",
                                    fontSize: 11,
                                    padding: "3px 8px",
                                    borderRadius: "var(--r-full, 9999px)",
                                }}
                            >
                                <ArrowUpRight className="size-3" />
                                <span>使用这个创意</span>
                            </div>
                        </div>

                        {/* 文案区域 */}
                        <div style={{ padding: "12px 14px 14px", flex: 1, display: "flex", flexDirection: "column" }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--foreground)", marginBottom: 4 }}>
                                {item.title}
                            </div>
                            <div
                                style={{
                                    fontSize: 12,
                                    color: "var(--muted-foreground)",
                                    lineHeight: 1.5,
                                    flex: 1,
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                }}
                            >
                                {item.description}
                            </div>
                            <div
                                style={{
                                    marginTop: 8,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    fontSize: 11,
                                    color: "var(--muted-foreground)",
                                }}
                            >
                                <span>{item.source ? "精选模版" : "原创指令"}</span>
                                <span style={{ textTransform: "capitalize" }}>{MODE_LABELS[item.mode] || item.mode}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* 底部展开更多 */}
            {displayCount < filtered.length && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
                    <Button
                        onClick={() => setDisplayCount((c) => c + 12)}
                        icon={<ChevronDown className="size-3.5" />}
                    >
                        展开更多灵感 ({filtered.length - displayCount} 个)
                    </Button>
                </div>
            )}
        </section>
    );
}
