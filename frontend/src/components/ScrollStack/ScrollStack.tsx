import React, { useLayoutEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import Lenis from 'lenis';

export interface ScrollStackItemProps {
  itemClassName?: string;
  variant?: 'card' | 'panel';
  style?: React.CSSProperties;
  children: ReactNode;
}

export const ScrollStackItem: React.FC<ScrollStackItemProps> = ({
  children,
  itemClassName = '',
  variant = 'card',
  style
}) => {
  const baseClassName =
    variant === 'panel'
      ? 'scroll-stack-card relative w-full my-0 box-border origin-top will-change-transform'
      : 'scroll-stack-card relative w-full h-80 my-8 p-12 rounded-[40px] shadow-[0_0_30px_rgba(0,0,0,0.1)] box-border origin-top will-change-transform';

  return (
    <div
      className={`${baseClassName} ${itemClassName}`.trim()}
      style={{
        backfaceVisibility: 'hidden',
        transformStyle: 'preserve-3d',
        ...style
      }}
    >
      {children}
    </div>
  );
};

interface ScrollStackProps {
  className?: string;
  children: ReactNode;
  itemDistance?: number;
  itemScale?: number;
  itemStackDistance?: number;
  stackPosition?: string;
  scaleEndPosition?: string;
  baseScale?: number;
  scaleDuration?: number;
  rotationAmount?: number;
  blurAmount?: number;
  useWindowScroll?: boolean;
  disableBelow?: number;
  onStackComplete?: () => void;
}

const ScrollStack: React.FC<ScrollStackProps> = ({
  children,
  className = '',
  itemDistance = 100,
  itemScale = 0.03,
  itemStackDistance = 30,
  stackPosition = '20%',
  scaleEndPosition = '10%',
  baseScale = 0.85,
  scaleDuration = 0.5,
  rotationAmount = 0,
  blurAmount = 0,
  useWindowScroll = false,
  disableBelow = 0,
  onStackComplete
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stackCompletedRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const cardsRef = useRef<HTMLElement[]>([]);
  const cardOffsetsRef = useRef<number[]>([]);
  const endSpacerRef = useRef<HTMLDivElement>(null);
  const releaseMarkerRef = useRef<HTMLDivElement | null>(null);
  const stackBoundsRef = useRef({ top: 0, bottom: 0, releaseTop: 0 });
  const lastTransformsRef = useRef(new Map<number, any>());
  const isUpdatingRef = useRef(false);
  const isMobileStackRef = useRef(false);

  const isStackEnabled = useCallback(() => {
    if (!useWindowScroll) return true;
    if (!disableBelow) return true;
    return window.innerWidth >= disableBelow;
  }, [useWindowScroll, disableBelow]);

  const calculateProgress = useCallback((scrollTop: number, start: number, end: number) => {
    if (scrollTop < start) return 0;
    if (scrollTop > end) return 1;
    return (scrollTop - start) / (end - start);
  }, []);

  const parsePercentage = useCallback((value: string | number, containerHeight: number) => {
    if (typeof value === 'string' && value.includes('%')) {
      return (parseFloat(value) / 100) * containerHeight;
    }
    return parseFloat(value as string);
  }, []);

  const getScrollData = useCallback(() => {
    if (useWindowScroll) {
      return {
        scrollTop: window.scrollY,
        containerHeight: window.innerHeight,
        scrollContainer: document.documentElement
      };
    } else {
      const scroller = scrollerRef.current;
      return {
        scrollTop: scroller ? scroller.scrollTop : 0,
        containerHeight: scroller ? scroller.clientHeight : 0,
        scrollContainer: scroller
      };
    }
  }, [useWindowScroll]);

  const getElementOffset = useCallback(
    (element: HTMLElement) => {
      // IMPORTANT: When we animate cards via `transform`, `getBoundingClientRect()` changes,
      // which can create a feedback loop / jitter. For cards we use cached offsets instead.
      if (useWindowScroll) {
        const rect = element.getBoundingClientRect();
        return rect.top + window.scrollY;
      }
      return element.offsetTop;
    },
    [useWindowScroll]
  );

  const updateCardTransforms = useCallback(() => {
    if (!cardsRef.current.length || isUpdatingRef.current) return;

    isUpdatingRef.current = true;

    if (useWindowScroll) {
      const threshold = window.innerHeight * 0.15;
      const { top, bottom } = stackBoundsRef.current;
      if (window.scrollY > bottom + threshold || window.scrollY + window.innerHeight < top - threshold) {
        isUpdatingRef.current = false;
        return;
      }
    }

    if (!isStackEnabled()) {
      cardsRef.current.forEach(card => {
        card.style.transform = 'translate3d(0, 0, 0)';
        card.style.filter = '';
      });
      isUpdatingRef.current = false;
      return;
    }

    const { scrollTop, containerHeight } = getScrollData();
    const stackPositionPx = parsePercentage(stackPosition, containerHeight);
    const scaleEndPositionPx = parsePercentage(scaleEndPosition, containerHeight);
    const endElementTop = stackBoundsRef.current.releaseTop;
    const lastCardTop = cardOffsetsRef.current[cardsRef.current.length - 1] ?? 0;
    const naturalPinEnd = lastCardTop + containerHeight * 0.48;

    cardsRef.current.forEach((card, i) => {
      if (!card) return;

      const cardTop = cardOffsetsRef.current[i] ?? getElementOffset(card);
      const triggerStart = cardTop - stackPositionPx - itemStackDistance * i;
      const triggerEnd = cardTop - scaleEndPositionPx;
      const pinStart = cardTop - stackPositionPx - itemStackDistance * i;
      let pinEnd = endElementTop - containerHeight * 0.62;
      pinEnd = Math.min(pinEnd, naturalPinEnd);
      pinEnd = Math.max(pinEnd, pinStart + 24);

      const scaleProgress = calculateProgress(scrollTop, triggerStart, triggerEnd);
      const targetScale = baseScale + i * itemScale;
      const scale = 1 - scaleProgress * (1 - targetScale);
      const rotation = rotationAmount ? i * rotationAmount * scaleProgress : 0;

      let blur = 0;
      if (blurAmount) {
        let topCardIndex = 0;
        for (let j = 0; j < cardsRef.current.length; j++) {
          const jCardTop = cardOffsetsRef.current[j] ?? getElementOffset(cardsRef.current[j]);
          const jTriggerStart = jCardTop - stackPositionPx - itemStackDistance * j;
          if (scrollTop >= jTriggerStart) {
            topCardIndex = j;
          }
        }

        if (i < topCardIndex) {
          const depthInStack = topCardIndex - i;
          blur = Math.max(0, depthInStack * blurAmount);
        }
      }

      let translateY = 0;
      const isPinned = scrollTop >= pinStart && scrollTop <= pinEnd;

      if (isPinned) {
        translateY = scrollTop - cardTop + stackPositionPx + itemStackDistance * i;
      } else if (scrollTop > pinEnd) {
        translateY = pinEnd - cardTop + stackPositionPx + itemStackDistance * i;
      }

      const newTransform = {
        translateY: Math.round(translateY * 10) / 10,
        scale: Math.round(scale * 1000) / 1000,
        rotation: Math.round(rotation * 100) / 100,
        blur: Math.round(blur * 100) / 100
      };

      const lastTransform = lastTransformsRef.current.get(i);
      const hasChanged =
        !lastTransform ||
        Math.abs(lastTransform.translateY - newTransform.translateY) > 0.16 ||
        Math.abs(lastTransform.scale - newTransform.scale) > 0.0008 ||
        Math.abs(lastTransform.rotation - newTransform.rotation) > 0.03 ||
        Math.abs(lastTransform.blur - newTransform.blur) > 0.03;

      if (hasChanged) {
        const transform = `translate3d(0, ${newTransform.translateY}px, 0) scale(${newTransform.scale}) rotate(${newTransform.rotation}deg)`;
        const filter = newTransform.blur > 0 ? `blur(${newTransform.blur}px)` : '';

        card.style.transform = transform;
        if (blurAmount) {
          card.style.filter = filter;
        }

        lastTransformsRef.current.set(i, newTransform);
      }

      if (i === cardsRef.current.length - 1) {
        const isInView = scrollTop >= pinStart && scrollTop <= pinEnd;
        if (isInView && !stackCompletedRef.current) {
          stackCompletedRef.current = true;
          onStackComplete?.();
        } else if (!isInView && stackCompletedRef.current) {
          stackCompletedRef.current = false;
        }
      }
    });

    isUpdatingRef.current = false;
  }, [
    itemScale,
    itemStackDistance,
    stackPosition,
    scaleEndPosition,
    baseScale,
    rotationAmount,
    blurAmount,
    useWindowScroll,
    onStackComplete,
    calculateProgress,
    parsePercentage,
    getScrollData,
    getElementOffset,
    isStackEnabled
  ]);

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      updateCardTransforms();
    });
  }, [updateCardTransforms]);

  const setupLenis = useCallback(() => {
    // For window scrolling, native scrolling is smoother and avoids "vibration" on some setups
    // when a smooth-scroller (Lenis) fights layout + transform-based animations.
    if (!useWindowScroll) {
      const scroller = scrollerRef.current;
      if (!scroller) return;

      const lenis = new Lenis({
        wrapper: scroller,
        content: scroller.querySelector('.scroll-stack-inner') as HTMLElement,
        duration: 1.2,
        easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        touchMultiplier: 2,
        infinite: false,
        gestureOrientation: 'vertical',
        wheelMultiplier: 1,
        lerp: 0.1,
        syncTouch: true,
        syncTouchLerp: 0.075
      });

      lenis.on('scroll', handleScroll);

      const raf = (time: number) => {
        lenis.raf(time);
        animationFrameRef.current = requestAnimationFrame(raf);
      };
      animationFrameRef.current = requestAnimationFrame(raf);

      lenisRef.current = lenis;
      return lenis;
    }
  }, [handleScroll, useWindowScroll]);

  useLayoutEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;

    const cards = Array.from(
      root.querySelectorAll('.scroll-stack-card')
    ) as HTMLElement[];
    releaseMarkerRef.current = root.querySelector('.scroll-stack-release') as HTMLDivElement | null;
    cardsRef.current = cards;
    const transformsCache = lastTransformsRef.current;

    const recalcOffsets = () => {
      // Must be measured without depending on the current transforms (which are animated).
      // We measure once from layout, then keep using these stable offsets during transforms.
      cardOffsetsRef.current = cards.map(card =>
        useWindowScroll ? card.getBoundingClientRect().top + window.scrollY : card.offsetTop
      );

      if (useWindowScroll) {
        const rootTop = root.getBoundingClientRect().top + window.scrollY;
        const rootBottom = rootTop + root.offsetHeight;
        const releaseTop = releaseMarkerRef.current
          ? releaseMarkerRef.current.getBoundingClientRect().top + window.scrollY
          : rootBottom;
        stackBoundsRef.current = { top: rootTop, bottom: rootBottom, releaseTop };
      } else {
        stackBoundsRef.current = {
          top: 0,
          bottom: root.offsetHeight,
          releaseTop: releaseMarkerRef.current ? releaseMarkerRef.current.offsetTop : root.offsetHeight,
        };
      }

      const containerHeight = useWindowScroll ? window.innerHeight : scrollerRef.current?.clientHeight ?? 0;
      const spacerPx = isStackEnabled()
        ? Math.max(containerHeight * 0.34, itemDistance * 0.8)
        : 0;
      isMobileStackRef.current = !isStackEnabled();
      if (endSpacerRef.current) {
        endSpacerRef.current.style.height = `${spacerPx}px`;
      }
    };

    recalcOffsets();

    cards.forEach((card, i) => {
      if (i < cards.length - 1) {
        card.style.marginBottom = `${isStackEnabled() ? itemDistance : 24}px`;
      }
      card.style.willChange = blurAmount ? 'transform, filter' : 'transform';
      card.style.transformOrigin = 'top center';
      card.style.backfaceVisibility = 'hidden';
      card.style.transform = 'translateZ(0)';
      card.style.webkitTransform = 'translateZ(0)';
      card.style.perspective = '1000px';
      card.style.webkitPerspective = '1000px';
      card.style.contain = 'layout paint style';
    });

    setupLenis();

    updateCardTransforms();

    if (useWindowScroll) {
      window.addEventListener('scroll', handleScroll, { passive: true });
    }

    // Keep offsets in sync for responsive layout changes.
    const handleResize = () => {
      recalcOffsets();
      handleScroll();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }
      if (lenisRef.current) {
        lenisRef.current.destroy();
      }
      if (useWindowScroll) {
        window.removeEventListener('scroll', handleScroll);
      }
      window.removeEventListener('resize', handleResize);
      stackCompletedRef.current = false;
      cardsRef.current = [];
      cardOffsetsRef.current = [];
      releaseMarkerRef.current = null;
      transformsCache.clear();
      isUpdatingRef.current = false;
    };
  }, [
    itemDistance,
    itemScale,
    itemStackDistance,
    stackPosition,
    scaleEndPosition,
    baseScale,
    scaleDuration,
    rotationAmount,
    blurAmount,
    useWindowScroll,
    onStackComplete,
    setupLenis,
    updateCardTransforms,
    isStackEnabled,
    handleScroll
  ]);

  return (
    <div
      className={
        useWindowScroll
          ? `relative w-full overflow-hidden ${className}`.trim()
          : `relative w-full h-full overflow-y-auto overflow-x-visible ${className}`.trim()
      }
      ref={scrollerRef}
      style={{
        ...(useWindowScroll
          ? {}
          : {
              overscrollBehavior: 'contain' as const,
              WebkitOverflowScrolling: 'touch' as const,
              scrollBehavior: 'smooth' as const,
              WebkitTransform: 'translateZ(0)',
              transform: 'translateZ(0)',
              willChange: 'scroll-position' as const
            })
      }}
    >
      <div
        className={`scroll-stack-inner min-h-screen ${useWindowScroll ? '' : 'px-20'}`.trim()}
        style={{ paddingTop: isMobileStackRef.current ? '1rem' : '20vh' }}
      >
        {children}
        {/* Release marker for the final pin; must stay before extra spacer */}
        <div ref={releaseMarkerRef} className="scroll-stack-release w-full h-px" />
        <div ref={endSpacerRef} className="w-full" aria-hidden="true" />
      </div>
    </div>
  );
};

export default ScrollStack;
