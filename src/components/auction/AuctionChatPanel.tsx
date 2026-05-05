"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  getChatMessageForAuction,
  recordAuctionRoomEntry,
  sendChatMessage,
  type ChatMessagePayload,
} from "@/app/auctions/[code]/actions";
import { Avatar, Button, Card, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";

type ChatTab = "GLOBAL" | "TEAM";
type LocalChatMessage = ChatMessagePayload & {
  clientNonce?: string;
  failed?: boolean;
  pending?: boolean;
};

type AuctionChatPanelProps = {
  auctionCode: string;
  auctionId: string;
  className?: string;
  currentUser: {
    id: string;
    imageUrl: string | null;
    nickname: string;
  };
  initialMessages: ChatMessagePayload[];
  messageListClassName?: string;
  mode?: ChatTab;
  recordEntry?: boolean;
  teamId: string | null;
  title?: string;
};

export function AuctionChatPanel({
  auctionCode,
  auctionId,
  className,
  currentUser,
  initialMessages,
  messageListClassName,
  mode,
  recordEntry = true,
  teamId,
  title,
}: AuctionChatPanelProps) {
  const [activeTab, setActiveTab] = useState<ChatTab>(mode ?? "GLOBAL");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<LocalChatMessage[]>(() => dedupeMessages(initialMessages));
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  const optimisticCounterRef = useRef(0);
  const realtimeChannelId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setMessages((currentMessages) => mergeMessages(currentMessages, initialMessages));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [initialMessages]);

  useEffect(() => {
    if (!recordEntry) return;

    const storageKey = `auction-entry:${auctionId}`;
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, "true");

    const formData = new FormData();
    formData.set("auctionId", auctionId);
    formData.set("auctionCode", auctionCode);

    recordAuctionRoomEntry(formData).then((result) => {
      if (result.message) {
        setMessages((currentMessages) => mergeMessages(currentMessages, [result.message as ChatMessagePayload]));
      }
    });
  }, [auctionCode, auctionId, recordEntry]);

  useEffect(() => {
    const supabase = createClient();
    const channelType = mode ?? "tabs";
    const channelTeamId = channelType === "TEAM" ? (teamId ?? "none") : "all";
    const channelName = `auction-chat:${channelType.toLowerCase()}:${auctionId}:${channelTeamId}:${realtimeChannelId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ChatMessage",
          filter: `auctionId=eq.${auctionId}`,
        },
        (payload) => {
          const messageId = typeof payload.new.id === "string" ? payload.new.id : null;
          if (!messageId) return;

          getChatMessageForAuction(auctionId, messageId).then((result) => {
            if (result.message) {
              setMessages((currentMessages) => mergeMessages(currentMessages, [result.message as ChatMessagePayload]));
            }
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [auctionId, mode, realtimeChannelId, teamId]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [activeTab, messages]);

  const visibleMessages = useMemo(
    () =>
      messages.filter((chatMessage) =>
        activeTab === "GLOBAL"
          ? chatMessage.type === "GLOBAL"
          : chatMessage.type === "TEAM" && chatMessage.teamId === teamId,
      ),
    [activeTab, messages, teamId],
  );
  const isTeamChatDisabled = activeTab === "TEAM" && !teamId;
  const isMessageTooLong = message.length > 500;
  const canSend = Boolean(message.trim()) && !isMessageTooLong && !isTeamChatDisabled;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    sendOptimisticMessage(message, activeTab);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    const nativeEvent = event.nativeEvent as KeyboardEvent;
    if (nativeEvent.isComposing || isComposingRef.current) return;

    event.preventDefault();
    if (!canSend) return;
    sendOptimisticMessage(message, activeTab);
  }

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    shouldStickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  }

  function sendOptimisticMessage(rawMessage: string, type: ChatTab, retryId?: string) {
    const trimmedMessage = rawMessage.trim();
    if (!trimmedMessage || trimmedMessage.length > 500) return;

    shouldStickToBottomRef.current = true;
    setError(null);

    optimisticCounterRef.current += 1;
    const clientNonce = `temp-${optimisticCounterRef.current}`;
    const optimisticId = retryId ?? clientNonce;
    const optimisticMessage: LocalChatMessage = {
      auctionId,
      clientNonce,
      createdAt: new Date().toISOString(),
      id: optimisticId,
      message: trimmedMessage,
      pending: true,
      sender: currentUser,
      senderId: currentUser.id,
      teamId: type === "TEAM" ? teamId : null,
      type,
    };

    setMessages((currentMessages) => mergeMessages(removeMessageById(currentMessages, optimisticId), [optimisticMessage]));
    setMessage("");
    window.requestAnimationFrame(() => inputRef.current?.focus());

    const formData = new FormData();
    formData.set("auctionId", auctionId);
    formData.set("type", type);
    formData.set("message", trimmedMessage);

    sendChatMessage({}, formData).then((result) => {
      if (result.message) {
        setMessages((currentMessages) =>
          replaceOptimisticMessage(currentMessages, optimisticMessage, result.message as ChatMessagePayload),
        );
        return;
      }

      setError(result.error ?? "메시지 전송에 실패했습니다.");
      setMessages((currentMessages) =>
        currentMessages.map((chatMessage) =>
          chatMessage.id === optimisticId ? { ...chatMessage, failed: true, pending: false } : chatMessage,
        ),
      );
    });
  }

  return (
    <Card className={cn("p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-white">{title ?? "채팅"}</h2>
        <span className="text-xs text-slate-500">{activeTab === "GLOBAL" ? "전체" : "팀"}</span>
      </div>

      {!mode ? (
        <div className="mb-4 flex rounded-md border border-white/10 bg-slate-950/70 p-1">
          <button
            className={`flex-1 rounded px-3 py-2 text-sm font-bold ${
              activeTab === "GLOBAL" ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:text-white"
            }`}
            onClick={() => setActiveTab("GLOBAL")}
            type="button"
          >
            전체 채팅
          </button>
          <button
            className={`flex-1 rounded px-3 py-2 text-sm font-bold ${
              activeTab === "TEAM" ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:text-white"
            }`}
            onClick={() => setActiveTab("TEAM")}
            type="button"
          >
            팀 채팅
          </button>
        </div>
      ) : null}

      {isTeamChatDisabled ? (
        <p className="mb-3 rounded-md border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          팀에 속한 사용자만 팀 채팅을 사용할 수 있습니다.
        </p>
      ) : null}

      <div
        ref={scrollRef}
        className={cn("h-72 space-y-3 overflow-y-auto rounded-md border border-white/10 bg-slate-950/50 p-3", messageListClassName)}
        onScroll={handleScroll}
      >
        {visibleMessages.length ? (
          visibleMessages.map((chatMessage) =>
            isSystemMessage(chatMessage) ? (
              <SystemMessage key={chatMessage.id} message={chatMessage.message} />
            ) : (
              <ChatBubble
                isMine={chatMessage.senderId === currentUser.id}
                key={chatMessage.id}
                message={chatMessage}
                onDelete={() => setMessages((currentMessages) => removeMessageById(currentMessages, chatMessage.id))}
                onRetry={() => sendOptimisticMessage(chatMessage.message, chatMessage.type, chatMessage.id)}
              />
            ),
          )
        ) : (
          <p className="py-8 text-center text-sm text-slate-500">아직 메시지가 없습니다.</p>
        )}
      </div>

      <form className="mt-3 grid gap-2" onSubmit={handleSubmit}>
        <Textarea
          ref={inputRef}
          className="min-h-20 resize-none"
          disabled={isTeamChatDisabled}
          maxLength={500}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={activeTab === "GLOBAL" ? "전체 채팅 메시지" : "팀 채팅 메시지"}
          value={message}
        />
        <div className="flex items-center justify-between gap-3">
          <div>
            {error ? <p className="text-xs text-rose-300">{error}</p> : null}
            {isMessageTooLong ? <p className="text-xs text-rose-300">메시지는 500자 이하로 입력해주세요.</p> : null}
            <p className="text-xs text-slate-500">{message.length} / 500</p>
          </div>
          <Button disabled={!canSend} type="submit" variant="secondary">
            전송
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ChatBubble({
  isMine,
  message,
  onDelete,
  onRetry,
}: {
  isMine: boolean;
  message: LocalChatMessage;
  onDelete: () => void;
  onRetry: () => void;
}) {
  return (
    <div className={`flex gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
      {!isMine ? <Avatar name={message.sender.nickname} size="sm" src={message.sender.imageUrl} /> : null}
      <div className={`max-w-[78%] ${isMine ? "text-right" : ""}`}>
        <div className={`mb-1 flex items-center gap-2 ${isMine ? "justify-end" : ""}`}>
          <span className="text-xs font-semibold text-slate-300">{message.sender.nickname}</span>
          <span className="text-[10px] text-slate-600">{formatTime(message.createdAt)}</span>
        </div>
        <p
          className={`whitespace-pre-wrap break-words rounded-md border px-3 py-2 text-sm leading-5 ${
            message.failed
              ? "border-rose-300/30 bg-rose-500/10 text-rose-100"
              : isMine
                ? "border-cyan-300/30 bg-cyan-400/15 text-cyan-50"
                : "border-white/10 bg-slate-900 text-slate-200"
          } ${message.pending ? "opacity-60" : ""}`}
        >
          {message.message}
        </p>
        {message.pending || message.failed ? (
          <div className={`mt-1 flex items-center gap-2 text-[10px] ${isMine ? "justify-end" : ""}`}>
            {message.pending ? <span className="text-slate-500">전송중...</span> : null}
            {message.failed ? (
              <>
                <span className="text-rose-300">전송 실패</span>
                <button className="font-semibold text-cyan-200" onClick={onRetry} type="button">
                  재전송
                </button>
                <button className="text-slate-500" onClick={onDelete} type="button">
                  삭제
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SystemMessage({ message }: { message: string }) {
  return (
    <p className="mx-auto w-fit rounded-full border border-white/10 bg-white/5 px-3 py-1 text-center text-xs text-slate-400">
      {message}
    </p>
  );
}

function mergeMessages(currentMessages: LocalChatMessage[], incomingMessages: ChatMessagePayload[]) {
  return incomingMessages.reduce(
    (mergedMessages, incomingMessage) => replaceMatchingOptimisticMessage(mergedMessages, incomingMessage),
    currentMessages,
  ).sort((first, second) => new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime());
}

function replaceMatchingOptimisticMessage(
  currentMessages: LocalChatMessage[],
  incomingMessage: ChatMessagePayload,
) {
  if (currentMessages.some((message) => message.id === incomingMessage.id)) return currentMessages;

  const optimisticIndex = currentMessages.findIndex(
    (message) =>
      message.id.startsWith("temp-") &&
      message.pending &&
      message.senderId === incomingMessage.senderId &&
      message.message === incomingMessage.message &&
      message.type === incomingMessage.type &&
      message.teamId === incomingMessage.teamId &&
      Math.abs(new Date(incomingMessage.createdAt).getTime() - new Date(message.createdAt).getTime()) < 15_000,
  );

  if (optimisticIndex === -1) return [...currentMessages, incomingMessage];

  return currentMessages.map((message, index) => (index === optimisticIndex ? incomingMessage : message));
}

function replaceOptimisticMessage(
  currentMessages: LocalChatMessage[],
  optimisticMessage: LocalChatMessage,
  incomingMessage: ChatMessagePayload,
) {
  return mergeMessages(
    currentMessages.filter((message) => message.id !== optimisticMessage.id),
    [incomingMessage],
  );
}

function removeMessageById(messages: LocalChatMessage[], id: string) {
  return messages.filter((message) => message.id !== id);
}

function dedupeMessages(messages: ChatMessagePayload[]) {
  return Array.from(new Map(messages.map((message) => [message.id, message])).values()).sort(
    (first, second) => new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime(),
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function isSystemMessage(message: ChatMessagePayload) {
  return message.type === "GLOBAL" && message.message.endsWith("님이 입장하셨습니다.");
}
