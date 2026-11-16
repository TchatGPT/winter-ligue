'use client';

import { type ReactNode, useEffect, useRef } from 'react';

/**
 * Une rangée qu'on fait défiler soi-même, à gauche ou à droite (16/11/2026) :
 * au doigt (défilement natif), à la souris en l'attrapant, ou à la molette —
 * la molette verticale y défile à l'horizontale. Rien ne bouge tout seul.
 */
export function Defilement({ className, label, children }: { className: string; label: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let depart: { x: number; gauche: number } | null = null;
    let glisse = false;

    // Attraper à la souris (le doigt, lui, défile nativement).
    const bas = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      depart = { x: e.clientX, gauche: el.scrollLeft };
      glisse = false;
    };
    const bouge = (e: PointerEvent) => {
      if (!depart) return;
      const dx = e.clientX - depart.x;
      if (!glisse && Math.abs(dx) > 4) {
        glisse = true;
        el.setPointerCapture(e.pointerId);
        el.dataset.attrape = '';
      }
      if (glisse) el.scrollLeft = depart.gauche - dx;
    };
    const haut = (e: PointerEvent) => {
      if (glisse && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      depart = null;
      delete el.dataset.attrape;
    };
    // Un glissé n'est pas un clic.
    const clic = (e: MouseEvent) => {
      if (glisse) {
        e.preventDefault();
        e.stopPropagation();
        glisse = false;
      }
    };
    // La molette verticale fait défiler la rangée, tant qu'elle peut aller plus loin.
    const molette = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      const vers = el.scrollLeft + e.deltaY;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return;
      e.preventDefault();
      el.scrollLeft = Math.max(0, Math.min(max, vers));
    };

    el.addEventListener('pointerdown', bas);
    el.addEventListener('pointermove', bouge);
    el.addEventListener('pointerup', haut);
    el.addEventListener('pointercancel', haut);
    el.addEventListener('click', clic, true);
    el.addEventListener('wheel', molette, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', bas);
      el.removeEventListener('pointermove', bouge);
      el.removeEventListener('pointerup', haut);
      el.removeEventListener('pointercancel', haut);
      el.removeEventListener('click', clic, true);
      el.removeEventListener('wheel', molette);
    };
  }, []);

  return (
    <section ref={ref} className={className} aria-label={label} tabIndex={0}>
      {children}
    </section>
  );
}
