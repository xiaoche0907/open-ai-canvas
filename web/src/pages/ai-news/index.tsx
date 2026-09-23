import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ArrowUpRight,
    Clock,
    ExternalLink,
    Flame,
    LayoutGrid,
    List,
    Newspaper,
    RefreshCw,
    Search,
    X,
} from "lucide-react";

import { WorkspacePage } from "@/components/layout/workspace-page";
import { cn } from "@/lib/utils";
import "./ai-news.css";

type WindowKey = "24h" | "7d";
type ViewMode = "list" | "card";

const AIHOT_BASE = "https://aihot.news";
const AIHOT_API = `${AIHOT_BASE}/api/v1/items`;
const AIHOT_HOT_API = `${AIHOT_BASE}/api/v1/hot-topics`;
const PAGE_LIMIT = 30;
const VIEW_STORAGE_KEY = "ai-news-view";

const WINDOW_OPTIONS: { key: WindowKey; label: string }[] = [
    { key: "24h", label: "过去 24 小时" },
    { key: "7d", label: "最近 7 天" },
];

const CATEGORY_OPTIONS: { key: string; label: string }[] = [
    { key: "", label: "全部" },
    { key: "ai-models", label: "模型" },
    { key: "ai-products", label: "产品" },
    { key: "industry", label: "行业" },
    { key: "paper", label: "论文" },
    { key: "tip", label: "教程" },
];

const CATEGORY_LABELS: Record<string, string> = {
    "ai-models": "模型",
    "ai-products": "产品",
    industry: "行业",
    paper: "论文",
    tip: "教程",
};

interface AiNewsItem {
    id: string;
    title: string;
    originalTitle: string | null;
    summary: string | null;
    reason: string | null;
    category: string | null;
    score: number | null;
    source: { name: string };
    links: { aihot: string; original: string };
    publishedAt: string | null;
    discoveredAt: string;
}

interface AiNewsResponse {
    items: AiNewsItem[];
}

interface HotTopic {
    rank: number;
    id: string;
    title: string;
    source: { name: string };
    links: { aihot: string };
    latestAt: string;
}

interface HotTopicsResponse {
    items: HotTopic[];
}

const beijingFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
});

const timeOnlyFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
});

const dateOnlyFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

const monthDayFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
});

const weekdayFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    weekday: "long",
});

function safeFormat(formatter: Intl.DateTimeFormat, iso: string): string {
    try {
        return formatter.format(new Date(iso));
    } catch {
        return "";
    }
}

// AIHOT 时间轴口径：收录 72 小时内的慢推信源按收录时间展示，历史回填归位到原文发布日。
function timelineValue(item: AiNewsItem): string {
    if (!item.publishedAt) return item.discoveredAt;
    const published = new Date(item.publishedAt).getTime();
    const discovered = new Date(item.discoveredAt).getTime();
    if (!Number.isFinite(published) || !Number.isFinite(discovered)) return item.discoveredAt;
    if (discovered - published > 72 * 3600 * 1000) return item.publishedAt;
    return item.discoveredAt;
}

function categoryLabel(category: string | null): string {
    if (!category) return "资讯";
    return CATEGORY_LABELS[category] ?? category;
}

function groupLabel(dateKey: string, count: number): string {
    const date = new Date(`${dateKey}T00:00:00+08:00`);
    const monthDay = safeFormat(monthDayFormatter, date.toISOString());
    const weekday = safeFormat(weekdayFormatter, date.toISOString());
    return `${monthDay} ${weekday} · ${count}条`;
}

export default function AiNewsPage() {
    const [windowKey, setWindowKey] = useState<WindowKey>("24h");
    const [category, setCategory] = useState("");
    const [queryInput, setQueryInput] = useState("");
    const [query, setQuery] = useState("");
    const [view, setView] = useState<ViewMode>(() => {
        try {
            return localStorage.getItem(VIEW_STORAGE_KEY) === "card" ? "card" : "list";
        } catch {
            return "list";
        }
    });
    const [items, setItems] = useState<AiNewsItem[] | null>(null);
    const [hotTopics, setHotTopics] = useState<HotTopic[]>([]);
    const [showingAllPool, setShowingAllPool] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    // 搜索输入防抖（>=2 字才作为关键词请求，符合 AIHOT v1 q 参数 2—200 字约束）
    useEffect(() => {
        const timer = setTimeout(() => setQuery(queryInput.trim().length >= 2 ? queryInput.trim() : ""), 400);
        return () => clearTimeout(timer);
    }, [queryInput]);

    const load = useCallback(async (params: { windowKey: WindowKey; category: string; query: string }) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        setError(null);
        try {
            const buildUrl = (mode: string) => {
                const search = new URLSearchParams({ mode, window: params.windowKey, limit: String(PAGE_LIMIT) });
                if (params.category) search.set("category", params.category);
                if (params.query) search.set("q", params.query);
                return `${AIHOT_API}?${search.toString()}`;
            };
            let data: AiNewsResponse;
            let allPoolFallback = false;
            if (params.query) {
                // 关键词查询：先查精选池，空集时同参数再查公开池并注明「未进入精选」
                const selected = await fetch(buildUrl("selected"), { signal: controller.signal });
                if (!selected.ok) throw new Error(`资讯请求失败 (${selected.status})`);
                data = await selected.json();
                if ((data.items ?? []).length === 0) {
                    const fallback = await fetch(buildUrl("all"), { signal: controller.signal });
                    if (fallback.ok) {
                        const allData = (await fallback.json()) as AiNewsResponse;
                        data = allData;
                        allPoolFallback = (allData.items ?? []).length > 0;
                    }
                }
            } else {
                const selected = await fetch(buildUrl("selected"), { signal: controller.signal });
                if (!selected.ok) throw new Error(`资讯请求失败 (${selected.status})`);
                data = await selected.json();
            }
            setItems(data.items ?? []);
            setShowingAllPool(allPoolFallback);
            setUpdatedAt(new Date());
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            setError(err instanceof Error ? err.message : "加载失败，请稍后重试");
        } finally {
            if (abortRef.current === controller) setLoading(false);
        }
    }, []);

    const loadHotTopics = useCallback(async () => {
        try {
            const res = await fetch(AIHOT_HOT_API, { signal: abortRef.current?.signal });
            if (res.ok) {
                const data = (await res.json()) as HotTopicsResponse;
                setHotTopics((data.items ?? []).slice(0, 5));
            }
        } catch {
            // 热点榜失败不阻塞资讯主列表
        }
    }, []);

    useEffect(() => {
        void load({ windowKey, category, query });
        return () => abortRef.current?.abort();
    }, [windowKey, category, query, load]);

    useEffect(() => {
        void loadHotTopics();
        // 仅在挂载时加载一次热点榜
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const changeView = (next: ViewMode) => {
        setView(next);
        try {
            localStorage.setItem(VIEW_STORAGE_KEY, next);
        } catch {
            // 存储不可用时仅保留本次会话状态
        }
    };

    const groups = useMemo(() => {
        if (!items) return [];
        const map = new Map<string, AiNewsItem[]>();
        for (const item of items) {
            const key = safeFormat(dateOnlyFormatter, timelineValue(item)).replaceAll("/", "-");
            const bucket = map.get(key);
            if (bucket) bucket.push(item);
            else map.set(key, [item]);
        }
        return [...map.entries()];
    }, [items]);

    const updatedText = updatedAt
        ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(updatedAt)
        : null;

    const showSkeleton = loading && items === null;
    const showEmpty = !error && !loading && items !== null && items.length === 0;

    return (
        <WorkspacePage fluid scroll className="ai-news-page-root">
            <div className="ai-news-container">
                <header className="ai-news-header">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="ai-news-brand-mark" aria-hidden>
                            <Newspaper className="size-4" />
                        </span>
                        <div className="min-w-0">
                            <h1 className="ai-news-title">AI 资讯</h1>
                            <p className="ai-news-subtitle">每日精选的中文 AI 圈动态，数据来自 AIHOT 公开资讯池</p>
                        </div>
                    </div>
                    <div className="ai-news-header-actions">
                        <div className="ai-news-search-row">
                            <Search className="ai-news-search-icon" />
                            <input
                                type="text"
                                placeholder="搜索标题、摘要…"
                                aria-label="搜索资讯"
                                value={queryInput}
                                onChange={(e) => setQueryInput(e.target.value)}
                            />
                            {queryInput ? (
                                <button type="button" className="ai-news-search-clear" aria-label="清空搜索" onClick={() => setQueryInput("")}>
                                    <X className="size-3.5" />
                                </button>
                            ) : null}
                        </div>
                        <div className="ai-news-view-toggle" role="group" aria-label="视图切换">
                            <button
                                type="button"
                                className={cn(view === "list" && "is-active")}
                                aria-pressed={view === "list"}
                                aria-label="列表视图"
                                title="列表视图"
                                onClick={() => changeView("list")}
                            >
                                <List className="size-4" />
                            </button>
                            <button
                                type="button"
                                className={cn(view === "card" && "is-active")}
                                aria-pressed={view === "card"}
                                aria-label="卡片视图"
                                title="卡片视图"
                                onClick={() => changeView("card")}
                            >
                                <LayoutGrid className="size-4" />
                            </button>
                        </div>
                    </div>
                </header>

                <div className="ai-news-toolbar">
                    <div className="ai-news-category-pills" role="group" aria-label="资讯分类">
                        {CATEGORY_OPTIONS.map((option) => (
                            <button
                                key={option.key || "all"}
                                type="button"
                                className={cn("ai-news-pill-btn", category === option.key && "is-active")}
                                aria-pressed={category === option.key}
                                onClick={() => setCategory(option.key)}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <div className="ai-news-toolbar-right">
                        <div className="ai-news-pills" role="group" aria-label="时间范围">
                            {WINDOW_OPTIONS.map((option) => (
                                <button
                                    key={option.key}
                                    type="button"
                                    className={cn("ai-news-pill-btn", windowKey === option.key && "is-active")}
                                    aria-pressed={windowKey === option.key}
                                    onClick={() => setWindowKey(option.key)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            className="ai-news-refresh-btn"
                            aria-label="刷新资讯"
                            onClick={() => {
                                void load({ windowKey, category, query });
                                void loadHotTopics();
                            }}
                        >
                            <RefreshCw className={cn("size-3.5", loading && "ai-news-spin")} />
                            <span>刷新</span>
                        </button>
                    </div>
                </div>

                {hotTopics.length > 0 ? (
                    <section className="ai-news-hot" aria-label="当前热点">
                        <div className="ai-news-hot-header">
                            <h2>
                                <Flame className="size-3.5" />
                                当前热点
                            </h2>
                            <a href={AIHOT_BASE} target="_blank" rel="noopener noreferrer">
                                完整榜单
                                <ArrowUpRight className="size-3.5" />
                            </a>
                        </div>
                        <ol className="ai-news-hot-list">
                            {hotTopics.map((topic) => (
                                <li key={`${topic.rank}-${topic.id}`} className="ai-news-hot-item">
                                    <span className="ai-news-hot-rank" aria-hidden>
                                        {topic.rank}
                                    </span>
                                    <div className="ai-news-hot-main">
                                        <a href={topic.links.aihot} target="_blank" rel="noopener noreferrer">
                                            {topic.title}
                                        </a>
                                        <span className="ai-news-hot-meta">
                                            {topic.source?.name ? `${topic.source.name} · ` : ""}
                                            {topic.latestAt ? `${safeFormat(beijingFormatter, topic.latestAt)} 北京时间` : ""}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </section>
                ) : null}

                {showSkeleton ? (
                    <div className="ai-news-list" aria-label="资讯加载中">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <div key={index} className="ai-news-skeleton">
                                <div className="ai-news-skeleton-line w-16" />
                                <div className="ai-news-skeleton-line w-3/4" />
                                <div className="ai-news-skeleton-line w-full" />
                            </div>
                        ))}
                    </div>
                ) : null}

                {error && !loading ? (
                    <div className="ai-news-state" role="alert">
                        <p className="ai-news-state-title">资讯加载失败</p>
                        <p className="ai-news-state-desc">{error}</p>
                        <button
                            type="button"
                            className="ai-news-retry-btn"
                            onClick={() => {
                                void load({ windowKey, category, query });
                                void loadHotTopics();
                            }}
                        >
                            重试
                        </button>
                    </div>
                ) : null}

                {showEmpty ? (
                    <div className="ai-news-state">
                        <p className="ai-news-state-title">
                            {query ? `未找到与「${query}」相关的资讯` : "当前条件下暂无资讯"}
                        </p>
                        <p className="ai-news-state-desc">试试其他关键词，或切换分类与时间范围。</p>
                        <div className="ai-news-state-actions">
                            {query ? (
                                <button type="button" className="ai-news-state-btn" onClick={() => setQueryInput("")}>
                                    清空搜索
                                </button>
                            ) : null}
                            <button
                                type="button"
                                className="ai-news-state-btn"
                                onClick={() => {
                                    setCategory("");
                                    setWindowKey("24h");
                                    setQueryInput("");
                                }}
                            >
                                重置筛选
                            </button>
                        </div>
                    </div>
                ) : null}

                {!error && items && items.length > 0 ? (
                    <>
                        {showingAllPool ? (
                            <p className="ai-news-allpool-note" role="status">
                                以下关键词结果未进入 AIHOT 精选池，仅来自公开池。
                            </p>
                        ) : null}

                        {view === "list" ? (
                            <div className="ai-news-list">
                                {groups.map(([dateKey, groupItems]) => (
                                    <section key={dateKey} className="ai-news-group">
                                        <h3 className="ai-news-group-header">{groupLabel(dateKey, groupItems.length)}</h3>
                                        {groupItems.map((item) => {
                                            const primaryHref = item.links?.aihot || item.links?.original;
                                            return (
                                                <article key={item.id} className="ai-news-row">
                                                    <div className="ai-news-row-time">{safeFormat(timeOnlyFormatter, timelineValue(item))}</div>
                                                    <div className="ai-news-row-main">
                                                        <div className="ai-news-card-meta">
                                                            <span className="ai-news-card-tag">{categoryLabel(item.category)}</span>
                                                            {showingAllPool ? <span className="ai-news-row-nonselected">未进精选</span> : null}
                                                            {item.source?.name ? <span className="ai-news-card-source">{item.source.name}</span> : null}
                                                        </div>
                                                        <h2 className="ai-news-card-title">
                                                            {primaryHref ? (
                                                                <a href={primaryHref} target="_blank" rel="noopener noreferrer">
                                                                    {item.title}
                                                                </a>
                                                            ) : (
                                                                item.title
                                                            )}
                                                            {item.links?.original && item.links?.aihot ? (
                                                                <a
                                                                    className="ai-news-card-original"
                                                                    href={item.links.original}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    aria-label="查看第三方原文"
                                                                >
                                                                    <ExternalLink className="size-3.5" />
                                                                </a>
                                                            ) : null}
                                                        </h2>
                                                        {item.summary ? <p className="ai-news-card-summary">{item.summary}</p> : null}
                                                        {item.originalTitle && item.originalTitle !== item.title ? (
                                                            <p className="ai-news-row-original">{item.originalTitle}</p>
                                                        ) : null}
                                                        {item.reason ? (
                                                            <p className="ai-news-card-reason">
                                                                <strong>推荐理由</strong>
                                                                {item.reason}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    <div className="ai-news-row-score">
                                                        {item.score != null ? `AI 评分 ${item.score}/100` : ""}
                                                    </div>
                                                </article>
                                            );
                                        })}
                                    </section>
                                ))}
                            </div>
                        ) : (
                            <div className="ai-news-card-grid">
                                {items.map((item) => {
                                    const primaryHref = item.links?.aihot || item.links?.original;
                                    return (
                                        <article key={item.id} className="ai-news-cell">
                                            <div className="ai-news-cell-top">
                                                <span className="ai-news-card-tag">{categoryLabel(item.category)}</span>
                                                <span className="ai-news-cell-score">
                                                    {item.score != null ? `AI 评分 ${item.score}/100` : ""}
                                                </span>
                                            </div>
                                            <h2 className="ai-news-cell-title">
                                                {primaryHref ? (
                                                    <a href={primaryHref} target="_blank" rel="noopener noreferrer">
                                                        {item.title}
                                                    </a>
                                                ) : (
                                                    item.title
                                                )}
                                            </h2>
                                            {item.summary ? <p className="ai-news-cell-summary">{item.summary}</p> : null}
                                            {item.reason ? (
                                                <p className="ai-news-cell-reason">
                                                    <strong>推荐理由</strong>
                                                    {item.reason}
                                                </p>
                                            ) : null}
                                            <div className="ai-news-cell-footer">
                                                {item.source?.name ? <span className="ai-news-card-source">{item.source.name}</span> : null}
                                                <span className="ai-news-card-time">
                                                    <Clock className="size-3" />
                                                    {safeFormat(beijingFormatter, timelineValue(item))}
                                                </span>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}

                        <footer className="ai-news-footer">
                            <span>数据来源：AIHOT（aihot.news）· 聚合展示，仅供浏览参考</span>
                            {updatedText ? <span className="ai-news-updated">更新于 {updatedText}</span> : null}
                        </footer>
                    </>
                ) : null}
            </div>
        </WorkspacePage>
    );
}
