import ReactMarkdown from 'react-markdown';

/** Keep local artwork beneath the deployment base, and never activate script/data URLs. */
export function worldContentUrl(value: string): string {
  const url = value.trim();
  if (!url || /[\u0000-\u001f\u007f]/.test(url) || url.startsWith('//')) return '';
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) {
    try { return new URL(url).protocol === 'https:' ? url : ''; }
    catch { return ''; }
  }
  if (url.startsWith('#')) return url;
  const origin = typeof window === 'undefined' ? 'https://novel-agent.invalid' : window.location.origin;
  try {
    const resolved = new URL(url, new URL(import.meta.env?.BASE_URL || '/', origin));
    return resolved.origin === origin ? resolved.href : '';
  }
  catch { return ''; }
}

export function WorldSettingContent({ content }: { content: string }) {
  return <div className="world-setting-content mt-2 min-w-0 space-y-3 break-words text-sm leading-relaxed text-muted-foreground">
    <ReactMarkdown skipHtml urlTransform={worldContentUrl} components={{
      p: ({ children }) => <p className="whitespace-pre-line">{children}</p>,
      img: ({ src, alt }) => src ? <img src={src} alt={alt || '世界观设定插图'} loading="lazy" className="my-3 h-auto max-h-[32rem] max-w-full rounded-lg border object-contain" /> : <span className="text-xs">插图链接不可用</span>,
      a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" onClick={event => event.stopPropagation()}>{children}</a> : <span>{children}</span>,
      ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
      blockquote: ({ children }) => <blockquote className="border-l-2 pl-3">{children}</blockquote>,
    }}>{content}</ReactMarkdown>
  </div>;
}
