"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchWithCsrf, getCsrfToken } from "@/lib/fetch-with-csrf";
import { Avatar } from "@/components/avatar";
import { CHAT_ATTACHMENT_MAX_BYTES } from "@/lib/chat-attachment-upload";

type Channel = {
  id: string;
  name: string;
  topic: string | null;
  isPrivate: boolean;
  slowModeSeconds: number;
  isLocked: boolean;
  isArchived: boolean;
  messageCount: number;
  createdAt: string;
  canPin?: boolean;
  canManageMessages?: boolean;
  canUpload?: boolean;
};

type Message = {
  id: string;
  channelId: string;
  senderUserId: string;
  sender: { displayName: string; avatarUrl: string | null };
  contentText: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt?: string | null;
  replyToMessageId?: string | null;
  replyTo?: { id: string; contentText: string; senderDisplayName: string } | null;
  attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number; downloadUrl: string }[];
};

type PendingAttachment = { storageKey: string; fileName: string; mimeType: string; sizeBytes: number; progress: number };

type ChatMember = { id: string; displayName: string; username: string | null; avatarUrl: string | null };

export function ChatClient({
  orgId,
  role,
  isAdmin,
  userId,
}: {
  orgId: string;
  role: string;
  isAdmin: boolean;
  userId: string;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPinnedPanel, setShowPinnedPanel] = useState(false);
  const [error, setError] = useState("");
  const [perChannelUnread, setPerChannelUnread] = useState<Record<string, number>>({});
  const [pinnedMessages, setPinnedMessages] = useState<Array<{ messageId: string; contentText: string; sender: { displayName: string; avatarUrl: string | null }; pinnedAt: string }>>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; contentText: string; createdAt: string; senderDisplayName: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [mentionsPickerOpen, setMentionsPickerOpen] = useState(false);
  const [mentionsFilter, setMentionsFilter] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    getCsrfToken().catch(() => {});
  }, []);

  const loadUnread = useCallback(async () => {
    try {
      const res = await fetch(`/api/orgs/${orgId}/chat/unread`);
      const data = await res.json();
      if (res.ok) setPerChannelUnread(data.perChannelUnreadCount ?? {});
    } catch {
      /* ignore */
    }
  }, [orgId]);

  const loadPinned = useCallback(async () => {
    if (!selectedChannel) return;
    try {
      const res = await fetch(`/api/orgs/${orgId}/chat/channels/${selectedChannel.id}/pinned`);
      const data = await res.json();
      if (res.ok) setPinnedMessages(data.pinned ?? []);
    } catch {
      /* ignore */
    }
  }, [orgId, selectedChannel]);

  const markRead = useCallback(
    async (channelId: string, lastMessageId: string) => {
      try {
        await fetchWithCsrf(`/api/orgs/${orgId}/chat/channels/${channelId}/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastReadMessageId: lastMessageId }),
        });
        loadUnread();
      } catch {
        /* ignore */
      }
    },
    [orgId, loadUnread]
  );

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/orgs/${orgId}/chat/members`);
      const data = await res.json();
      if (res.ok) setMembers(data.members ?? []);
    } catch {
      /* ignore */
    }
  }, [orgId]);

  const loadChannels = useCallback(async () => {
    setLoadingChannels(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/chat/channels`);
      const data = await res.json();
      if (res.ok) {
        setChannels(data.channels ?? []);
        setSelectedChannel((prev) => (prev ?? data.channels?.[0]) ?? null);
        loadUnread();
      }
    } catch {
      setError("Failed to load channels");
    } finally {
      setLoadingChannels(false);
    }
  }, [orgId, loadUnread]);

  const loadMessages = useCallback(
    async (cursor?: string) => {
      if (!selectedChannel) return;
      setLoadingMessages(true);
      try {
        const url = cursor
          ? `/api/orgs/${orgId}/chat/channels/${selectedChannel.id}/messages?cursor=${cursor}&limit=50`
          : `/api/orgs/${orgId}/chat/channels/${selectedChannel.id}/messages?limit=50`;
        const res = await fetch(url);
        const data = await res.json();
        if (res.ok) {
          const msgs = data.messages ?? [];
          if (cursor) {
            setMessages((prev) => [...msgs, ...prev]);
          } else {
            setMessages(msgs);
          }
          setNextCursor(data.nextCursor ?? null);
        }
      } catch {
        setError("Failed to load messages");
      } finally {
        setLoadingMessages(false);
      }
    },
    [orgId, selectedChannel]
  );

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    if (selectedChannel) {
      loadMessages();
      loadPinned();
      loadMembers();
    } else {
      setMessages([]);
      setNextCursor(null);
      setPinnedMessages([]);
    }
  }, [selectedChannel, loadMessages, loadPinned, loadMembers]);

  useEffect(() => {
    if (!selectedChannel) return;
    const lastMsg = messages.filter((m) => !m.deletedAt).pop();
    if (lastMsg) markRead(selectedChannel.id, lastMsg.id);
  }, [selectedChannel, messages, markRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (hash && messages.some((m) => m.id === hash)) {
      document.getElementById(`msg-${hash}`)?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (!selectedChannel || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/orgs/${orgId}/chat/channels/${selectedChannel.id}/search?q=${encodeURIComponent(searchQuery)}`
        );
        const data = await res.json();
        if (res.ok) setSearchResults(data.messages ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [orgId, selectedChannel, searchQuery]);

  useEffect(() => {
    if (!selectedChannel) return;
    const url = `/api/orgs/${orgId}/chat/stream?channelId=${selectedChannel.id}`;
    const es = new EventSource(url);
    es.addEventListener("message.created", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data);
        setMessages((prev) => {
          if (prev.some((m) => m.id === d.id)) return prev;
          return [...prev, d];
        });
        loadUnread();
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("message.updated", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data);
        setMessages((prev) =>
          prev.map((m) => (m.id === d.id ? { ...m, contentText: d.contentText, editedAt: d.editedAt } : m))
        );
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("message.deleted", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data);
        setMessages((prev) =>
          prev.map((m) => (m.id === d.id ? { ...m, deletedAt: new Date().toISOString() } : m))
        );
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("pinned.updated", () => loadPinned());
    es.addEventListener("unread.updated", () => loadUnread());
    return () => es.close();
  }, [orgId, selectedChannel, loadUnread, loadPinned]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !selectedChannel) return;
    if (selectedChannel.isArchived || selectedChannel.isLocked) return;
    if (pendingAttachments.some((a) => a.progress < 100)) return;
    setSending(true);
    setError("");
    const attachments = pendingAttachments.filter((a) => a.progress === 100);
    const mentionMatches = text.match(/@([^@\s]+)/g) ?? [];
    const mentionsUserIds = [...new Set(mentionMatches.map((m) => {
      const part = m.slice(1).toLowerCase();
      const member = members.find((mb) => mb.displayName.toLowerCase().startsWith(part) || mb.username?.toLowerCase().startsWith(part));
      return member?.id;
    }).filter(Boolean))] as string[];
    try {
      const res = await fetchWithCsrf(
        `/api/orgs/${orgId}/chat/channels/${selectedChannel.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentText: text,
            replyToMessageId: replyToMessage?.id ?? undefined,
            attachments: attachments.map((a) => ({ storageKey: a.storageKey, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes })),
            mentionsUserIds: mentionsUserIds.length ? mentionsUserIds : undefined,
          }),
        }
      );
      const data = await res.json();
      if (res.ok && data.message) {
        setMessages((prev) => [...prev, data.message]);
        setInputText("");
        setReplyToMessage(null);
        setPendingAttachments([]);
      } else {
        setError(data.error ?? "Failed to send");
      }
    } catch {
      setError("Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleAttach = async (file: File) => {
    if (!selectedChannel) return;
    if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
      setError(`File too large (max ${CHAT_ATTACHMENT_MAX_BYTES / 1024 / 1024}MB)`);
      return;
    }
    const mime = file.type as string;
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(mime)) {
      setError("Allowed: PDF, JPEG, PNG, WebP");
      return;
    }
    const entry: PendingAttachment = { storageKey: "", fileName: file.name, mimeType: mime, sizeBytes: file.size, progress: 0 };
    setPendingAttachments((prev) => [...prev, entry]);
    try {
      const presignRes = await fetchWithCsrf(`/api/orgs/${orgId}/chat/attachments/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: selectedChannel.id, fileName: file.name, mimeType: mime, sizeBytes: file.size }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok || !presign.uploadUrl) throw new Error(presign.error ?? "Presign failed");
      setPendingAttachments((prev) => prev.map((p) => (p === entry ? { ...p, storageKey: presign.storageKey, progress: 50 } : p)));
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetchWithCsrf(presign.uploadUrl, {
        method: "POST",
        headers: { "X-Upload-Token": presign.requiredHeaders["X-Upload-Token"] },
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const uploadResult = await uploadRes.json();
      setPendingAttachments((prev) =>
        prev.map((p) =>
          p.storageKey === presign.storageKey
            ? { ...p, storageKey: uploadResult.storageKey ?? presign.storageKey, fileName: uploadResult.fileName ?? file.name, mimeType: uploadResult.mimeType ?? mime, sizeBytes: uploadResult.sizeBytes ?? file.size, progress: 100 }
            : p
        )
      );
    } catch {
      setError("Upload failed");
      setPendingAttachments((prev) => prev.filter((p) => p !== entry));
    }
  };

  const removePendingAttachment = (idx: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const canSend = selectedChannel && !selectedChannel.isArchived && !selectedChannel.isLocked;

  return (
    <div className="relative flex flex-1 min-h-0 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      {/* Channel list */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Channels
          </span>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowCreateChannel(true)}
              className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700"
              aria-label="Create channel"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loadingChannels ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          ) : channels.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isAdmin ? "Create your first channel." : "No channels yet."}
            </p>
          ) : (
            channels.map((ch) => {
              const unread = perChannelUnread[ch.id] ?? 0;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setSelectedChannel(ch)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                    selectedChannel?.id === ch.id
                      ? "bg-slate-200 font-medium text-slate-900 dark:bg-slate-700 dark:text-slate-100"
                      : unread > 0
                        ? "font-semibold text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  <span>#</span>
                  <span className="min-w-0 flex-1 truncate">{ch.name}</span>
                  {unread > 0 && (
                    <span className="shrink-0 rounded-full bg-slate-900 px-1.5 py-0.5 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                  {ch.isPrivate && unread === 0 && (
                    <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        {selectedChannel ? (
          <>
            {/* Channel header */}
            <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">#{selectedChannel.name}</h2>
                {selectedChannel.topic && (
                  <p className="truncate text-sm text-slate-500 dark:text-slate-400">{selectedChannel.topic}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-28 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPinnedPanel(!showPinnedPanel)}
                  className={`rounded p-1.5 ${showPinnedPanel ? "bg-slate-200 dark:bg-slate-700" : ""} text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700`}
                  aria-label="Pinned messages"
                  title="Pinned"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowSettings(true)}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700"
                    aria-label="Channel settings"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                )}
              </div>
            </header>

            {searchQuery.length >= 2 && (
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800/50">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Search results</p>
                {searching ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Searching…</p>
                ) : searchResults.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No matches</p>
                ) : (
                  <ul className="mt-1 max-h-32 overflow-y-auto space-y-1">
                    {searchResults.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => {
                            const el = document.getElementById(`msg-${r.id}`);
                            el?.scrollIntoView({ behavior: "smooth" });
                            setSearchQuery("");
                          }}
                          className="text-left text-sm text-slate-700 hover:underline dark:text-slate-300"
                        >
                          <span className="font-medium">{r.senderDisplayName}</span>: {r.contentText}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Messages */}
            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {loadingMessages && messages.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading messages…</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Be the first to post an update.
                </p>
              ) : (
                messages.map((m) => (
                  <MessageRow
                    key={m.id}
                    message={m}
                    orgId={orgId}
                    userId={userId}
                    selectedChannel={selectedChannel}
                    onReply={() => setReplyToMessage(m)}
                    onCopyLink={() => navigator.clipboard.writeText(`${typeof window !== "undefined" ? window.location.origin : ""}/app/chat#${m.id}`)}
                    pinnedMessageIds={new Set(pinnedMessages.map((p) => p.messageId))}
                    onPin={async () => {
                      await fetchWithCsrf(`/api/orgs/${orgId}/chat/messages/${m.id}/pin`, { method: "POST" });
                      loadPinned();
                    }}
                    onUnpin={async () => {
                      await fetchWithCsrf(`/api/orgs/${orgId}/chat/messages/${m.id}/unpin`, { method: "DELETE" });
                      loadPinned();
                    }}
                    onDelete={async () => {
                      await fetchWithCsrf(`/api/orgs/${orgId}/chat/messages/${m.id}`, { method: "DELETE" });
                      setMessages((prev) => prev.filter((x) => x.id !== m.id));
                    }}
                    onEdit={() => {}}
                    onScrollTo={() => {
                      document.getElementById(`msg-${m.id}`)?.scrollIntoView({ behavior: "smooth" });
                    }}
                    onMessageUpdated={(updated) =>
                      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...updated } : x)))
                    }
                    id={`msg-${m.id}`}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-slate-200 p-3 dark:border-slate-700">
              {error && (
                <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
              {replyToMessage && (
                <div className="mb-2 flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-600 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => document.getElementById(`msg-${replyToMessage.id}`)?.scrollIntoView({ behavior: "smooth" })}
                    className="text-left text-xs text-slate-600 hover:underline dark:text-slate-400"
                  >
                    Replying to {replyToMessage.sender.displayName}: {replyToMessage.contentText.slice(0, 50)}…
                  </button>
                  <button type="button" onClick={() => setReplyToMessage(null)} className="text-slate-500 hover:text-slate-700">×</button>
                </div>
              )}
              {pendingAttachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingAttachments.map((a, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                    >
                      {a.fileName} {a.progress < 100 ? `(${a.progress}%)` : ""}
                      <button type="button" onClick={() => removePendingAttachment(i)} className="text-slate-500 hover:text-red-500">×</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                {selectedChannel.canUpload !== false && (
                  <label className="flex cursor-pointer items-center rounded-lg border border-slate-300 px-3 py-2 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800">
                    <input
                      type="file"
                      className="sr-only"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleAttach(f);
                        e.target.value = "";
                      }}
                    />
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </label>
                )}
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => {
                    const v = e.target.value;
                    setInputText(v);
                    const lastAt = v.lastIndexOf("@");
                    if (lastAt >= 0) {
                      setMentionsPickerOpen(true);
                      setMentionsFilter(v.slice(lastAt + 1).split(/\s/)[0] ?? "");
                    } else {
                      setMentionsPickerOpen(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={canSend ? "Type a message… (@ to mention)" : "Channel is locked or archived"}
                  disabled={!canSend || sending || pendingAttachments.some((a) => a.progress < 100)}
                  maxLength={4000}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!canSend || sending || !inputText.trim() || pendingAttachments.some((a) => a.progress < 100)}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
              {mentionsPickerOpen && members.length > 0 && (
                <div className="mt-1 max-h-32 overflow-y-auto rounded border border-slate-200 bg-white shadow dark:border-slate-600 dark:bg-slate-800">
                  {members
                    .filter((m) => m.id !== userId && (!mentionsFilter || m.displayName.toLowerCase().includes(mentionsFilter.toLowerCase()) || m.username?.toLowerCase().includes(mentionsFilter.toLowerCase())))
                    .slice(0, 5)
                    .map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
                        onClick={() => {
                          const atIdx = inputText.lastIndexOf("@");
                          const before = inputText.slice(0, atIdx);
                          const after = inputText.slice(atIdx).replace(/@[^@\s]*$/, "");
                          setInputText(before + "@" + m.displayName + " " + after);
                          setMentionsPickerOpen(false);
                        }}
                      >
                        <Avatar src={m.avatarUrl} displayName={m.displayName} size="sm" />
                        {m.displayName}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-slate-500 dark:text-slate-400">
            {loadingChannels
              ? "Loading…"
              : channels.length === 0
                ? isAdmin
                  ? "Create your first channel to collaborate."
                  : "Ask admin to create channels."
                : "Select a channel"}
          </div>
        )}
      </div>

      {showCreateChannel && (
        <CreateChannelModal
          orgId={orgId}
          onClose={() => setShowCreateChannel(false)}
          onCreated={async (ch) => {
            setShowCreateChannel(false);
            const res = await fetch(`/api/orgs/${orgId}/chat/channels`);
            const data = await res.json();
            if (res.ok && data.channels?.length) {
              setChannels(data.channels);
              const found = data.channels.find((c: Channel) => c.id === ch.id);
              setSelectedChannel(found ?? ch);
            } else {
              setChannels((prev) => [...prev, ch]);
              setSelectedChannel(ch);
            }
            loadUnread();
          }}
        />
      )}

      {showSettings && selectedChannel && (
        <ChannelSettingsModal
          orgId={orgId}
          channel={selectedChannel}
          onClose={() => setShowSettings(false)}
          onUpdated={(ch) => {
            setChannels((prev) => prev.map((c) => (c.id === ch.id ? { ...c, ...ch } : c)));
            setSelectedChannel((prev) => (prev?.id === ch.id ? ({ ...prev, ...ch } as Channel) : prev));
            setShowSettings(false);
          }}
        />
      )}

      {showPinnedPanel && selectedChannel && (
        <aside className="absolute right-0 top-0 bottom-0 w-72 border-l border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 flex flex-col z-10">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pinned</span>
            <button type="button" onClick={() => setShowPinnedPanel(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">×</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {pinnedMessages.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No pinned messages</p>
            ) : (
              pinnedMessages.map((p) => (
                <button
                  key={p.messageId}
                  type="button"
                  onClick={() => {
                    document.getElementById(`msg-${p.messageId}`)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="flex gap-2 w-full rounded-lg border border-slate-200 p-2 text-left hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  <Avatar src={p.sender.avatarUrl} displayName={p.sender.displayName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{p.sender.displayName}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{p.contentText}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function MessageRow({
  message,
  orgId,
  userId,
  selectedChannel,
  pinnedMessageIds,
  onReply,
  onCopyLink,
  onPin,
  onUnpin,
  onDelete,
  onEdit,
  onScrollTo,
  onMessageUpdated,
  id,
}: {
  message: Message;
  orgId: string;
  userId: string;
  selectedChannel: Channel;
  pinnedMessageIds: Set<string>;
  onReply: () => void;
  onCopyLink: () => void;
  onPin: () => void;
  onUnpin: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onScrollTo: () => void;
  onMessageUpdated: (upd: Partial<Message>) => void;
  id: string;
}) {
  const [hover, setHover] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const EDIT_WINDOW_MS = 10 * 60 * 1000;
  const canEdit = message.senderUserId === userId && Date.now() - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS;
  const canDelete = (selectedChannel.canManageMessages ?? false) || canEdit;
  const canPin = selectedChannel.canPin ?? false;
  const isPinned = pinnedMessageIds.has(message.id);
  const avatarUrl = message.sender.avatarUrl ? `/api/orgs/${orgId}/users/${message.senderUserId}/avatar` : null;

  const handleSaveEdit = async () => {
    const el = document.getElementById(`edit-${message.id}`) as HTMLInputElement | null;
    const val = el?.value?.trim() ?? message.contentText;
    const res = await fetchWithCsrf(`/api/orgs/${orgId}/chat/messages/${message.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentText: val }),
    });
    const data = await res.json();
    if (res.ok && data.message) {
      onMessageUpdated({ contentText: data.message.contentText, editedAt: data.message.editedAt });
    }
    setShowEdit(false);
  };

  if (message.deletedAt) {
    return (
      <div id={id} className="flex gap-3 opacity-60">
        <Avatar src={avatarUrl} displayName={message.sender.displayName} size="md" />
        <div className="text-sm text-slate-500 dark:text-slate-400 italic">Message deleted</div>
      </div>
    );
  }

  return (
    <div
      id={id}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group flex gap-3"
    >
      <Avatar src={avatarUrl} displayName={message.sender.displayName} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-slate-900 dark:text-slate-100">{message.sender.displayName}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {new Date(message.createdAt).toLocaleString()}
            {message.editedAt && " (edited)"}
          </span>
        </div>
        {message.replyTo && (
          <button
            type="button"
            onClick={() => document.getElementById(`msg-${message.replyTo!.id}`)?.scrollIntoView({ behavior: "smooth" })}
            className="mt-1 block rounded border-l-2 border-slate-300 pl-2 text-left text-xs text-slate-500 hover:underline dark:border-slate-600 dark:text-slate-400"
          >
            Replying to {message.replyTo.senderDisplayName}: {message.replyTo.contentText}
          </button>
        )}
        {showEdit ? (
          <div className="mt-1 flex gap-2">
            <input
              id={`edit-${message.id}`}
              defaultValue={message.contentText}
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
              autoFocus
            />
            <button type="button" onClick={handleSaveEdit} className="rounded bg-slate-900 px-2 py-1 text-xs text-white">Save</button>
            <button type="button" onClick={() => setShowEdit(false)} className="rounded px-2 py-1 text-xs text-slate-500">Cancel</button>
          </div>
        ) : (
          <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
            {message.contentText}
          </p>
        )}
        {message.attachments?.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.attachments.map((a) => (
              <a
                key={a.id}
                href={`/api/orgs/${orgId}/chat/attachments/${a.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                {a.fileName}
              </a>
            ))}
          </div>
        )}
        {hover && (
          <div className="mt-1 flex gap-1 text-xs">
            <button type="button" onClick={onReply} className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700">Reply</button>
            <button type="button" onClick={onCopyLink} className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700">Copy link</button>
            {canPin && <button type="button" onClick={isPinned ? onUnpin : onPin} className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700">{isPinned ? "Unpin" : "Pin"}</button>}
            {canEdit && <button type="button" onClick={() => setShowEdit(true)} className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700">Edit</button>}
            {canDelete && <button type="button" onClick={onDelete} className="rounded px-1.5 py-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">Delete</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateChannelModal({
  orgId,
  onClose,
  onCreated,
}: {
  orgId: string;
  onClose: () => void;
  onCreated: (ch: Channel) => void;
}) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [slowModeSeconds, setSlowModeSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Channel name is required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/chat/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          topic: topic.trim() || undefined,
          isPrivate,
          slowModeSeconds,
        }),
      });
      const data = await res.json();
      if (res.ok && data.channel) {
        onCreated({
          id: data.channel.id,
          name: data.channel.name,
          topic: data.channel.topic,
          isPrivate: data.channel.isPrivate,
          slowModeSeconds: data.channel.slowModeSeconds,
          isLocked: data.channel.isLocked ?? false,
          isArchived: data.channel.isArchived ?? false,
          messageCount: 0,
          createdAt: data.channel.createdAt,
        });
      } else {
        setError(data.error ?? "Failed to create");
      }
    } catch {
      setError("Failed to create");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create channel</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="general"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Topic (optional)</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="private"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded border-slate-300"
            />
            <label htmlFor="private" className="text-sm text-slate-700 dark:text-slate-300">
              Private channel
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Slow mode (seconds)
            </label>
            <select
              value={slowModeSeconds}
              onChange={(e) => setSlowModeSeconds(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value={0}>Off</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChannelSettingsModal({
  orgId,
  channel,
  onClose,
  onUpdated,
}: {
  orgId: string;
  channel: Channel;
  onClose: () => void;
  onUpdated: (ch: Partial<Channel>) => void;
}) {
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? "");
  const [isPrivate, setIsPrivate] = useState(channel.isPrivate);
  const [slowModeSeconds, setSlowModeSeconds] = useState(channel.slowModeSeconds);
  const [isLocked, setIsLocked] = useState(channel.isLocked);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/chat/channels/${channel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || channel.name,
          topic: topic.trim() || null,
          isPrivate,
          slowModeSeconds,
          isLocked,
        }),
      });
      const data = await res.json();
      if (res.ok && data.channel) {
        onUpdated(data.channel);
      } else {
        setError(data.error ?? "Failed to update");
      }
    } catch {
      setError("Failed to update");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Channel settings</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="private-settings"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded border-slate-300"
            />
            <label htmlFor="private-settings" className="text-sm text-slate-700 dark:text-slate-300">
              Private
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="locked"
              checked={isLocked}
              onChange={(e) => setIsLocked(e.target.checked)}
              className="rounded border-slate-300"
            />
            <label htmlFor="locked" className="text-sm text-slate-700 dark:text-slate-300">
              Locked (read-only)
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Slow mode (seconds)
            </label>
            <select
              value={slowModeSeconds}
              onChange={(e) => setSlowModeSeconds(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value={0}>Off</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
