import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type StablePopoverPlacement = "topLeft" | "bottomLeft" | "bottom" | "bottomRight";

type StablePopoverProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    placement?: StablePopoverPlacement;
    content: ReactNode;
    children: ReactNode;
    rootClassName?: string;
    classNames?: {
        root?: string;
        container?: string;
        content?: string;
    };
};

type PopoverPosition = { left: number; top: number };

const VIEWPORT_GAP = 8;
const ANCHOR_GAP = 4;

/**
 * Small portal popover used for workspace-critical menus.
 *
 * It deliberately avoids Ant Design's rc-trigger alignment, which on some
 * Windows Chromium builds computes an off-screen offset (e.g. left:-11730px)
 * because the `style.left='0'` reset in useAlign cannot override the `inset`
 * shorthand the browser serializes for left/top/right/bottom. Positioning here
 * is done manually with position:fixed + getBoundingClientRect(), which is
 * immune to that CSSOM bug.
 */
export function StablePopover({
    open,
    onOpenChange,
    placement = "bottomLeft",
    content,
    children,
    rootClassName,
    classNames,
}: StablePopoverProps) {
    const anchorWrapperRef = useRef<HTMLSpanElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<PopoverPosition | null>(null);

    const anchorElement = useCallback(() => anchorWrapperRef.current?.firstElementChild as HTMLElement | null, []);
    const updatePosition = useCallback(() => {
        const anchor = anchorElement();
        const popup = popupRef.current;
        if (!anchor || !popup) return;

        const anchorRect = anchor.getBoundingClientRect();
        const popupRect = popup.getBoundingClientRect();
        let left = placement === "bottom" ? anchorRect.left + (anchorRect.width - popupRect.width) / 2 : placement === "bottomRight" ? anchorRect.right - popupRect.width : anchorRect.left;
        let top = placement === "topLeft" ? anchorRect.top - popupRect.height - ANCHOR_GAP : anchorRect.bottom + ANCHOR_GAP;

        const maxLeft = Math.max(VIEWPORT_GAP, window.innerWidth - popupRect.width - VIEWPORT_GAP);
        const maxTop = Math.max(VIEWPORT_GAP, window.innerHeight - popupRect.height - VIEWPORT_GAP);
        left = Math.min(Math.max(VIEWPORT_GAP, left), maxLeft);

        if (placement !== "topLeft" && top + popupRect.height > window.innerHeight - VIEWPORT_GAP && anchorRect.top >= popupRect.height + ANCHOR_GAP + VIEWPORT_GAP) {
            top = anchorRect.top - popupRect.height - ANCHOR_GAP;
        } else if (placement === "topLeft" && top < VIEWPORT_GAP && window.innerHeight - anchorRect.bottom >= popupRect.height + ANCHOR_GAP + VIEWPORT_GAP) {
            top = anchorRect.bottom + ANCHOR_GAP;
        }
        top = Math.min(Math.max(VIEWPORT_GAP, top), maxTop);

        setPosition((current) => current?.left === left && current.top === top ? current : { left, top });
    }, [anchorElement, placement]);

    useLayoutEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }

        updatePosition();
        const frame = window.requestAnimationFrame(updatePosition);
        const observer = new ResizeObserver(updatePosition);
        const anchor = anchorElement();
        if (anchor) observer.observe(anchor);
        if (popupRef.current) observer.observe(popupRef.current);
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        return () => {
            window.cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    }, [anchorElement, open, updatePosition]);

    useLayoutEffect(() => {
        if (!open) return;
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (anchorElement()?.contains(target) || popupRef.current?.contains(target)) return;
            onOpenChange(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            onOpenChange(false);
            anchorElement()?.focus();
        };
        document.addEventListener("pointerdown", closeOnOutsidePointer, true);
        document.addEventListener("keydown", closeOnEscape, true);
        return () => {
            document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
            document.removeEventListener("keydown", closeOnEscape, true);
        };
    }, [anchorElement, onOpenChange, open]);

    const popup = open && typeof document !== "undefined" ? createPortal(
        <div
            ref={popupRef}
            data-stable-popover
            className={cn("stable-popover workspace-quiet-popup", rootClassName, classNames?.root)}
            style={{ left: position?.left ?? -10000, top: position?.top ?? -10000, visibility: position ? "visible" : "hidden" }}
        >
            <div className={cn("ant-popover-content", classNames?.content)}>
                <div className={cn("ant-popover-container ant-popover-inner", classNames?.container)}>
                    <div className="ant-popover-inner-content">{content}</div>
                </div>
            </div>
        </div>,
        document.body,
    ) : null;

    return <>
        <span
            ref={anchorWrapperRef}
            className="stable-popover-anchor"
            onClickCapture={(event) => {
                const target = event.target;
                if (!(target instanceof Node) || !anchorElement()?.contains(target)) return;
                onOpenChange(!open);
            }}
        >
            {children}
        </span>
        {popup}
    </>;
}
