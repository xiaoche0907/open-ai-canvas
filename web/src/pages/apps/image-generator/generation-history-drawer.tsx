import { Button, Empty, Popconfirm } from "antd";
import { Download, RotateCcw, Trash2, Clock, X, Image as ImageIcon } from "lucide-react";
import { AppDrawer } from "@/components/ui/product/app-drawer";
import { downloadMediaFile } from "@/lib/media-download";
import type { ImageGenHistoryRecord } from "./types";

interface GenerationHistoryDrawerProps {
    open: boolean;
    onClose: () => void;
    records: ImageGenHistoryRecord[];
    onRestoreRecord: (record: ImageGenHistoryRecord) => void;
    onClearHistory: () => void;
}

function formatRelativeTime(dateStr: string) {
    try {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "刚刚";
        if (mins < 60) return `${mins} 分钟前`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} 小时前`;
        const days = Math.floor(hours / 24);
        return `${days} 天前`;
    } catch {
        return dateStr;
    }
}

export function GenerationHistoryDrawer({
    open,
    onClose,
    records,
    onRestoreRecord,
    onClearHistory,
}: GenerationHistoryDrawerProps) {
    return (
        <AppDrawer
            open={open}
            onClose={onClose}
            placement="right"
            width={400}
            title={
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", paddingRight: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 600 }}>
                        <Clock className="size-4" />
                        <span>图像生成历史</span>
                        <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted-foreground)" }}>
                            ({records.length})
                        </span>
                    </div>
                    {records.length > 0 && (
                        <Popconfirm
                            title="确定要清空全部生成历史吗？"
                            onConfirm={onClearHistory}
                            okText="清空"
                            cancelText="取消"
                        >
                            <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />}>
                                清空
                            </Button>
                        </Popconfirm>
                    )}
                </div>
            }
        >
            {records.length === 0 ? (
                <div style={{ padding: "60px 0", textAlign: "center", color: "var(--muted-foreground)" }}>
                    <ImageIcon className="size-12 mx-auto mb-3 opacity-30" />
                    <p style={{ fontSize: 14 }}>暂无图像生成历史</p>
                    <p style={{ fontSize: 12, opacity: 0.7 }}>生成成功后的作品会自动记录并同步至我的资产</p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 24 }}>
                    {records.map((rec) => {
                        const thumb = rec.results[0]?.url;
                        return (
                            <div
                                key={rec.id}
                                style={{
                                    borderRadius: "var(--r-lg, 12px)",
                                    border: "1px solid var(--border)",
                                    background: "var(--card)",
                                    padding: 12,
                                    display: "flex",
                                    gap: 12,
                                    alignItems: "flex-start",
                                    position: "relative",
                                }}
                            >
                                {/* 缩略图 */}
                                <div
                                    style={{
                                        width: 72,
                                        height: 72,
                                        borderRadius: "var(--r-md, 8px)",
                                        overflow: "hidden",
                                        background: "var(--surface, #1e1e1e)",
                                        flexShrink: 0,
                                    }}
                                >
                                    {thumb ? (
                                        <img
                                            src={thumb}
                                            alt={rec.title}
                                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                        />
                                    ) : (
                                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            <ImageIcon className="size-5 opacity-40" />
                                        </div>
                                    )}
                                </div>

                                {/* 信息与操作 */}
                                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {rec.title}
                                        </div>
                                        <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                                            {formatRelativeTime(rec.createdAt)}
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            fontSize: 12,
                                            color: "var(--muted-foreground)",
                                            overflow: "hidden",
                                            display: "-webkit-box",
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: "vertical",
                                            lineHeight: 1.4,
                                        }}
                                    >
                                        {rec.prompt}
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                                        <span style={{ fontSize: 11, color: "var(--muted-foreground)", background: "var(--control-selected-bg)", padding: "1px 6px", borderRadius: 4 }}>
                                            {rec.params.ratio} · {rec.model.split("/").pop()}
                                        </span>

                                        <div style={{ display: "flex", gap: 4 }}>
                                            {thumb && (
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    icon={<Download className="size-3" />}
                                                    title="下载原图"
                                                    onClick={() => void downloadMediaFile(thumb, `${rec.title}.png`)}
                                                />
                                            )}
                                            <Button
                                                size="small"
                                                type="primary"
                                                icon={<RotateCcw className="size-3" />}
                                                onClick={() => onRestoreRecord(rec)}
                                            >
                                                装载
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </AppDrawer>
    );
}
