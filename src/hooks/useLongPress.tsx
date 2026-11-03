import React, { useEffect, useRef } from 'react';
export function isTouchEvent(e: React.TouchEvent | React.MouseEvent): e is React.TouchEvent { return Boolean(e && 'touches' in e); }
export function isMouseEvent(e: React.TouchEvent | React.MouseEvent): e is React.MouseEvent { return Boolean(e && 'screenX' in e); }
/** Cancel on movement in either direction, handle coordinate zero, suppress the opening tap. */
export default function useLongPress(callback = (e: React.TouchEvent) => {}, ms = 500) {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const origin = useRef<{x:number;y:number}|null>(null);
    const fired = useRef(false);
    const currentCallback = useRef(callback); currentCallback.current = callback;
    const cancel = () => { if(timer.current !== null) clearTimeout(timer.current); timer.current=null; origin.current=null; };
    useEffect(() => cancel, []);
    return {
        onTouchStart: (e: React.TouchEvent) => {
            cancel(); fired.current=false;
            if(e.touches.length !== 1) return;
            origin.current={x:e.touches[0].clientX,y:e.touches[0].clientY}; e.persist();
            timer.current=setTimeout(()=>{ fired.current=true; currentCallback.current(e); cancel(); },ms);
        },
        onTouchMove: (e: React.TouchEvent) => { if(origin.current && (e.touches.length !== 1 || Math.hypot(e.touches[0].clientX-origin.current.x,e.touches[0].clientY-origin.current.y)>8)) cancel(); },
        onTouchEnd: cancel,
        onTouchCancel: cancel,
        onClickCapture: (e: React.MouseEvent) => { if(fired.current){ e.preventDefault();e.stopPropagation();fired.current=false; } },
    };
}
