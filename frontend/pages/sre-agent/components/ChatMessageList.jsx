import { useMemo } from "react";
import { stripOpenClawHiddenBlocks } from "../messageDisplayUtils.js";
import AssistantMessageGroup from "./AssistantMessageGroup.jsx";
import ConfirmCard from "./ConfirmCard.jsx";
import UserBubble from "./UserBubble.jsx";

export default function ChatMessageList({
  messages,
  toolCallList,
  confirm,
  isRunning,
  steps,
  error,
  chatEndRef,
  handleSend,
  setInput,
  inputRef,
  respondConfirm,
  onOpenSreVizItem,
}) {
  const showInlineThinking = useMemo(() => {
    const hasVisibleStream = messages.some(
      (m) =>
        m.role === "assistant" &&
        m.streaming &&
        stripOpenClawHiddenBlocks(m.content ?? "").trim().length > 0,
    );
    if (hasVisibleStream || error) return false;
    const hasRunningStep = Array.isArray(steps) && steps.some((s) => s.status === "running");
    const lastMessageIsUser =
      messages.length > 0 && messages[messages.length - 1].role === "user";
    // 与计划一致：含 lastMessageIsUser，覆盖 status 尚未切到 running 的一帧
    return isRunning || hasRunningStep || lastMessageIsUser;
  }, [messages, steps, isRunning, error]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {messages.map((msg, idx) => {
        if (msg.role === "user") {
          const userVisible = stripOpenClawHiddenBlocks(msg.content);
          if (!userVisible.trim()) return null;
          return <UserBubble key={msg.id} text={userVisible} />;
        }
        if (msg.role !== "assistant") return null;
        return (
          <AssistantMessageGroup
            key={msg.id}
            msg={msg}
            isLast={idx === messages.length - 1}
            isRunning={isRunning}
            onSelect={handleSend}
            setInput={setInput}
            inputRef={inputRef}
            onOpenSreVizItem={onOpenSreVizItem}
          />
        );
      })}

      {confirm && (
        <ConfirmCard confirm={confirm} onRespond={respondConfirm} />
      )}

      {showInlineThinking && (
        <div
          className="flex items-center gap-2 px-1 py-2"
          role="status"
          aria-live="polite"
        >
          <span className="text-[11px] text-gray-500 dark:text-gray-400">思考中</span>
          <div className="flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms] dark:bg-gray-500" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms] dark:bg-gray-500" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms] dark:bg-gray-500" />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      <div ref={chatEndRef} />
    </div>
  );
}
