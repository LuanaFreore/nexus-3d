/**
 * Split helpers — kinetic typography for /arquitetura (arquitetura.md §S1/S6).
 * Each word/char is wrapped in an overflow-hidden mask span; GSAP animates
 * the inner span (.nx-word / .nx-char) with yPercent for masked reveals.
 */

interface SplitProps {
  text: string;
  className?: string;
}

export function Words({ text, className }: SplitProps) {
  const words = text.split(' ');
  return (
    <span className={className}>
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom">
          <span className="nx-word inline-block will-change-transform">{word}</span>
          {i < words.length - 1 ? <span className="inline-block">&nbsp;</span> : null}
        </span>
      ))}
    </span>
  );
}

export function Chars({ text, className }: SplitProps) {
  const chars = Array.from(text);
  return (
    <span className={className} aria-label={text}>
      {chars.map((ch, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom" aria-hidden>
          <span className="nx-char inline-block will-change-transform">
            {ch === ' ' ? ' ' : ch}
          </span>
        </span>
      ))}
    </span>
  );
}
