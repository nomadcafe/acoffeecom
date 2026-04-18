import type { HTMLAttributes, ElementType } from 'react';

/** Renders a translation string that may contain <strong> tags, without dangerouslySetInnerHTML. */
export function RichText({
  text,
  as: Tag = 'span',
  ...props
}: { text: string; as?: ElementType } & HTMLAttributes<HTMLElement>) {
  const parts: (string | { bold: string })[] = [];
  const re = /<strong>(.*?)<\/strong>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ bold: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return (
    <Tag {...props}>
      {parts.map((part, i) =>
        typeof part === 'string' ? part : <strong key={i}>{part.bold}</strong>
      )}
    </Tag>
  );
}
