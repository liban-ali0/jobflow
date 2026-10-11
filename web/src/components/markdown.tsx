import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders an engine's reply. Links open in a new tab; raw HTML is not rendered.
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown text-sm leading-relaxed" dir="auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-teal underline">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-left">{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
