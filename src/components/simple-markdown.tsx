import { Fragment } from "react";

/** Markdown mínimo y seguro (títulos ##, párrafos, listas con "-" y **negritas**), sin HTML crudo. */
export function SimpleMarkdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
    );
  return (
    <div className={className ?? "prose-sr"}>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines[0].startsWith("## ")) {
          return (
            <Fragment key={i}>
              <h2>{inline(lines[0].slice(3))}</h2>
              {lines.length > 1 ? <p>{inline(lines.slice(1).join(" "))}</p> : null}
            </Fragment>
          );
        }
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return (
            <ul key={i} className="my-2 list-disc pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*] /, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{inline(lines.join(" "))}</p>;
      })}
    </div>
  );
}
