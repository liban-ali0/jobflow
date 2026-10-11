import { startConversation } from "@/app/actions";
import { ConversationList } from "@/components/conversation-list";
import { PageHeader } from "@/components/page-header";
import { listConversations } from "@/lib/data";
import { ENGINES } from "@/lib/engine";
import { formatDateTime } from "@/lib/format";

export default function AssistantLayout({ children }: LayoutProps<"/assistant">) {
  const conversations = listConversations();

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <aside className="lg:w-64 lg:shrink-0">
        <PageHeader
          eyebrow={`${conversations.length} ${conversations.length === 1 ? "conversation" : "conversations"}`}
          title="Assistant"
          description="Ask about your jobs, or tell the engine what to do."
        />

        <form action={startConversation} className="mt-5 flex gap-2">
          <select name="engine" aria-label="Engine" className="field">
            {Object.entries(ENGINES).map(([key, engine]) => (
              <option key={key} value={key}>
                {engine.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary shrink-0">
            New
          </button>
        </form>

        <ConversationList
          items={conversations.map((conversation) => ({
            id: conversation.id,
            title: conversation.title,
            engine: ENGINES[conversation.engine]?.label ?? conversation.engine,
            updated: formatDateTime(conversation.updated_at),
          }))}
        />
      </aside>

      <section className="min-w-0 flex-1">{children}</section>
    </div>
  );
}
