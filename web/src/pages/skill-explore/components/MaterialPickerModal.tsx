import { useEffect, useMemo, useState } from "react";
import { FolderPlus, Image as ImageIcon, X } from "lucide-react";

import { CachedResourceImage } from "@/components/cached-resource-image";
import { AppModal } from "@/components/ui/product/app-modal";
import type { ImageAsset } from "@/stores/use-asset-store";

type MaterialTab = "brand" | "character" | "product" | "custom";

const TABS: { id: MaterialTab; label: string }[] = [
    { id: "brand", label: "品牌套件" },
    { id: "character", label: "角色" },
    { id: "product", label: "产品" },
    { id: "custom", label: "自定义" },
];

function materialTab(asset: ImageAsset): MaterialTab {
    if (asset.tags.some((tag) => /品牌套件|brand kit/i.test(tag))) return "brand";
    if (asset.category === "character") return "character";
    if (asset.category === "prop") return "product";
    return "custom";
}

export function MaterialPickerModal({ open, assets, selectedIds, onClose, onConfirm }: { open: boolean; assets: ImageAsset[]; selectedIds: string[]; onClose: () => void; onConfirm: (ids: string[]) => void }) {
    const [tab, setTab] = useState<MaterialTab>("brand");
    const [selected, setSelected] = useState<string[]>([]);
    const visible = useMemo(() => assets.filter((asset) => asset.status !== "archived" && materialTab(asset) === tab), [assets, tab]);

    useEffect(() => {
        if (open) setSelected(selectedIds);
    }, [open, selectedIds]);

    return <AppModal rootClassName="se-material-modal" open={open} title={null} footer={null} closable={false} centered width="min(720px, calc(100vw - 32px))" onCancel={onClose} flush>
        <div className="se-material-shell">
            <header className="se-material-header"><h2>选择素材</h2><button type="button" aria-label="关闭选择素材" onClick={onClose}><X size={18} /></button></header>
            <nav className="se-material-tabs" aria-label="素材分类">{TABS.map((item) => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
            <div className="se-material-grid-wrap">
                {visible.length ? <div className="se-material-grid">{visible.map((asset) => <button key={asset.id} type="button" className="se-material-card" aria-pressed={selected.includes(asset.id)} onClick={() => setSelected((current) => current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id])}>
                    <span>{asset.title || "未命名"}</span>
                    <CachedResourceImage storageKey={asset.data.storageKey} src={asset.coverUrl || asset.data.dataUrl} alt="" fallback={<ImageIcon size={22} aria-hidden="true" />} />
                </button>)}</div> : <div className="se-material-empty"><ImageIcon size={24} aria-hidden="true" /><span>这个分类暂无图片素材</span></div>}
            </div>
            <footer className="se-material-footer"><a href="/assets" target="_blank" rel="noopener noreferrer"><FolderPlus size={15} />新建</a><div><button type="button" onClick={onClose}>取消</button><button type="button" className="is-primary" disabled={!selected.length} onClick={() => onConfirm(selected)}>添加到对话{selected.length ? `（${selected.length}）` : ""}</button></div></footer>
        </div>
    </AppModal>;
}
