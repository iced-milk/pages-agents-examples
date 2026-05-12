import { useAgentStream } from "../hooks/useAgentStream";
import { Header } from "./Header";
import { WelcomeScreen } from "./WelcomeScreen";
import { MessageFlow } from "./MessageFlow";
import { ChatInput } from "./ChatInput";

/** Main chat page — centered container layout. */
export function ChatPage() {
  const {
    messages,
    phase,
    isStreaming,
    sendMessage,
    stopStreaming,
    resetChat,
    buildFlowItems,
  } = useAgentStream();

  const hasMessages = messages.length > 0;
  const flowItems = buildFlowItems();

  return (
    <div className="flex h-screen flex-col bg-[#f9fafb]">
      <Header
        phase={phase}
        hasMessages={hasMessages}
        onNewChat={resetChat}
        isStreaming={isStreaming}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {hasMessages ? (
          <MessageFlow items={flowItems} isStreaming={isStreaming} />
        ) : (
          <WelcomeScreen onSelect={sendMessage} />
        )}

        <ChatInput
          onSend={sendMessage}
          onStop={stopStreaming}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
