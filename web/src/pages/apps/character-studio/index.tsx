import { useMemo, useState, type ReactNode } from "react";
import { App } from "antd";
import {
    ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Eye, Info, LayoutGrid,
    Layers, Minus, Palette, Plus, Rows, ScanFace, Search, Shirt, Sliders, Smile,
    Sparkles, UploadCloud, UserRound, Wand2, X,
} from "lucide-react";

import "./character-studio.css";

const modelFemale = "/images/apps/tryon/model-female.png";
const modelMale = "/images/apps/tryon/model-male.png";
const streetFemale = "/images/apps/tryon/editorial.jpg";

interface CharacterSummary {
    id: string;
    name: string;
    coverUrl: string;
    gender: "男" | "女";
    ageGroup: "少年" | "青年" | "中年" | "老年";
    culturalRegion: string;
    styleTags: string[];
    source: "user" | "official";
}

const LIBRARY: CharacterSummary[] = [
    { id: "m1", name: "霸总/精英大佬", coverUrl: modelMale, gender: "男", ageGroup: "青年", culturalRegion: "东亚", styleTags: ["现代", "商务"], source: "user" },
    { id: "m2", name: "冷艳超模", coverUrl: modelFemale, gender: "女", ageGroup: "青年", culturalRegion: "欧美", styleTags: ["高定", "冷感"], source: "user" },
    { id: "m3", name: "元气少女", coverUrl: streetFemale, gender: "女", ageGroup: "少年", culturalRegion: "东亚", styleTags: ["休闲", "甜美"], source: "user" },
    { id: "o1", name: "古典公子", coverUrl: modelMale, gender: "男", ageGroup: "青年", culturalRegion: "东亚", styleTags: ["古风", "儒雅"], source: "official" },
    { id: "o2", name: "复古名媛", coverUrl: modelFemale, gender: "女", ageGroup: "中年", culturalRegion: "欧美", styleTags: ["复古", "优雅"], source: "official" },
    { id: "o3", name: "街头少年", coverUrl: streetFemale, gender: "男", ageGroup: "少年", culturalRegion: "东南亚", styleTags: ["街头", "潮流"], source: "official" },
];

interface StudioSlider { key: string; label: string; min: number; max: number; info?: boolean }
const SKIN_SLIDERS: StudioSlider[] = [
    { key: "texture", label: "质感磨皮", min: -100, max: 100 },
    { key: "beauty", label: "AI 美颜（脸部）", min: 0, max: 100 },
    { key: "skinTexture", label: "皮肤纹理（脸部）", min: -100, max: 100 },
    { key: "glow", label: "皮肤透亮", min: 0, max: 100 },
    { key: "ruddiness", label: "皮肤红润", min: 0, max: 100 },
    { key: "whiten", label: "皮肤美白", min: 0, max: 100 },
];
const BODY_SLIDERS: StudioSlider[] = [
    { key: "breast", label: "丰胸", min: -100, max: 100, info: true },
    { key: "height", label: "AI 增高", min: 0, max: 100, info: true },
    { key: "hunchback", label: "驼背", min: -100, max: 100, info: true },
    { key: "legs", label: "长腿", min: -100, max: 100 },
    { key: "shoulders", label: "直角肩", min: -100, max: 100 },
    { key: "head", label: "小头", min: -100, max: 100 },
    { key: "slim", label: "瘦身", min: -100, max: 100 },
    { key: "belly", label: "瘦肚子", min: -100, max: 100 },
    { key: "arms", label: "瘦手臂", min: -100, max: 100 },
    { key: "waist", label: "美腰", min: -100, max: 100 },
    { key: "fullBody", label: "全身美型", min: -100, max: 100 },
];
const VOICE_SLIDERS: StudioSlider[] = [
    { key: "pitch", label: "音高", min: -100, max: 100 },
    { key: "speed", label: "语速", min: -100, max: 100 },
    { key: "emotion", label: "情绪", min: 0, max: 100 },
    { key: "age", label: "年龄感", min: 0, max: 100 },
    { key: "genderFeel", label: "性别感", min: -100, max: 100 },
    { key: "accent", label: "地域口音", min: 0, max: 100 },
];

const MAKEUP_CATEGORIES = ["眉毛", "美瞳", "卧蚕", "眼影", "睫毛", "修容", "腮红", "唇彩", "妆饰", "眼线", "高光"];
const EYEBROW_PRESETS = ["无", "自然", "直眉", "英气", "弯月", "高挑", "浓密", "小挑眉", "野生", "原生", "古典", "丝雾", "棕雾", "毛绒"];
const FEATURE_PRESETS = ["痣", "疤痕深", "疤痕浅", "全脸雀斑", "脸颊雀斑", "自定义"];
const HAIR_CATEGORIES = ["现代", "古风", "民国", "仙侠", "科幻", "民族", "儿童"];
const HAIR_PRESETS = ["寸头", "背头", "油头", "短碎发", "中分", "卷发"];
const HAIR_COLORS = ["黑", "深棕", "棕", "浅棕", "金棕", "浅金", "灰", "银白"];
const HAIR_COLOR_HEX: Record<string, string> = { 黑: "#111111", 深棕: "#4a3228", 棕: "#6b4423", 浅棕: "#8b5a2b", 金棕: "#a86b32", 浅金: "#c98f4e", 灰: "#8a8a8f", 银白: "#d8d8dc" };
const OUTFIT_CATEGORIES = ["现代", "古风", "仙侠", "民国", "科幻", "礼服", "民族"];
const OUTFIT_PRESETS = ["便装", "西装", "休闲", "礼服", "运动", "汉服", "皮衣", "牛仔"];

const FACE_VIEWS: Record<string, string> = { face: "头肩 / 半身近景", feature: "脸部 / 半身", body: "全身", styling: "全身", voice: "半身 / 当前状态" };

function initSliderState(sliders: StudioSlider[]) {
    return Object.fromEntries(sliders.map((s) => [s.key, 0]));
}

function SliderRow({ slider, value, onChange, onDirty }: { slider: StudioSlider; value: number; onChange: (key: string, value: number) => void; onDirty: () => void }) {
    return (
        <div className="cstudio-slider-row">
            <span>{slider.label}{slider.info && <Info size={13} aria-label="该参数支持正负调整" />}</span>
            <output>{value > 0 ? `+${value}` : value}</output>
            <input
                className="cstudio-range"
                type="range"
                min={slider.min}
                max={slider.max}
                value={value}
                aria-label={slider.label}
                onChange={(e) => { onChange(slider.key, Number(e.target.value)); onDirty(); }}
            />
        </div>
    );
}

function Chips({ options, value, onSelect }: { options: string[]; value: string; onSelect: (v: string) => void }) {
    return (
        <div className="cstudio-chips" role="group">
            {options.map((option) => (
                <button key={option} type="button" className={`cstudio-chip ${value === option ? "is-active" : ""}`} aria-pressed={value === option} onClick={() => onSelect(option)}>{option}</button>
            ))}
        </div>
    );
}

function PresetGrid({ items, selected, onSelect, emptyLabel, thumb }: { items: string[]; selected?: string; onSelect: (v: string) => void; emptyLabel?: string; thumb?: (name: string) => ReactNode }) {
    if (!items.length) return <div className="cstudio-preset-empty">{emptyLabel || "暂无素材"}</div>;
    return (
        <div className="cstudio-preset-grid">
            {items.map((name) => (
                <button key={name} type="button" className={`cstudio-preset-card ${selected === name ? "is-selected" : ""}`} onClick={() => onSelect(name)}>
                    <span className="cstudio-preset-thumb" aria-hidden>{thumb ? thumb(name) : null}</span>
                    <span>{name}</span>
                    {selected === name && <Check size={14} className="cstudio-preset-check" style={{ position: "absolute", top: 8, right: 8, padding: 2, borderRadius: "50%", background: "var(--foreground)", color: "var(--background)" }} />}
                </button>
            ))}
        </div>
    );
}

export function CharacterStudioWorkspace({ onBack }: { onBack: () => void }) {
    const { message } = App.useApp();
    const [view, setView] = useState<"library" | "editor">("library");
    const [libTab, setLibTab] = useState<"mine" | "official">("mine");
    const [genderFilter, setGenderFilter] = useState("全部");
    const [ageFilter, setAgeFilter] = useState("全部");
    const [regionFilter, setRegionFilter] = useState("全部");
    const [query, setQuery] = useState("");
    const [viewMode, setViewMode] = useState<"carousel" | "grid">("carousel");
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selected, setSelected] = useState<CharacterSummary | null>(null);
    const [isCopy, setIsCopy] = useState(false);

    const [editorTab, setEditorTab] = useState<"face" | "feature" | "body" | "styling" | "voice">("face");
    const [faceTab, setFaceTab] = useState<"skin" | "eyes" | "nose" | "lips" | "face" | "makeup">("skin");
    const [stylingTab, setStylingTab] = useState<"hair" | "outfit" | "ai">("hair");
    const [hairCategory, setHairCategory] = useState("现代");
    const [outfitCategory, setOutfitCategory] = useState("现代");
    const [makeupCategory, setMakeupCategory] = useState("眉毛");
    const [hairColor, setHairColor] = useState("黑");
    const [sliders, setSliders] = useState(() => ({ ...initSliderState(SKIN_SLIDERS), ...initSliderState(BODY_SLIDERS), ...initSliderState(VOICE_SLIDERS) }));
    const [toggles, setToggles] = useState<Record<string, boolean>>({ freckleRemoval: false });
    const [presets, setPresets] = useState<Record<string, string>>({});
    const [dirty, setDirty] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [versionCount, setVersionCount] = useState(1);
    const [saveAsAsset, setSaveAsAsset] = useState(true);
    const [zoom, setZoom] = useState(100);
    const [aiScheme, setAiScheme] = useState<string | null>(null);

    const filteredCharacters = useMemo(() => {
        const list = libTab === "mine" ? LIBRARY.filter((c) => c.source === "user") : LIBRARY.filter((c) => c.source === "official");
        return list.filter((c) =>
            (genderFilter === "全部" || c.gender === genderFilter) &&
            (ageFilter === "全部" || c.ageGroup === ageFilter) &&
            (regionFilter === "全部" || c.culturalRegion === regionFilter) &&
            (!query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase()) || c.styleTags.some((t) => t.includes(query.trim())))
        );
    }, [libTab, genderFilter, ageFilter, regionFilter, query]);

    const currentCharacter = filteredCharacters[currentIndex] || null;

    const setSlider = (key: string, value: number) => setSliders((current) => ({ ...current, [key]: value }));
    const markDirty = () => { setDirty(true); setGeneratedAt(null); };
    const [generatedAt, setGeneratedAt] = useState<string | null>(null);

    const editCharacter = (character: CharacterSummary, copy = false) => {
        setSelected(character);
        setIsCopy(copy);
        setView("editor");
        setDirty(false);
        setVersionCount(1);
        setAiScheme(null);
        setEditorTab("face");
        setFaceTab("skin");
        setPresets({});
        setSliders({ ...initSliderState(SKIN_SLIDERS), ...initSliderState(BODY_SLIDERS), ...initSliderState(VOICE_SLIDERS) });
        setToggles({ freckleRemoval: false });
    };

    const createCharacter = () => {
        message.info("创建新角色：可从资产库选择参考图，或使用当前角色复制进入编辑器");
        const base = currentCharacter || LIBRARY[0];
        editCharacter({ ...base, id: `new-${Date.now()}`, name: "新角色", styleTags: ["待定义"] }, true);
    };

    const handleGenerate = () => {
        if (!dirty && !aiScheme) { message.info("暂无参数改动，调整任意参数后即可生成"); return; }
        setGenerating(true);
        window.setTimeout(() => {
            setGenerating(false);
            setDirty(false);
            setGeneratedAt("刚刚");
            message.success("已按当前参数生成新的角色预览");
        }, 1200);
    };

    const saveCharacter = () => {
        message.success(`角色「${selected?.name}」已保存为新版本 v${versionCount}`);
        setVersionCount((v) => v + 1);
    };

    const saveToCanvas = () => {
        message.success("角色已保存并作为资产添加至当前画布");
        onBack();
    };

    const handleAiStyling = () => {
        setAiScheme("发型：现代纹理烫 · 发色：深棕\n妆容：自然清透妆\n服装：都市休闲西装\n整体风格：轻奢商务 · 都市精英");
        markDirty();
        message.success("已根据输入生成造型方案，可确认生成");
    };

    const previewSrc = selected?.coverUrl || modelMale;
    const viewBadge = FACE_VIEWS[editorTab];

    /* ── 角色库视图 ─────────────────────────────── */
    if (view === "library") {
        return (
            <div className="cstudio-workspace">
                <header className="cstudio-topbar">
                    <div className="cstudio-topbar-left">
                        <button type="button" className="cstudio-back-button" onClick={onBack}><ArrowLeft size={16} />返回 AI 应用</button>
                        <div className="cstudio-topbar-title">
                            <span className="cstudio-topbar-mark"><UserRound size={17} /></span>
                            <strong>角色造型室</strong>
                            <span className="cstudio-topbar-caption" style={{ color: "var(--muted-foreground)", fontSize: 12 }}>角色资产管理 · 编辑 · 生成</span>
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button type="button" className="cstudio-primary-button" onClick={createCharacter}><Plus size={15} />创建新角色</button>
                        <button type="button" className="cstudio-icon-button" aria-label="关闭角色造型室" onClick={onBack}><X size={16} /></button>
                    </div>
                </header>

                <div className="cstudio-library">
                    <div className="cstudio-lib-tabs" role="tablist" aria-label="角色库来源">
                        <button type="button" role="tab" aria-selected={libTab === "mine"} className={libTab === "mine" ? "is-active" : ""} onClick={() => { setLibTab("mine"); setCurrentIndex(0); }}>我的角色库 <span>{LIBRARY.filter((c) => c.source === "user").length}</span></button>
                        <button type="button" role="tab" aria-selected={libTab === "official"} className={libTab === "official" ? "is-active" : ""} onClick={() => { setLibTab("official"); setCurrentIndex(0); }}>官方角色库 <span>{LIBRARY.filter((c) => c.source === "official").length}</span></button>
                    </div>

                    <div className="cstudio-lib-toolbar">
                        <div className="cstudio-lib-filters">
                            <select className="cstudio-filter-select" value={genderFilter} aria-label="性别" onChange={(e) => { setGenderFilter(e.target.value); setCurrentIndex(0); }}><option>全部</option><option>男</option><option>女</option></select>
                            <select className="cstudio-filter-select" value={ageFilter} aria-label="年龄段" onChange={(e) => { setAgeFilter(e.target.value); setCurrentIndex(0); }}><option>全部</option><option>少年</option><option>青年</option><option>中年</option><option>老年</option></select>
                            <select className="cstudio-filter-select" value={regionFilter} aria-label="文化区域" onChange={(e) => { setRegionFilter(e.target.value); setCurrentIndex(0); }}><option>全部</option><option>东亚</option><option>欧美</option><option>东南亚</option><option>中东</option><option>拉美</option></select>
                            <div className="cstudio-lib-search"><Search size={14} /><input type="text" placeholder="搜索角色" value={query} onChange={(e) => { setQuery(e.target.value); setCurrentIndex(0); }} /></div>
                        </div>
                        <div className="cstudio-lib-toolbar-right">
                            <div className="cstudio-view-switch" role="group" aria-label="视图切换">
                                <button type="button" aria-label="轮播视图" aria-pressed={viewMode === "carousel"} className={viewMode === "carousel" ? "is-active" : ""} onClick={() => setViewMode("carousel")}><LayoutGrid size={15} /></button>
                                <button type="button" aria-label="网格视图" aria-pressed={viewMode === "grid"} className={viewMode === "grid" ? "is-active" : ""} onClick={() => setViewMode("grid")}><Rows size={15} /></button>
                            </div>
                        </div>
                    </div>

                    <div className="cstudio-lib-body">
                        {viewMode === "grid" ? (
                            <div className="cstudio-preset-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", width: "100%", maxWidth: 860 }}>
                                {filteredCharacters.map((character) => (
                                    <button key={character.id} type="button" className={`cstudio-preset-card ${selected?.id === character.id ? "is-selected" : ""}`} onClick={() => setSelected(character)}>
                                        <span className="cstudio-preset-thumb"><img src={character.coverUrl} alt={character.name} /></span>
                                        <span>{character.name}</span>
                                        <span style={{ color: "var(--muted-foreground)" }}>{character.gender} · {character.ageGroup} · {character.culturalRegion}</span>
                                    </button>
                                ))}
                                {!filteredCharacters.length && <div className="cstudio-preset-empty">没有符合条件的角色</div>}
                            </div>
                        ) : filteredCharacters.length ? (
                            <div className="cstudio-carousel-wrap">
                                <div className="cstudio-carousel-row">
                                    <button type="button" className="cstudio-carousel-arrow" aria-label="上一个角色" disabled={filteredCharacters.length <= 1} onClick={() => setCurrentIndex((currentIndex + filteredCharacters.length - 1) % filteredCharacters.length)}><ChevronLeft size={18} /></button>
                                    <div className="cstudio-carousel" role="list" aria-label="角色轮播">
                                        {filteredCharacters.map((character, index) => {
                                            const offset = (index - currentIndex + filteredCharacters.length) % filteredCharacters.length;
                                            const isCurrent = offset === 0;
                                            if (offset !== 0 && offset !== 1 && offset !== filteredCharacters.length - 1) return null;
                                            return (
                                                <div key={character.id} role="listitem" className={`cstudio-carousel-card ${isCurrent ? "is-current" : "is-dim"}`} onClick={() => { if (!isCurrent) setCurrentIndex(index); else setSelected(character); }} style={{ cursor: "pointer" }}>
                                                    {character.source === "official" && <span className="cstudio-carousel-badge">官方</span>}
                                                    <img src={character.coverUrl} alt={character.name} />
                                                    <div className="cstudio-carousel-meta">
                                                        <strong>{character.name}</strong>
                                                        <span>{character.gender} · {character.ageGroup} · {character.culturalRegion} · {character.styleTags.join(" / ")}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <button type="button" className="cstudio-carousel-arrow" aria-label="下一个角色" disabled={filteredCharacters.length <= 1} onClick={() => setCurrentIndex((currentIndex + 1) % filteredCharacters.length)}><ChevronRight size={18} /></button>
                                </div>
                                {currentCharacter && <div className="cstudio-carousel-name">{currentCharacter.name}{currentCharacter.source === "user" ? " - 副本" : ""}</div>}
                            </div>
                        ) : (
                            <div className="cstudio-carousel-empty"><UserRound size={40} />没有符合条件的角色，试试调整筛选条件</div>
                        )}
                    </div>

                    <div className="cstudio-lib-footer">
                        <button type="button" className="cstudio-ghost-button" onClick={createCharacter}><Plus size={15} />创建新角色</button>
                        <div className="cstudio-lib-footer-actions">
                            <button type="button" className="cstudio-ghost-button" disabled={!currentCharacter} onClick={() => currentCharacter && message.info("已将该角色作为 Canvas Asset 添加至当前画布")}><Layers size={15} />添加到画布</button>
                            <button type="button" className="cstudio-primary-button" disabled={!currentCharacter} onClick={() => currentCharacter && editCharacter(currentCharacter)}><Sliders size={15} />编辑角色</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    /* ── 角色编辑器视图 ─────────────────────────── */
    return (
        <div className="cstudio-workspace">
            <header className="cstudio-topbar">
                <div className="cstudio-topbar-left">
                    <button type="button" className="cstudio-back-button" onClick={() => setView("library")}><ArrowLeft size={16} />角色库</button>
                    <div className="cstudio-topbar-title">
                        <strong>{selected?.name}{isCopy && <span className="cstudio-copy-badge">- 副本</span>}</strong>
                        <div className="cstudio-topbar-tags">
                            <span>{selected?.ageGroup}</span><span>{selected?.culturalRegion}</span><span>{selected?.styleTags[0]}</span>
                        </div>
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="cstudio-demo-badge" style={{ color: "var(--muted-foreground)", fontSize: 11, border: "1px solid var(--border)", padding: "4px 10px", borderRadius: 999 }}>示例演示 · 生成能力接入中</span>
                    <button type="button" className="cstudio-icon-button" aria-label="关闭角色造型室" onClick={onBack}><X size={16} /></button>
                </div>
            </header>

            <div className="cstudio-editor">
                <div className="cstudio-editor-layout">
                    <nav className="cstudio-ed-nav" aria-label="角色编辑模块">
                        {([
                            ["face", "脸部精修", true],
                            ["feature", "脸部 & 身体特征", false],
                            ["body", "身材塑形", true],
                            ["styling", "服装造型", false],
                            ["voice", "音色音调", false],
                        ] as const).map(([key, label, free]) => (
                            <button key={key} type="button" className={editorTab === key ? "is-active" : ""} aria-current={editorTab === key ? "page" : undefined} onClick={() => { setEditorTab(key); if (key === "body" || key === "styling") setZoom(70); else setZoom(100); setAiScheme(null); }}>
                                <span>{label}</span>
                                {free && <span className="cstudio-free-badge">限免</span>}
                            </button>
                        ))}
                    </nav>

                    <div className="cstudio-preview">
                        <span className="cstudio-preview-view-badge">{viewBadge}</span>
                        {dirty && <span className="cstudio-preview-dirty-note">当前改动未生成</span>}
                        <img src={previewSrc} alt={`${selected?.name || "角色"}预览`} style={{ transform: `scale(${zoom / 100})` }} />
                        <span className="cstudio-preview-zoom-hint">
                            <button type="button" aria-label="缩小预览" onClick={() => setZoom(Math.max(60, zoom - 10))}><Minus size={13} /></button>
                            <span>{zoom}%</span>
                            <button type="button" aria-label="放大预览" onClick={() => setZoom(Math.min(160, zoom + 10))}><Plus size={13} /></button>
                        </span>
                    </div>

                    <aside className="cstudio-inspector" aria-label="编辑参数">
                        {editorTab === "face" && (
                            <>
                                <div className="cstudio-inspector-tabs" role="tablist" aria-label="脸部精修分类">
                                    {([["skin", "皮肤", Palette], ["eyes", "眉眼/眼睛", Eye], ["nose", "鼻子", Sliders], ["lips", "嘴唇", Smile], ["face", "脸部", ScanFace], ["makeup", "妆造", Sparkles]] as const).map(([key, label, Icon]) => (
                                        <button key={key} type="button" role="tab" aria-selected={faceTab === key} className={faceTab === key ? "is-active" : ""} onClick={() => setFaceTab(key)}><Icon size={15} aria-hidden />{label}</button>
                                    ))}
                                </div>
                                <div className="cstudio-inspector-scroll">
                                    {faceTab === "skin" && (
                                        <div className="cstudio-panel">
                                            <p className="cstudio-panel-note">通过滑块精细调整皮肤质感与气色，左右眼独立项可拆分控制。</p>
                                            {SKIN_SLIDERS.map((slider) => <div className="cstudio-slider-group" key={slider.key}><SliderRow slider={slider} value={sliders[slider.key]} onChange={setSlider} onDirty={markDirty} /></div>)}
                                            <div className="cstudio-toggle-row"><span>祛斑祛痘</span><input id="cs-freckle" type="checkbox" checked={toggles.freckleRemoval} onChange={(e) => { setToggles({ freckleRemoval: e.target.checked }); markDirty(); }} /><label htmlFor="cs-freckle" className="cstudio-switch" aria-hidden /></div>
                                        </div>
                                    )}
                                    {faceTab === "eyes" && (
                                        <div className="cstudio-panel">
                                            <p className="cstudio-panel-note">已确认参数：祛黑眼圈、亮眼（左右）、眼睛大小（左右）、眼宽（左）；后续可扩展眼距、眼角、眼睑等。</p>
                                            {([["darkCircle", "祛黑眼圈", 0, 100], ["brightLeft", "亮眼（左）", 0, 100], ["brightRight", "亮眼（右）", 0, 100], ["sizeLeft", "眼睛大小（左）", -100, 100], ["sizeRight", "眼睛大小（右）", -100, 100], ["widthLeft", "眼宽（左）", -100, 100]] as const).map(([key, label, min, max]) => (
                                                <div className="cstudio-slider-group" key={key}><SliderRow slider={{ key, label, min, max }} value={sliders[key] ?? 0} onChange={setSlider} onDirty={markDirty} /></div>
                                            ))}
                                        </div>
                                    )}
                                    {faceTab === "nose" && (
                                        <div className="cstudio-panel">
                                            {([["bridge", "山根", -100, 100], ["noseBridge", "鼻梁", -100, 100], ["noseTip", "鼻尖", -100, 100], ["noseLength", "鼻子长短", -100, 100], ["noseSize", "鼻子大小", -100, 100], ["nostril", "鼻翼", -100, 100]] as const).map(([key, label, min, max]) => (
                                                <div className="cstudio-slider-group" key={key}><SliderRow slider={{ key, label, min, max } as never} value={sliders[key] ?? 0} onChange={setSlider} onDirty={markDirty} /></div>
                                            ))}
                                        </div>
                                    )}
                                    {faceTab === "lips" && (
                                        <div className="cstudio-panel">
                                            {([["mouthUpDown", "嘴巴上下", -100, 100], ["lipFill", "丰唇", 0, 100], ["mouthWidth", "嘴巴宽度", -100, 100], ["lipCorner", "嘴角调整", -100, 100], ["mouthSize", "嘴巴大小", -100, 100], ["lipLine", "祛唇纹", 0, 100], ["lipColor", "唇妆增强", 0, 100]] as const).map(([key, label, min, max]) => (
                                                <div className="cstudio-slider-group" key={key}><SliderRow slider={{ key, label, min, max } as never} value={sliders[key] ?? 0} onChange={setSlider} onDirty={markDirty} /></div>
                                            ))}
                                        </div>
                                    )}
                                    {faceTab === "face" && (
                                        <div className="cstudio-panel">
                                            {([["forehead", "额头", -100, 100], ["vFace", "V 脸", 0, 100], ["faceWidth", "脸部宽度", -100, 100], ["chin", "下巴高度", -100, 100], ["jawLeft", "下颌（左）", -100, 100], ["jawRight", "下颌（右）", -100, 100], ["cheekLeft", "颧骨（左）", -100, 100], ["cheekRight", "颧骨（右）", -100, 100], ["midFace", "中庭", -100, 100], ["lowerFace", "下庭", -100, 100]] as const).map(([key, label, min, max]) => (
                                                <div className="cstudio-slider-group" key={key}><SliderRow slider={{ key, label, min, max } as never} value={sliders[key] ?? 0} onChange={setSlider} onDirty={markDirty} /></div>
                                            ))}
                                        </div>
                                    )}
                                    {faceTab === "makeup" && (
                                        <div className="cstudio-panel">
                                            <p className="cstudio-panel-title">妆容素材</p>
                                            <Chips options={MAKEUP_CATEGORIES} value={makeupCategory} onSelect={(v) => { setMakeupCategory(v); markDirty(); }} />
                                            <PresetGrid items={makeupCategory === "眉毛" ? EYEBROW_PRESETS : [makeupCategory, `${makeupCategory} · 01`, `${makeupCategory} · 02`, `${makeupCategory} · 03`, `${makeupCategory} · 04`, `${makeupCategory} · 05`]} selected={presets[`makeup:${makeupCategory}`]} onSelect={(v) => { setPresets((p) => ({ ...p, [`makeup:${makeupCategory}`]: v })); markDirty(); }} />
                                            <button type="button" className="cstudio-upload-card" onClick={() => message.info("自定义妆容素材上传能力接入中")}><UploadCloud size={18} />上传自定义妆容素材</button>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {editorTab === "feature" && (
                            <>
                                <div className="cstudio-inspector-scroll">
                                    <div className="cstudio-panel">
                                        <p className="cstudio-panel-title">纹身 & 疤痕</p>
                                        <PresetGrid items={FEATURE_PRESETS} selected={presets.feature} onSelect={(v) => { setPresets((p) => ({ ...p, feature: v })); markDirty(); }} thumb={() => null} />
                                        <p className="cstudio-panel-title" style={{ marginTop: 6 }}>自定义面部素材</p>
                                        <button type="button" className="cstudio-upload-card" onClick={() => message.info("自定义面部素材上传能力接入中")}><UploadCloud size={18} />上传自定义素材</button>
                                    </div>
                                </div>
                            </>
                        )}

                        {editorTab === "body" && (
                            <div className="cstudio-inspector-scroll">
                                <div className="cstudio-panel">
                                    <p className="cstudio-panel-note">进入该模块后中央预览自动切换为全身。</p>
                                    {BODY_SLIDERS.map((slider) => <div className="cstudio-slider-group" key={slider.key}><SliderRow slider={slider} value={sliders[slider.key]} onChange={setSlider} onDirty={markDirty} /></div>)}
                                </div>
                            </div>
                        )}

                        {editorTab === "styling" && (
                            <>
                                <div className="cstudio-inspector-tabs" role="tablist" aria-label="服装造型分类">
                                    {([["hair", "发型 / 头部造型"], ["outfit", "服装"], ["ai", "AI 智能造型"]] as const).map(([key, label]) => (
                                        <button key={key} type="button" role="tab" aria-selected={stylingTab === key} className={stylingTab === key ? "is-active" : ""} onClick={() => setStylingTab(key)}>{label}</button>
                                    ))}
                                </div>
                                <div className="cstudio-inspector-scroll">
                                    {stylingTab === "hair" && (
                                        <div className="cstudio-panel">
                                            <p className="cstudio-panel-title">发型</p>
                                            <Chips options={HAIR_CATEGORIES} value={hairCategory} onSelect={(v) => { setHairCategory(v); markDirty(); }} />
                                            <div className="cstudio-mini-grid">
                                                {HAIR_PRESETS.map((name) => (
                                                    <button key={name} type="button" className={`cstudio-mini-card ${presets.hair === name ? "is-selected" : ""}`} onClick={() => { setPresets((p) => ({ ...p, hair: name })); markDirty(); }}>
                                                        <span className="cstudio-mini-thumb" aria-hidden />
                                                        <span>{name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="cstudio-panel-title">发色</p>
                                            <div className="cstudio-swatches">
                                                {HAIR_COLORS.map((color) => (
                                                    <button key={color} type="button" className={`cstudio-swatch ${hairColor === color ? "is-selected" : ""}`} aria-label={`发色 ${color}`} aria-pressed={hairColor === color} style={{ background: HAIR_COLOR_HEX[color] }} onClick={() => { setHairColor(color); markDirty(); }} />
                                                ))}
                                                <button type="button" className="cstudio-swatch is-custom" aria-label="自定义调色板" onClick={() => message.info("自定义调色板能力接入中")} />
                                            </div>
                                            <p className="cstudio-panel-title">妆容</p>
                                            <Chips options={["自然", "日常", "浓妆", "复古", "舞台"]} value={presets.hairMakeup || "自然"} onSelect={(v) => { setPresets((p) => ({ ...p, hairMakeup: v })); markDirty(); }} />
                                        </div>
                                    )}
                                    {stylingTab === "outfit" && (
                                        <div className="cstudio-panel">
                                            <Chips options={OUTFIT_CATEGORIES} value={outfitCategory} onSelect={(v) => { setOutfitCategory(v); markDirty(); }} />
                                            <div className="cstudio-outfit-grid">
                                                {OUTFIT_PRESETS.map((name) => (
                                                    <button key={name} type="button" className={`cstudio-outfit-card ${presets.outfit === name ? "is-selected" : ""}`} onClick={() => { setPresets((p) => ({ ...p, outfit: name })); markDirty(); }}>
                                                        <span className="cstudio-outfit-thumb"><Shirt size={22} /></span>
                                                        <span>{name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <button type="button" className="cstudio-upload-card" onClick={() => message.info("自定义服装素材上传能力接入中")}><UploadCloud size={18} />上传自定义服装</button>
                                        </div>
                                    )}
                                    {stylingTab === "ai" && (
                                        <div className="cstudio-panel">
                                            <p className="cstudio-panel-note">输入风格、年龄、场景、职业与品牌调性，系统自动给出发型、发色、妆容、服装的组合方案。</p>
                                            <div className="cstudio-ai-form">
                                                <label>风格方向<input type="text" placeholder="如：轻奢商务 / 复古文艺" /></label>
                                                <label>年龄段<select><option>少年</option><option>青年</option><option>中年</option><option>老年</option></select></label>
                                                <label>应用场景<input type="text" placeholder="如：都市通勤 / 秀场 / 广告大片" /></label>
                                                <label>职业 / 人设<input type="text" placeholder="如：企业高管 / 品牌主理人" /></label>
                                                <label>品牌调性<input type="text" placeholder="如：极简 / 高奢 / 街头" /></label>
                                                <label>服装方向<input type="text" placeholder="如：西装 / 礼服 / 休闲" /></label>
                                                <button type="button" className="cstudio-primary-button" onClick={handleAiStyling}><Wand2 size={15} />生成造型方案</button>
                                            </div>
                                            {aiScheme && (
                                                <div className="cstudio-ai-scheme">
                                                    <strong>方案预览（生成前需确认）</strong>
                                                    {aiScheme.split("\n").map((line) => <span key={line}>{line}</span>)}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {editorTab === "voice" && (
                            <div className="cstudio-inspector-scroll">
                                <div className="cstudio-panel">
                                    <p className="cstudio-panel-title">音色音调</p>
                                    <p className="cstudio-panel-note">V1 保留 UI 入口，具体能力后续单独开发；角色资产中预留 Voice Profile ID。</p>
                                    <div className="cstudio-voice-list">
                                        {VOICE_SLIDERS.map((slider) => <div className="cstudio-slider-group" key={slider.key}><SliderRow slider={slider} value={sliders[slider.key] ?? 0} onChange={setSlider} onDirty={markDirty} /></div>)}
                                    </div>
                                    <div className="cstudio-voice-note">音色：使用示例音色（暂不可试听）<br />Voice Profile ID：voice_prof_demo_001</div>
                                </div>
                            </div>
                        )}

                        <div className="cstudio-generate-bar">
                            <button type="button" className="cstudio-magic-button" onClick={() => message.info("AI 魔法棒：将基于当前参数自动推荐调整方案，能力接入中")}><Wand2 size={15} />AI 魔法棒</button>
                            <span>{generating ? "正在生成…" : generatedAt ? `上次生成 ${generatedAt}` : "参数可随时修改"}</span>
                            <button type="button" className="cstudio-primary-button" disabled={generating} onClick={handleGenerate}><Sparkles size={15} />{generating ? "生成中…" : "确认生成"}</button>
                        </div>
                    </aside>
                </div>

                <footer className="cstudio-editor-footer">
                    <label className="cstudio-save-asset-check">
                        <input type="checkbox" checked={saveAsAsset} onChange={(e) => setSaveAsAsset(e.target.checked)} />
                        <span className="cstudio-switch" aria-hidden />
                        <span>保存时生成角色资产</span>
                        <kbd>⌘↵</kbd>
                    </label>
                    <div className="cstudio-editor-footer-actions">
                        <button type="button" className="cstudio-ghost-button" onClick={saveCharacter}><Check size={15} />保存</button>
                        <button type="button" className="cstudio-primary-button" onClick={saveToCanvas}><Layers size={15} />保存并添加到画布</button>
                    </div>
                </footer>
            </div>
        </div>
    );
}
