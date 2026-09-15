import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  filename: string;
  code: string;
  language?: 'python' | 'cpp' | 'typescript' | 'bash' | 'text';
  className?: string;
}

const KEYWORDS: Record<string, RegExp> = {
  python:
    /\b(import|from|def|class|return|if|elif|else|for|while|async|await|with|as|lambda|None|True|False|raise|try|except|yield|pass|in|is|not|and|or)\b/g,
  cpp: /\b(#include|#define|namespace|template|typename|class|struct|auto|const|constexpr|return|if|else|for|while|void|int|float|double|size_t|std|using|public|private|virtual|override|noexcept|inline|static)\b/g,
  typescript:
    /\b(import|from|export|default|const|let|var|function|return|if|else|for|while|async|await|interface|type|extends|new|class|typeof)\b/g,
  bash: /\b(cd|npm|pip|python|git|make|cmake|docker|export|source|uvicorn|pnpm)\b/g,
};

interface Token {
  text: string;
  kind: 'kw' | 'str' | 'com' | 'plain';
}

/** Minimal palette-restricted highlighter: keywords→accent, strings→text, comments→text-faint */
function tokenizeLine(line: string, language: string): Token[] {
  const tokens: Token[] = [];
  const commentRe =
    language === 'python' || language === 'bash' ? /#.*/ : language === 'text' ? null : /\/\/.*/;
  const commentMatch = commentRe ? commentRe.exec(line) : null;
  const codePart = commentMatch ? line.slice(0, commentMatch.index) : line;
  const commentPart = commentMatch ? line.slice(commentMatch.index) : '';

  const kw = KEYWORDS[language];
  const strRe = /("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`)/g;
  const combined = new RegExp(
    `${kw ? kw.source : '(?!x)x'}|${strRe.source}`,
    'g',
  );

  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = combined.exec(codePart)) !== null) {
    if (m.index > last) tokens.push({ text: codePart.slice(last, m.index), kind: 'plain' });
    const isString = m[0].startsWith('"') || m[0].startsWith("'") || m[0].startsWith('`');
    tokens.push({ text: m[0], kind: isString ? 'str' : 'kw' });
    last = m.index + m[0].length;
  }
  if (last < codePart.length) tokens.push({ text: codePart.slice(last), kind: 'plain' });
  if (commentPart) tokens.push({ text: commentPart, kind: 'com' });
  return tokens;
}

/**
 * CodeBlock — design.md §7.7
 * Surface panel: header (filename + COPIAR), numbered lines, tabular mono,
 * palette-restricted syntax highlighting.
 */
export default function CodeBlock({ filename, code, language = 'python', className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => code.replace(/\n$/, '').split('\n'), [code]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // clipboard API unavailable (non-secure context) — fallback below
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={cn('hud-notch border border-hairline bg-surface', className)}>
      <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
        <span className="font-mono text-[11px] tracking-[0.12em] text-text-dim">{filename}</span>
        <button
          onClick={handleCopy}
          data-cursor="COPIAR"
          className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] transition-colors"
          style={{ color: copied ? 'var(--accent)' : 'var(--text-dim)' }}
        >
          {copied ? 'COPIADO ✓' : 'COPIAR'}
        </button>
      </div>
      <div className="overflow-x-auto px-4 py-4">
        <pre className="font-mono text-[12.5px] leading-[1.6]">
          {lines.map((line, i) => (
            <div key={i} className="flex">
              <span className="tnum w-8 shrink-0 select-none text-right text-text-faint">
                {i + 1}
              </span>
              <span className="w-4 shrink-0" />
              <code className="whitespace-pre text-nxtext">
                {tokenizeLine(line, language).map((t, j) => (
                  <span
                    key={j}
                    style={
                      t.kind === 'kw'
                        ? { color: 'var(--accent)' }
                        : t.kind === 'com'
                          ? { color: 'var(--text-faint)' }
                          : t.kind === 'str'
                            ? { color: 'var(--text)' }
                            : undefined
                    }
                  >
                    {t.text}
                  </span>
                ))}
              </code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
