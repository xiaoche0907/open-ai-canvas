import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { Modal, Button, Tag } from "antd";
import {
    Search,
    ChevronDown,
    Eye,
    Sparkles,
    Wand2,
    ArrowRight,
    ShoppingBag,
    Copy,
    Check,
    Boxes,
    Layers,
    ExternalLink
} from "lucide-react";

import { WorkspacePage } from "@/components/layout/workspace-page";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import "./apps.css";

type CategoryKey = "all" | "fashion" | "video" | "architecture" | "food" | "lifestyle";

interface CategoryOption {
    key: CategoryKey;
    label: string;
}

const CATEGORIES: CategoryOption[] = [
    { key: "all", label: "全品类" },
    { key: "fashion", label: "服装/模特/首饰" },
    { key: "video", label: "视频专区" },
    { key: "architecture", label: "建筑/室内设计" },
    { key: "food", label: "餐饮/外卖" },
    { key: "lifestyle", label: "生活/工具" },
];

interface ToolItem {
    id: string;
    sectionId: "main-visual" | "viral-replica" | "style-replica";
    title: string;
    bannerPrefix: string;
    bannerHighlight: string;
    desc: string;
    tag: string;
    categories: CategoryKey[];
    promptHint: string;
    badgeCount?: number;
}

const ALL_TOOLS: ToolItem[] = [
    // 主图/详情图/展示视频
    {
        id: "image-gen",
        sectionId: "main-visual",
        title: "图像生成",
        bannerPrefix: "图像",
        bannerHighlight: "生成",
        desc: "融合多张参考素材，快速构建完整商业画面。",
        tag: "电商商业图",
        categories: ["fashion", "architecture", "food", "lifestyle"],
        promptHint: "商业静物摄影，高光反射细腻，专业布光，电商质感主图",
    },
    {
        id: "product-replace",
        sectionId: "main-visual",
        title: "产品替换",
        bannerPrefix: "产品",
        bannerHighlight: "替换",
        desc: "保留原图构图与氛围，一键替换画面产品。",
        tag: "场景保真",
        categories: ["lifestyle", "food"],
        promptHint: "保持背景与环境光影不变，将中央商品替换为新品",
    },
    {
        id: "partial-replace",
        sectionId: "main-visual",
        title: "局部替换",
        bannerPrefix: "局部",
        bannerHighlight: "替换",
        desc: "精确圈选局部区域，按指令完成自然替换。",
        tag: "智能修图",
        categories: ["fashion", "lifestyle"],
        promptHint: "精确圈选替换局部配件或材质，边缘无缝融合",
    },

    // 爆款复刻
    {
        id: "universal-tryon",
        sectionId: "viral-replica",
        title: "AI 万物上身",
        bannerPrefix: "万物",
        bannerHighlight: "上身",
        desc: "模特换装、人台试穿、鞋靴上脚，Agent 全流程自然拟合交付高清大图。",
        tag: "虚拟试衣",
        categories: ["fashion"],
        promptHint: "高级时装模特，服装自然褶皱与垂坠感，专业影棚柔光，4K高清质感",
    },
    {
        id: "white-background",
        sectionId: "viral-replica",
        title: "通用白底图精修",
        bannerPrefix: "通用",
        bannerHighlight: "白底图精修",
        desc: "面向八大商品品类，批量生成专业白底精修图。",
        tag: "电商合规",
        categories: ["lifestyle", "fashion", "food"],
        promptHint: "纯白背景无杂质，自然真实投影，轮廓清晰锐利，电商标准白底",
    },
    {
        id: "product-video",
        sectionId: "viral-replica",
        title: "AI生成产品视频",
        bannerPrefix: "AI生成",
        bannerHighlight: "产品视频",
        desc: "从产品素材到分镜方案，批量生成商业展示视频。",
        tag: "动态带货",
        categories: ["video"],
        promptHint: "慢速环绕镜头，商品特写光影流动，电影级质感，4K 60fps",
    },
    {
        id: "main-image",
        sectionId: "viral-replica",
        title: "主图生成",
        bannerPrefix: "主图",
        bannerHighlight: "生成",
        desc: "面向电商平台，生成清晰聚焦的高转化主图。",
        tag: "点击率提升",
        categories: ["fashion", "food", "lifestyle"],
        promptHint: "电商首图，卖点视觉突出，构图平衡，高对比度抓人眼球",
    },
    {
        id: "ecommerce-main",
        sectionId: "viral-replica",
        title: "生成电商主图",
        bannerPrefix: "生成",
        bannerHighlight: "电商主图",
        desc: "融合产品信息、目标平台与多语言文案，生成高转化电商视觉。",
        tag: "全案排版",
        categories: ["lifestyle", "fashion"],
        promptHint: "海外独立站风格主图，排版利落，商品主体细节清晰，现代商业感",
    },
    {
        id: "scene-gen",
        sectionId: "viral-replica",
        title: "场景图生成",
        bannerPrefix: "场景",
        bannerHighlight: "图生成",
        desc: "将产品自然放入匹配卖点的商业生活场景。",
        tag: "居家空间",
        categories: ["architecture", "lifestyle", "food"],
        promptHint: "现代北欧简约家居场景，自然窗光洒入，生活气息浓厚，真实商业实景",
    },
    {
        id: "photo-lab",
        sectionId: "viral-replica",
        title: "摄影实验室",
        bannerPrefix: "摄影",
        bannerHighlight: "实验室",
        desc: "组合相机、镜头与胶片预设，批量生成统一摄影语言的商业成片。",
        tag: "大师预设",
        categories: ["fashion", "architecture"],
        promptHint: "哈苏中画幅质感，85mm人像镜头，柔和空气感与细节层次，摄影级控光",
    },

    // 风格复刻
    {
        id: "style-transfer",
        sectionId: "style-replica",
        title: "风格复刻",
        bannerPrefix: "风格",
        bannerHighlight: "复刻",
        desc: "提取对标爆款的色调、质感与光影，快速迁移到新品素材。",
        tag: "色调对齐",
        categories: ["lifestyle", "food", "fashion"],
        promptHint: "提取对标参考图的胶片暖色调与低对比度氛围，注入新品构图",
    },
    {
        id: "layout-transfer",
        sectionId: "style-replica",
        title: "排版与构图复刻",
        bannerPrefix: "排版",
        bannerHighlight: "复刻",
        desc: "拆解电商爆款海报版式结构，自动适配不同平台主图画幅。",
        tag: "视觉重组",
        categories: ["fashion", "lifestyle"],
        promptHint: "分析商业视觉重心，重构商品与背景空间关系，优化转化焦点",
    },
];

interface SectionConfig {
    id: "main-visual" | "viral-replica" | "style-replica";
    title: string;
}

const SECTIONS: SectionConfig[] = [
    { id: "main-visual", title: "主图/详情图/展示视频" },
    { id: "viral-replica", title: "爆款复刻" },
    { id: "style-replica", title: "风格复刻" },
];

export default function AiAppsPage() {
    const navigate = useNavigate();
    const appearance = useAppearanceStore((state) => state.appearance);

    const [selectedCategory, setSelectedCategory] = useState<CategoryKey>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTool, setActiveTool] = useState<ToolItem | null>(null);
    const [copied, setCopied] = useState(false);

    // 过滤逻辑
    const filteredTools = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return ALL_TOOLS.filter((tool) => {
            const matchCategory = selectedCategory === "all" || tool.categories.includes(selectedCategory);
            const matchQuery = !query || tool.title.toLowerCase().includes(query) || tool.desc.toLowerCase().includes(query) || tool.tag.toLowerCase().includes(query);
            return matchCategory && matchQuery;
        });
    }, [selectedCategory, searchQuery]);

    const handleCopyPrompt = (text: string) => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleUseInCreate = (tool: ToolItem) => {
        setActiveTool(null);
        navigate(`/create?prompt=${encodeURIComponent(tool.promptHint)}`);
    };

    const handleUseInCanvas = () => {
        setActiveTool(null);
        navigate("/canvas");
    };

    return (
        <WorkspacePage fluid scroll className="ai-apps-page-root">
            <div className="ai-apps-container">
                {/* 顶部搜索与品类筛选 */}
                <div className="ai-apps-toolbar">
                    <div className="ai-apps-search-row">
                        <div className="ai-apps-type-trigger">
                            <span>智能体</span>
                            <ChevronDown className="size-3.5 opacity-60" />
                        </div>
                        <div className="ai-apps-search-input">
                            <Search className="ai-apps-search-icon" />
                            <input
                                type="text"
                                placeholder="输入模板关键词或功能名称，按 Enter 搜索"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* 品类药丸筛选 */}
                    <div className="ai-apps-pills">
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.key}
                                type="button"
                                className={`ai-apps-pill-btn ${selectedCategory === cat.key ? "is-active" : ""}`}
                                onClick={() => setSelectedCategory(cat.key)}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 分区展示 */}
                {SECTIONS.map((section) => {
                    const sectionTools = filteredTools.filter((t) => t.sectionId === section.id);
                    if (sectionTools.length === 0) return null;

                    return (
                        <section key={section.id} className="ai-apps-section">
                            <div className="ai-apps-section-header">
                                <h2 className="ai-apps-section-title">{section.title}</h2>
                                <span className="ai-apps-section-badge">{sectionTools.length}个</span>
                            </div>

                            <div className="ai-apps-grid">
                                {sectionTools.map((tool) => (
                                    <div
                                        key={tool.id}
                                        className="ai-app-card group"
                                        onClick={() => setActiveTool(tool)}
                                    >
                                        {/* 卡片顶部视觉 Banner */}
                                        <div className="ai-app-card-banner">
                                            <div className="ai-app-card-banner-title">
                                                <span>{tool.bannerPrefix}</span>
                                                <span className="ai-app-card-banner-highlight">{tool.bannerHighlight}</span>
                                            </div>

                                            {/* 流程图示示意 */}
                                            <div className="ai-app-card-diagram">
                                                <div className="ai-app-diagram-thumb">
                                                    <div className="w-4 h-5 rounded-xs bg-white/20 border border-white/20" />
                                                </div>
                                                <div className="ai-app-diagram-arrow">➔</div>
                                                <div className="ai-app-diagram-result">
                                                    <Sparkles className="size-3 text-amber-400" />
                                                </div>
                                            </div>

                                            {/* 快速查看浮动按钮 */}
                                            <button
                                                type="button"
                                                className="ai-app-card-eye-btn"
                                                aria-label="查看详情"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveTool(tool);
                                                }}
                                            >
                                                <Eye className="size-3.5" />
                                            </button>
                                        </div>

                                        {/* 卡片内容区域 */}
                                        <div className="ai-app-card-body">
                                            <div className="ai-app-card-title">{tool.title}</div>
                                            <p className="ai-app-card-desc">{tool.desc}</p>
                                            <div className="ai-app-card-footer">
                                                <span className="ai-app-card-tag">{tool.tag}</span>
                                                <span className="ai-app-card-action-hint">
                                                    <span>立即使用</span>
                                                    <ArrowRight className="size-3" />
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    );
                })}

                {filteredTools.length === 0 && (
                    <div className="ai-apps-empty">
                        <Boxes className="size-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">未找到与 &quot;{searchQuery}&quot; 相关的应用或工具</p>
                        <button
                            type="button"
                            className="mt-3 text-xs text-amber-500 hover:underline"
                            onClick={() => {
                                setSelectedCategory("all");
                                setSearchQuery("");
                            }}
                        >
                            清空筛选条件
                        </button>
                    </div>
                )}
            </div>

            {/* 工具详情与启动弹窗 */}
            <Modal
                open={Boolean(activeTool)}
                onCancel={() => setActiveTool(null)}
                footer={null}
                centered
                width={560}
                className="ai-app-detail-modal"
                styles={{
                    content: {
                        background: "#14161f",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: 16,
                        padding: 24,
                    },
                }}
            >
                {activeTool && (
                    <div className="flex flex-col gap-5 text-white">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <h3 className="text-xl font-bold text-white tracking-tight">{activeTool.title}</h3>
                                    <Tag color="orange" className="border-0 font-medium">
                                        {activeTool.tag}
                                    </Tag>
                                </div>
                                <p className="text-sm leading-relaxed text-white/65">{activeTool.desc}</p>
                            </div>
                        </div>

                        {/* 提示词预设预览 */}
                        <div className="p-3.5 rounded-lg bg-white/[0.04] border border-white/[0.08] flex flex-col gap-2">
                            <div className="flex items-center justify-between text-xs text-white/50">
                                <span>推荐商用指令 / 提示词</span>
                                <button
                                    type="button"
                                    onClick={() => handleCopyPrompt(activeTool.promptHint)}
                                    className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors"
                                >
                                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                                    <span>{copied ? "已复制" : "复制指令"}</span>
                                </button>
                            </div>
                            <p className="text-xs leading-relaxed text-white/85 font-mono bg-black/30 p-2.5 rounded border border-white/5">
                                {activeTool.promptHint}
                            </p>
                        </div>

                        {/* 操作栏 */}
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <Button
                                onClick={handleUseInCanvas}
                                className="border-white/15 bg-white/5 text-white/80 hover:text-white hover:bg-white/10"
                            >
                                在自由画布中打开
                            </Button>
                            <Button
                                type="primary"
                                icon={<Wand2 className="size-3.5" />}
                                onClick={() => handleUseInCreate(activeTool)}
                                style={{
                                    background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                                    borderColor: "#f59e0b",
                                    color: "#000000",
                                    fontWeight: 600,
                                }}
                            >
                                前往创作
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </WorkspacePage>
    );
}
