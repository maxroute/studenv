"use client";
import { PageLoader } from "@/components/ui/page-loader";
import "./study-groups.css";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import useSWR, { mutate as mutateSWR } from "swr";
import { io, type Socket } from "socket.io-client";
import {
  ArrowLeft,
  Camera,
  Check,
  Globe2,
  Lock,
  MessageCircle,
  MoreVertical,
  Paperclip,
  Play,
  RotateCw,
  Plus,
  Search,
  Send,
  Ticket,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useDashboardNavigation } from "../../dashboard-navigation";
import { useStudyGroups, useStudyGroup } from "@/hooks/useStudyGroups";
import { BUILT_IN_STUDY_ROOM_TEMPLATES } from "@/lib/utils/study-room-templates";
import { apiFetcher } from "@/lib/client/fetcher";
import {
  appendMessageOnce,
  isNearBottom,
  unsentMessages,
  type PendingMessageState,
} from "@/lib/study-groups/chat";
import {
  GroupFileCard,
  PhotoBadge,
  SharedFilesList,
  formatFileSize,
  initialsFor as getInitials,
} from "@/components/study/group-chat-parts";
import type {
  StudyGroupFileRecord,
  StudyGroupJoinResult,
  StudyGroupMessageRecord,
  StudyGroupRecord,
} from "@/types";

type ApiResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

type GroupPresencePayload = {
  participants: Array<{ userId: string }>;
};

/** A message shown at once while it is being sent (or after sending failed). */
type PendingMessage = {
  clientMessageId: string;
  groupId: string;
  content: string;
  files: File[];
  createdAt: string;
  state: PendingMessageState;
};

/** The live socket pushes who is online; this snapshot is only a fallback. */
const PRESENCE_REFRESH_MS = 15_000;

function newClientMessageId() {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `local-${random}`;
}

const MAX_TOTAL_ATTACHMENT_SIZE = 150 * 1024 * 1024;
const DEFAULT_STUDY_ROOM_TEMPLATE =
  BUILT_IN_STUDY_ROOM_TEMPLATES.find((template) => template.id === "focus") ??
  BUILT_IN_STUDY_ROOM_TEMPLATES[0];
const GROUP_READ_MARKERS_STORAGE_KEY = "studenv.studyGroups.readMarkers.v1";

function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function getMessagePreview(message: StudyGroupMessageRecord) {
  if (message.content) {
    return message.content;
  }

  if (message.attachments.length === 1) {
    return message.attachments[0]?.name || "Shared a file";
  }

  if (message.attachments.length > 1) {
    return `Shared ${message.attachments.length} files`;
  }

  return "No messages yet";
}

function getLatestVisibleMessageAt(group: StudyGroupRecord) {
  return (
    group.messages[group.messages.length - 1]?.createdAt ?? group.updatedAt
  );
}

function loadGroupReadMarkers() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawMarkers = window.localStorage.getItem(
      GROUP_READ_MARKERS_STORAGE_KEY,
    );
    const parsed = rawMarkers ? JSON.parse(rawMarkers) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function saveGroupReadMarkers(markers: Record<string, string>) {
  try {
    window.localStorage.setItem(
      GROUP_READ_MARKERS_STORAGE_KEY,
      JSON.stringify(markers),
    );
  } catch {
    // Ignore storage failures; the in-memory marker still updates this session.
  }
}

function StudyGroupsContentSkeleton() {
  return <PageLoader label="Opening your groups" />;
}

function StudyGroupsMembersSkeleton() {
  return (
    <div className="members-panel-scroll animate-pulse">
      <div className="info-section">
        <div className="mb-3 h-3 w-20 rounded bg-white/[0.05]" />
        <div className="h-12 rounded-[var(--r-sm)] bg-[var(--raised)]" />
      </div>
      <div className="info-section">
        <div className="mb-3 h-3 w-16 rounded bg-white/[0.05]" />
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-white/[0.05]" />
              <div className="h-3 flex-1 rounded bg-white/[0.04]" />
            </div>
          ))}
        </div>
      </div>
      <div className="h-32 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)]" />
    </div>
  );
}

async function readJson<T>(response: Response) {
  const json = (await response.json()) as ApiResult<T>;
  if (!response.ok || !json.ok || json.data === undefined) {
    throw new Error(json.error || "Request failed.");
  }
  return json.data;
}

export default function StudyGroupsPage() {
  const router = useRouter();
  const { beginNavigation } = useDashboardNavigation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const groupSearchInputRef = useRef<HTMLInputElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const {
    groups,
    isLoading: groupsLoading,
    data: loadedGroups,
    error: groupsError,
    upsertGroup,
    addGroup,
    refreshGroup,
    mutate: mutateGroups,
  } = useStudyGroups();
  const groupsFailed = !loadedGroups && Boolean(groupsError);
  const loading = groupsLoading || (!loadedGroups && !groupsError);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const { group: activeGroupDetails, mutateActiveGroup } =
    useStudyGroup(selectedGroupId);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [savingGroup, setSavingGroup] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrivacy, setEditPrivacy] = useState<"public" | "private">(
    "public",
  );
  const [editMemberLimit, setEditMemberLimit] = useState("");
  const [refreshInviteCode, setRefreshInviteCode] = useState(false);
  const [actingOnRequestId, setActingOnRequestId] = useState<string | null>(
    null,
  );
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [activeUserIds, setActiveUserIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [mobileGroupMenuOpen, setMobileGroupMenuOpen] = useState(false);
  const [mobileAboutOpen, setMobileAboutOpen] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupPanelSearchOpen, setGroupPanelSearchOpen] = useState(false);
  const [groupReadMarkers, setGroupReadMarkers] = useState<
    Record<string, string>
  >(() => loadGroupReadMarkers());
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [savingPhoto, setSavingPhoto] = useState(false);
  // Group info shows one tab at a time, so a long member list doesn't push files and settings away.
  const [infoTab, setInfoTab] = useState<"members" | "files" | "settings">("members");
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  // Follow new messages while the reader is at the end of the chat.
  const stickToBottomRef = useRef(true);
  const scrolledGroupIdRef = useRef<string | null>(null);

  const listGroup = useMemo(
    () =>
      groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null,
    [groups, selectedGroupId],
  );
  const activeGroup = activeGroupDetails || listGroup;
  // Settings is the owner's tab; anyone else falls back to the member list.
  const shownTab = infoTab === "settings" && !activeGroup?.canManage ? "members" : infoTab;
  const {
    data: sharedFiles,
    error: sharedFilesError,
    isLoading: sharedFilesLoading,
    mutate: mutateSharedFiles,
  } = useSWR<StudyGroupFileRecord[]>(
    activeGroup ? `/api/study-groups/${activeGroup.id}/files` : null,
    apiFetcher,
    { revalidateOnFocus: false, dedupingInterval: 10_000 },
  );
  const filteredGroups = useMemo(() => {
    const query = groupSearch.trim().toLowerCase();
    if (!query) {
      return groups;
    }

    return groups.filter((group) => {
      const lastMessage = group.messages[group.messages.length - 1];
      return [
        group.title,
        group.description,
        lastMessage ? getMessagePreview(lastMessage) : "",
      ].some((value) => value?.toLowerCase().includes(query));
    });
  }, [groups, groupSearch]);
  const activeMemberIds = useMemo(() => {
    if (!activeGroup) {
      return new Set<string>();
    }

    const memberIds = new Set(activeUserIds);
    if (activeGroup.currentUserId) {
      memberIds.add(activeGroup.currentUserId);
    }
    return memberIds;
  }, [activeGroup, activeUserIds]);

  // Auto-select the first group when groups are loaded and nothing is selected.
  useEffect(() => {
    if (!selectedGroupId && groups.length > 0) {
      setSelectedGroupId(groups[0]?.id ?? null);
    }
  }, [groups, selectedGroupId]);

  useEffect(() => {
    if (!selectedGroupId) {
      return;
    }

    const selectedGroup = groups.find((group) => group.id === selectedGroupId);
    if (!selectedGroup) {
      return;
    }

    setGroupReadMarkers((current) => {
      const nextReadAt = new Date(
        getLatestVisibleMessageAt(selectedGroup),
      ).toISOString();
      if (current[selectedGroupId] === nextReadAt) {
        return current;
      }
      const next = { ...current, [selectedGroupId]: nextReadAt };
      saveGroupReadMarkers(next);
      return next;
    });
  }, [groups, selectedGroupId]);

  useEffect(() => {
    if (!activeGroup?.id) {
      setActiveUserIds([]);
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    let cancelled = false;
    let socket: Socket | null = null;

    async function refreshPresenceSnapshot() {
      try {
        const payload = await readJson<GroupPresencePayload>(
          await fetch(`/api/study-groups/${activeGroup.id}/presence`, {
            cache: "no-store",
          }),
        );
        if (cancelled) {
          return;
        }

        setActiveUserIds(
          payload.participants.map((participant) => participant.userId),
        );
      } catch {
        // Leave the current socket-driven state in place if the snapshot request fails.
      }
    }

    async function connectSocket() {
      try {
        const payload = await readJson<{ token: string }>(
          await fetch(`/api/study-groups/${activeGroup.id}/socket-token`, {
            cache: "no-store",
          }),
        );
        if (cancelled) {
          return;
        }

        socket = io("/study-groups", {
          path: "/api/study-group/socket/io",
          auth: { token: payload.token },
          transports: ["websocket", "polling"],
          autoConnect: false,
        });
        socketRef.current = socket;

        socket.on("connect", () => {
          setActiveUserIds((current) => {
            if (current.includes(activeGroup.currentUserId)) {
              return current;
            }
            return [...current, activeGroup.currentUserId];
          });
          void refreshPresenceSnapshot();
        });

        socket.on(
          "group:presence",
          (event: { participants: Array<{ userId: string }> }) => {
            setActiveUserIds((current) => {
              const nextUserIds = event.participants.map(
                (participant) => participant.userId,
              );
              if (
                !nextUserIds.includes(activeGroup.currentUserId) &&
                current.includes(activeGroup.currentUserId)
              ) {
                nextUserIds.push(activeGroup.currentUserId);
              }
              return nextUserIds;
            });
          },
        );

        socket.on(
          "group:message",
          (event: { groupId: string; message: StudyGroupMessageRecord }) => {
            if (event.message.attachments.length > 0) {
              void mutateSWR(`/api/study-groups/${event.groupId}/files`);
            }
            void mutateGroups(
              (current) =>
                current?.map((group) => {
                  if (group.id !== event.groupId) {
                    return group;
                  }

                  if (
                    group.messages.some(
                      (message) => message.id === event.message.id,
                    )
                  ) {
                    return group;
                  }

                  return {
                    ...group,
                    messages: [...group.messages, event.message],
                    updatedAt: event.message.createdAt,
                  };
                }),
              { revalidate: false },
            );

            if (event.groupId === activeGroup?.id) {
              void mutateActiveGroup(
                (current) => {
                  if (!current) {
                    return current;
                  }

                  if (
                    current.messages.some(
                      (message) => message.id === event.message.id,
                    )
                  ) {
                    return current;
                  }

                  return {
                    ...current,
                    messages: [...current.messages, event.message],
                    updatedAt: event.message.createdAt,
                  };
                },
                { revalidate: false },
              );
            }
          },
        );

        socket.on("group:update", (event: { groupId: string }) => {
          void refreshGroup(event.groupId)
            .then((updatedGroup) => {
              if (event.groupId === activeGroup?.id) {
                void mutateActiveGroup(updatedGroup, { revalidate: false });
              }
            })
            .catch(() => {});
        });

        socket.connect();
      } catch {
        setActiveUserIds([]);
      }
    }

    void refreshPresenceSnapshot();
    void connectSocket();
    const presenceInterval = window.setInterval(() => {
      void refreshPresenceSnapshot();
    }, PRESENCE_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(presenceInterval);
      setActiveUserIds([]);
      socket?.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [activeGroup?.id]);

  useEffect(() => {
    setInfoTab("members");
  }, [activeGroup?.id]);

  useEffect(() => {
    if (!activeGroup) {
      setEditTitle("");
      setEditDescription("");
      setRefreshInviteCode(false);
      return;
    }

    setEditTitle(activeGroup.title);
    setEditDescription(activeGroup.description || "");
    setEditPrivacy(activeGroup.privacy);
    setEditMemberLimit(
      activeGroup.memberLimit ? String(activeGroup.memberLimit) : "",
    );
    setRefreshInviteCode(false);
    setMobileGroupMenuOpen(false);
    setMobileAboutOpen(false);
  }, [
    activeGroup?.id,
    activeGroup?.title,
    activeGroup?.description,
    activeGroup?.privacy,
    activeGroup?.memberLimit,
  ]);

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setCreating(true);
      const group = await readJson<StudyGroupRecord>(
        await fetch("/api/study-groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: createTitle,
            description: createDescription,
            roomSetup: {
              templateId: DEFAULT_STUDY_ROOM_TEMPLATE?.id,
              template: DEFAULT_STUDY_ROOM_TEMPLATE
                ? {
                    id: DEFAULT_STUDY_ROOM_TEMPLATE.id,
                    label: DEFAULT_STUDY_ROOM_TEMPLATE.label,
                    description: DEFAULT_STUDY_ROOM_TEMPLATE.description,
                    focusMinutes: DEFAULT_STUDY_ROOM_TEMPLATE.focusMinutes,
                    breakMinutes: DEFAULT_STUDY_ROOM_TEMPLATE.breakMinutes,
                    prompt: DEFAULT_STUDY_ROOM_TEMPLATE.prompt,
                    starterCollectionId:
                      DEFAULT_STUDY_ROOM_TEMPLATE.starterCollectionId ?? null,
                    starterCollectionTitle:
                      DEFAULT_STUDY_ROOM_TEMPLATE.starterCollectionTitle ??
                      null,
                    starterItemId:
                      DEFAULT_STUDY_ROOM_TEMPLATE.starterItemId ?? null,
                    starterItemTitle:
                      DEFAULT_STUDY_ROOM_TEMPLATE.starterItemTitle ?? null,
                    custom: DEFAULT_STUDY_ROOM_TEMPLATE.custom ?? false,
                  }
                : undefined,
            },
          }),
        }),
      );
      await addGroup(group);
      setSelectedGroupId(group.id);
      setCreateTitle("");
      setCreateDescription("");
      setCreateOpen(false);
      setMobileChatOpen(true);
      toast.success("Study group created.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleJoinGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setJoining(true);
      const result = await readJson<StudyGroupJoinResult>(
        await fetch("/api/study-groups/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inviteCode: inviteCodeInput,
          }),
        }),
      );
      setInviteCodeInput("");
      setJoinOpen(false);
      if (result.status === "joined") {
        const group = result.group;
        await upsertGroup(group);
        void mutateActiveGroup(group, { revalidate: false });
        setSelectedGroupId(group.id);
        setMobileChatOpen(true);
        toast.success("Joined study group.");
      } else {
        toast.success(result.message);
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setJoining(false);
    }
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) {
      event.target.value = "";
      return;
    }

    setAttachments((current) => {
      const next = [...current, ...selectedFiles];
      const totalSize = next.reduce((sum, file) => sum + file.size, 0);

      if (totalSize > MAX_TOTAL_ATTACHMENT_SIZE) {
        toast.error("Attachments must stay under 150 MB total per message.");
        return current;
      }

      return next;
    });

    event.target.value = "";
  }

  function handleOpenStudyRoom(
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    router.prefetch(href);
    flushSync(() => {
      beginNavigation(href);
    });
    window.requestAnimationFrame(() => {
      router.push(href);
    });
  }

  function removeAttachmentAt(index: number) {
    setAttachments((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  async function deliverPendingMessage(pending: PendingMessage) {
    setPendingMessages((current) =>
      current.map((entry) =>
        entry.clientMessageId === pending.clientMessageId
          ? { ...entry, state: "sending" }
          : entry,
      ),
    );

    try {
      const payload = new FormData();
      payload.set("content", pending.content);
      payload.set("clientMessageId", pending.clientMessageId);
      pending.files.forEach((file) => payload.append("files", file));

      const message = await readJson<StudyGroupMessageRecord>(
        await fetch(`/api/study-groups/${pending.groupId}/messages`, {
          method: "POST",
          body: payload,
        }),
      );
      const addMessage = (group: StudyGroupRecord) => ({
        ...group,
        messages: appendMessageOnce(group.messages, message),
        updatedAt: message.createdAt,
      });

      // By group id, not the open chat: the reader may have switched groups meanwhile.
      await mutateGroups(
        (current) =>
          current?.map((group) =>
            group.id === pending.groupId ? addMessage(group) : group,
          ),
        { revalidate: false },
      );
      void mutateSWR<StudyGroupRecord>(
        `/api/study-groups/${pending.groupId}`,
        (current) => (current ? addMessage(current) : current),
        { revalidate: false },
      );
      if (message.attachments.length > 0) {
        void mutateSWR(`/api/study-groups/${pending.groupId}/files`);
      }
      setPendingMessages((current) =>
        current.filter(
          (entry) => entry.clientMessageId !== pending.clientMessageId,
        ),
      );
      setActiveUserIds((current) =>
        current.includes(message.authorId)
          ? current
          : [...current, message.authorId],
      );
    } catch (error) {
      setPendingMessages((current) =>
        current.map((entry) =>
          entry.clientMessageId === pending.clientMessageId
            ? { ...entry, state: "failed" }
            : entry,
        ),
      );
      toast.error((error as Error).message);
    }
  }

  function discardPendingMessage(clientMessageId: string) {
    setPendingMessages((current) =>
      current.filter((entry) => entry.clientMessageId !== clientMessageId),
    );
  }

  function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeGroup || (!messageInput.trim() && attachments.length === 0)) {
      return;
    }

    // Shown straight away; the server's copy replaces it when it arrives.
    const pending: PendingMessage = {
      clientMessageId: newClientMessageId(),
      groupId: activeGroup.id,
      content: messageInput,
      files: attachments,
      createdAt: new Date().toISOString(),
      state: "sending",
    };
    stickToBottomRef.current = true;
    setPendingMessages((current) => [...current, pending]);
    setMessageInput("");
    setAttachments([]);
    void deliverPendingMessage(pending);
  }

  async function handleGroupPhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeGroup?.canManage) {
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Group photos must be 5 MB or smaller.");
      return;
    }

    try {
      setSavingPhoto(true);
      const payload = new FormData();
      payload.set("file", file);
      const group = await readJson<StudyGroupRecord>(
        await fetch(`/api/study-groups/${activeGroup.id}/photo`, {
          method: "POST",
          body: payload,
        }),
      );
      await upsertGroup(group);
      void mutateActiveGroup(group, { revalidate: false });
      toast.success("Group photo updated.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingPhoto(false);
    }
  }

  async function handleRemoveGroupPhoto() {
    if (!activeGroup?.canManage) {
      return;
    }

    try {
      setSavingPhoto(true);
      const group = await readJson<StudyGroupRecord>(
        await fetch(`/api/study-groups/${activeGroup.id}/photo`, {
          method: "DELETE",
        }),
      );
      await upsertGroup(group);
      void mutateActiveGroup(group, { revalidate: false });
      toast.success("Group photo removed.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingPhoto(false);
    }
  }

  async function handleUpdateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeGroup || !activeGroup.canManage) {
      return;
    }

    try {
      setSavingGroup(true);
      const group = await readJson<StudyGroupRecord>(
        await fetch(`/api/study-groups/${activeGroup.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editTitle,
            description: editDescription,
            privacy: editPrivacy,
            memberLimit: editMemberLimit.trim()
              ? Number(editMemberLimit)
              : null,
            refreshInviteCode,
          }),
        }),
      );

      await upsertGroup(group);
      void mutateActiveGroup(group, { revalidate: false });
      setSelectedGroupId(group.id);
      setRefreshInviteCode(false);
      toast.success("Group updated.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingGroup(false);
    }
  }

  async function handleManageJoinRequest(
    requestId: string,
    action: "approve" | "reject",
  ) {
    if (!activeGroup) {
      return;
    }

    try {
      setActingOnRequestId(requestId);
      const group = await readJson<StudyGroupRecord>(
        await fetch(
          `/api/study-groups/${activeGroup.id}/join-requests/${requestId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          },
        ),
      );
      await upsertGroup(group);
      void mutateActiveGroup(group, { revalidate: false });
      setSelectedGroupId(group.id);
      toast.success(
        action === "approve"
          ? "Join request approved."
          : "Join request rejected.",
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setActingOnRequestId(null);
    }
  }

  async function handleRemoveMember(memberUserId: string) {
    if (!activeGroup) {
      return;
    }

    try {
      setRemovingMemberId(memberUserId);
      const group = await readJson<StudyGroupRecord>(
        await fetch(
          `/api/study-groups/${activeGroup.id}/members/${memberUserId}`,
          {
            method: "DELETE",
          },
        ),
      );
      await upsertGroup(group);
      void mutateActiveGroup(group, { revalidate: false });
      setSelectedGroupId(group.id);
      toast.success("Member removed.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setRemovingMemberId(null);
    }
  }

  const messages: StudyGroupMessageRecord[] = activeGroup?.messages ?? [];
  const activeGroupId = activeGroup?.id ?? null;
  const visiblePending = activeGroupId
    ? unsentMessages(
        pendingMessages.filter((entry) => entry.groupId === activeGroupId),
        messages,
      )
    : [];
  const currentMember =
    activeGroup?.members.find(
      (member) => member.userId === activeGroup.currentUserId,
    ) ?? null;

  const scrollToLatest = useCallback(() => {
    const list = messagesRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, []);

  // Open a chat at its latest message, and keep following new ones while the
  // reader is at the end. On phones the chat is hidden (no height) until it is
  // opened, so opening it counts too.
  useLayoutEffect(() => {
    if (!activeGroupId) {
      return;
    }

    if (scrolledGroupIdRef.current !== activeGroupId) {
      scrolledGroupIdRef.current = activeGroupId;
      stickToBottomRef.current = true;
    }

    if (stickToBottomRef.current) {
      scrollToLatest();
    }
  }, [
    activeGroupId,
    messages.length,
    visiblePending.length,
    mobileChatOpen,
    scrollToLatest,
  ]);

  // The box shrinks when a phone keyboard opens or a file list appears: stay at the end.
  useEffect(() => {
    const list = messagesRef.current;
    if (!list || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) {
        scrollToLatest();
      }
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeGroupId, scrollToLatest]);
  const totalAttachmentSize = attachments.reduce(
    (sum, file) => sum + file.size,
    0,
  );

  return (
    <div
      className={`app-page study-groups-page ${mobileChatOpen ? "mobile-chat-open" : ""} ${mobileAboutOpen ? "mobile-about-open" : ""}`}
    >
      {/* Top bar */}
      <div className="page-bar">
        <div>
          <div className="page-heading">Study Groups</div>
          <div className="page-sub">
            Create focused group chats, share one invite code, and study
            together.
          </div>
          <div className="mobile-search-bar">
            <Search aria-hidden="true" />
            <input
              value={groupSearch}
              onChange={(event) => setGroupSearch(event.target.value)}
              placeholder="Search groups..."
              aria-label="Search groups"
            />
          </div>
        </div>
        <div className="bar-actions">
          <button
            type="button"
            onClick={() => {
              setJoinOpen((current) => !current);
              setCreateOpen(false);
            }}
            className="btn"
            aria-label="Join with code"
            title="Join with code"
          >
            <Ticket className="h-4 w-4" />
            Join With Code
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateOpen((current) => !current);
              setJoinOpen(false);
              setMobileChatOpen(false);
              setMobileGroupMenuOpen(false);
              setMobileAboutOpen(false);
            }}
            className="btn btn-primary"
            aria-label="New group"
            title="New group"
          >
            <Plus className="h-4 w-4" />
            New Group
          </button>
        </div>
      </div>

      {createOpen && !mobileChatOpen ? (
        <form onSubmit={handleCreateGroup} className="modal-form">
          <input
            value={createTitle}
            onChange={(event) => setCreateTitle(event.target.value)}
            placeholder="Group title"
          />
          <input
            value={createDescription}
            onChange={(event) => setCreateDescription(event.target.value)}
            placeholder="Short description"
            className="flex-1"
          />
          <button type="submit" disabled={creating} className="btn btn-primary">
            {creating ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setCreateTitle("");
              setCreateDescription("");
              setCreateOpen(false);
            }}
          >
            Cancel
          </button>
        </form>
      ) : null}

      {joinOpen && !mobileChatOpen ? (
        <form onSubmit={handleJoinGroup} className="modal-form">
          <input
            value={inviteCodeInput}
            onChange={(event) =>
              setInviteCodeInput(event.target.value.toUpperCase())
            }
            placeholder="Paste invite code"
          />
          <button type="submit" disabled={joining} className="btn btn-primary">
            {joining ? "Joining..." : "Join Group"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setInviteCodeInput("");
              setJoinOpen(false);
            }}
          >
            Cancel
          </button>
        </form>
      ) : null}

      <div className="groups-body">
        {/* Group list */}
        <div className="group-list-panel">
          <div className="panel-top">
            <span className="panel-title">Your Groups</span>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setGroupPanelSearchOpen((current) => {
                  const nextOpen = !current;
                  if (nextOpen) {
                    window.requestAnimationFrame(() =>
                      groupSearchInputRef.current?.focus(),
                    );
                  } else {
                    setGroupSearch("");
                  }
                  return nextOpen;
                });
              }}
              aria-label="Search groups"
              title="Search groups"
            >
              <Search />
            </button>
          </div>
          {groupPanelSearchOpen ? (
            <div className="group-panel-search">
              <Search aria-hidden="true" />
              <input
                ref={groupSearchInputRef}
                value={groupSearch}
                onChange={(event) => setGroupSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setGroupSearch("");
                    setGroupPanelSearchOpen(false);
                  }
                }}
                placeholder="Search groups..."
                aria-label="Search groups"
              />
            </div>
          ) : null}
          <div className="group-list">
            {/* On phones only the list is on screen; wider, the chat panel beside it shows the loader. */}
            {loading ? (
              <div className="flex h-[55dvh] md:hidden">
                <PageLoader label="Opening your groups" />
              </div>
            ) : null}

            {groupsFailed ? (
              <div className="p-4 text-xs text-center text-[var(--ink-3)]" role="status">
                <p>Still connecting… trying again.</p>
                <button type="button" className="mt-2 underline" onClick={() => void mutateGroups()}>
                  Retry now
                </button>
              </div>
            ) : null}

            {!loading && !groupsFailed && groups.length === 0 ? (
              <div className="p-4 text-xs text-center text-[var(--ink-3)]">
                Start your first study group and invite people with a simple
                code.
              </div>
            ) : null}

            {!loading && groups.length > 0 && filteredGroups.length === 0 ? (
              <div className="p-4 text-xs text-center text-[var(--ink-3)]">
                No groups match your search.
              </div>
            ) : null}

            {filteredGroups.map((group) => {
              const isActive = activeGroup?.id === group.id;
              const lastMessage = group.messages[group.messages.length - 1];
              const readMarkerTime = groupReadMarkers[group.id]
                ? new Date(groupReadMarkers[group.id]).getTime()
                : 0;
              const unreadCount = group.messages.filter(
                (message) =>
                  message.authorId !== group.currentUserId &&
                  new Date(message.createdAt).getTime() > readMarkerTime,
              ).length;
              const showUnreadBadge = unreadCount > 0;

              return (
                <div
                  key={group.id}
                  onClick={() => {
                    setSelectedGroupId(group.id);
                    setGroupReadMarkers((current) => {
                      const nextReadAt = new Date(
                        getLatestVisibleMessageAt(group),
                      ).toISOString();
                      if (current[group.id] === nextReadAt) {
                        return current;
                      }
                      const next = { ...current, [group.id]: nextReadAt };
                      saveGroupReadMarkers(next);
                      return next;
                    });
                    setMobileChatOpen(true);
                    setCreateOpen(false);
                    setJoinOpen(false);
                    setMobileGroupMenuOpen(false);
                    setMobileAboutOpen(false);
                  }}
                  className={`group-item ${isActive ? "active" : ""}`}
                >
                  <PhotoBadge
                    src={group.photoUrl}
                    name={group.title}
                    className="group-avatar"
                  >
                    {isActive ? <span className="online-ring" /> : null}
                  </PhotoBadge>
                  <div className="group-copy">
                    <div className="group-name">{group.title}</div>
                    <div className="group-meta">
                      {lastMessage
                        ? getMessagePreview(lastMessage)
                        : group.description || "No messages yet"}
                    </div>
                  </div>
                  <div className="group-right">
                    <span className="group-time">
                      {lastMessage ? formatTime(lastMessage.createdAt) : "Now"}
                    </span>
                    {showUnreadBadge ? (
                      <span className="group-badge">{unreadCount}</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat */}
        <div className="chat-panel">
          {loading && !activeGroup ? (
            <StudyGroupsContentSkeleton />
          ) : activeGroup ? (
            <>
              <div className="chat-head">
                <button
                  type="button"
                  className="mobile-back-btn"
                  onClick={() => {
                    if (mobileAboutOpen) {
                      setMobileAboutOpen(false);
                      return;
                    }
                    setMobileChatOpen(false);
                    setMobileGroupMenuOpen(false);
                  }}
                  aria-label="Back to study groups"
                >
                  <ArrowLeft />
                </button>
                <button
                  type="button"
                  className="chat-head-info"
                  onClick={() => {
                    setMobileAboutOpen(true);
                    setMobileGroupMenuOpen(false);
                  }}
                  aria-label={`${activeGroup.title}: members and files`}
                >
                  <PhotoBadge
                    src={activeGroup.photoUrl}
                    name={activeGroup.title}
                    className="chat-avatar"
                  >
                    <span className="online-ring" />
                  </PhotoBadge>
                </button>
                <div className="chat-head-left">
                  <button
                    type="button"
                    className="chat-title chat-head-info"
                    onClick={() => {
                      setMobileAboutOpen(true);
                      setMobileGroupMenuOpen(false);
                    }}
                  >
                    {activeGroup.title}
                  </button>
                  <div className="chat-pills">
                    <span className="pill">
                      {activeGroup.privacy === "public" ? <Globe2 /> : <Lock />}
                      {activeGroup.privacy === "public" ? "Public" : "Private"}
                    </span>
                    <span className="pill">
                      {activeGroup.memberCount}{" "}
                      {activeGroup.memberLimit
                        ? `/ ${activeGroup.memberLimit}`
                        : ""}{" "}
                      members
                    </span>
                    <span className="pill">{activeMemberIds.size} active</span>
                  </div>
                </div>
                <div className="chat-head-right">
                  <span className="pill amber">
                    Code {activeGroup.inviteCode}
                  </span>
                  <Link
                    href={`/dashboard/groups/${activeGroup.id}/room`}
                    prefetch
                    onClick={(event) =>
                      handleOpenStudyRoom(
                        event,
                        `/dashboard/groups/${activeGroup.id}/room`,
                      )
                    }
                    className="btn btn-primary"
                    aria-label="Open Study Room"
                    title="Open Study Room"
                  >
                    <Play />
                    Open Study Room
                  </Link>
                  <button
                    type="button"
                    className="mobile-more-btn"
                    aria-label="More group options"
                    aria-expanded={mobileGroupMenuOpen}
                    onClick={() =>
                      setMobileGroupMenuOpen((current) => !current)
                    }
                  >
                    <MoreVertical />
                  </button>
                  {mobileGroupMenuOpen ? (
                    <div className="mobile-group-menu">
                      <button
                        type="button"
                        onClick={() => {
                          setMobileAboutOpen(true);
                          setMobileGroupMenuOpen(false);
                        }}
                      >
                        Members &amp; files
                      </button>
                      <Link
                        href={`/dashboard/groups/${activeGroup.id}/room`}
                        prefetch
                        onClick={(event) =>
                          handleOpenStudyRoom(
                            event,
                            `/dashboard/groups/${activeGroup.id}/room`,
                          )
                        }
                      >
                        Open Study Room
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mobile-code-strip">
                <span>Invite code</span>
                <strong>{activeGroup.inviteCode}</strong>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard?.writeText(
                        activeGroup.inviteCode,
                      );
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch (err) {
                      console.error("Copy failed:", err);
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              <div
                className="messages"
                ref={messagesRef}
                onScroll={(event) => {
                  stickToBottomRef.current = isNearBottom(event.currentTarget);
                }}
              >
                {messages.length === 0 && visiblePending.length === 0 ? (
                  <div className="text-xs text-center text-[var(--ink-3)] mt-10">
                    No messages yet. Break the ice with the first study question
                    or resource.
                  </div>
                ) : null}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`msg ${message.authorId === activeGroup.currentUserId ? "mine" : "theirs"}`}
                  >
                    <PhotoBadge
                      src={message.authorAvatarUrl}
                      name={message.authorName}
                      username={message.authorUsername}
                      className={`avatar ${message.authorId === activeGroup.currentUserId ? "me" : ""}`}
                    />
                    <div className="msg-body">
                      <div className="msg-meta">
                        <span className="msg-name">
                          {message.authorName ||
                            message.authorUsername ||
                            "Study member"}
                        </span>
                        <span className="msg-time">
                          {formatTime(message.createdAt)}
                        </span>
                      </div>
                      {message.content ? (
                        <div className="msg-text">{message.content}</div>
                      ) : null}

                      {message.attachments.map((attachment) => (
                        <GroupFileCard key={attachment.id} file={attachment} />
                      ))}
                    </div>
                  </div>
                ))}

                {visiblePending.map((pending) => (
                  <div
                    key={pending.clientMessageId}
                    className={`msg mine msg-pending ${pending.state === "failed" ? "msg-failed" : ""}`}
                  >
                    <PhotoBadge
                      src={currentMember?.avatarUrl}
                      name={currentMember?.name}
                      username={currentMember?.username}
                      className="avatar me"
                    />
                    <div className="msg-body">
                      <div className="msg-meta">
                        <span className="msg-name">
                          {currentMember?.name ||
                            currentMember?.username ||
                            "You"}
                        </span>
                        <span className="msg-time" role="status">
                          {pending.state === "failed" ? "Not sent" : "Sending…"}
                        </span>
                      </div>
                      {pending.content.trim() ? (
                        <div className="msg-text">{pending.content}</div>
                      ) : null}
                      {pending.files.map((file, index) => (
                        <div
                          key={`${file.name}-${file.size}-${index}`}
                          className="file-card"
                        >
                          <div className="file-open">
                            <div className="file-icon">
                              <Paperclip />
                            </div>
                            <div className="file-info">
                              <div className="file-name">{file.name}</div>
                              <div className="file-size">
                                {formatFileSize(file.size)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {pending.state === "failed" ? (
                        <div className="msg-retry">
                          <button
                            type="button"
                            onClick={() => void deliverPendingMessage(pending)}
                          >
                            <RotateCw aria-hidden="true" /> Retry
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              discardPendingMessage(pending.clientMessageId)
                            }
                          >
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <div className="composer">
                {attachments.length > 0 ? (
                  <div className="attachments-preview">
                    <div className="attachments-preview-head">
                      <span>
                        {attachments.length} file
                        {attachments.length === 1 ? "" : "s"} attached
                      </span>
                      <span>
                        {formatFileSize(totalAttachmentSize)} / 150 MB
                      </span>
                    </div>
                    {attachments.map((attachment, index) => (
                      <div
                        key={`${attachment.name}-${attachment.size}-${index}`}
                        className="attachment-item"
                      >
                        <div>
                          <div className="file-name text-[var(--ink)]">
                            {attachment.name}
                          </div>
                          <div className="file-size text-[var(--ink-3)] uppercase tracking-[0.08em]">
                            {formatFileSize(attachment.size)}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="remove-attachment-btn"
                          onClick={() => removeAttachmentAt(index)}
                        >
                          <X /> Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <form className="composer-wrap" onSubmit={handleSendMessage}>
                  <button
                    type="button"
                    className="attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach file"
                  >
                    <Paperclip />
                  </button>
                  <textarea
                    value={messageInput}
                    onChange={(event) => setMessageInput(event.target.value)}
                    className="composer-input"
                    placeholder="Type a message"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e as any);
                      }
                    }}
                  />
                  <button type="submit" className="send-btn">
                    <Send /> Send
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleAttachmentChange}
                  />
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <MessageCircle className="w-10 h-10 text-[var(--ink-3)] mb-4" />
              <div className="text-[24px] font-[600] text-[var(--ink)] mb-2">
                No active study group
              </div>
              <div className="text-[13px] text-[var(--ink-2)]">
                Create a group or join one with an invite code to start the
                shared chat.
              </div>
            </div>
          )}
        </div>

        {/* Members */}
        <div className="members-panel">
          <div className="mobile-about-head">
            <span>Group info</span>
            <button type="button" onClick={() => setMobileAboutOpen(false)}>
              <X /> Close
            </button>
          </div>
          <div className="members-panel-scroll">
            {loading && !activeGroup ? (
              <StudyGroupsMembersSkeleton />
            ) : activeGroup ? (
              <>
                <div className="info-section group-hero">
                  <PhotoBadge
                    src={activeGroup.photoUrl}
                    name={activeGroup.title}
                    className="group-hero-photo"
                  />
                  <div className="group-hero-title">{activeGroup.title}</div>
                  <div className="group-hero-sub">
                    {activeGroup.memberCount}{" "}
                    {activeGroup.memberCount === 1 ? "member" : "members"}
                  </div>
                </div>

                <div className="info-tabs" role="tablist" aria-label="Group info">
                  {(
                    [
                      { id: "members", label: "Members", count: activeGroup.memberCount },
                      { id: "files", label: "Files", count: sharedFiles?.length },
                      ...(activeGroup.canManage ? [{ id: "settings", label: "Settings" }] : []),
                    ] as Array<{ id: "members" | "files" | "settings"; label: string; count?: number }>
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`group-tab-${tab.id}`}
                      aria-selected={shownTab === tab.id}
                      aria-controls="group-tab-panel"
                      className={`info-tab ${shownTab === tab.id ? "active" : ""}`}
                      onClick={() => setInfoTab(tab.id)}
                    >
                      {tab.label}
                      {tab.count !== undefined ? <span className="info-tab-count">{tab.count}</span> : null}
                      {tab.id === "members" && activeGroup.canManage && activeGroup.pendingJoinRequests.length > 0 ? (
                        <span className="info-tab-dot" aria-label={`${activeGroup.pendingJoinRequestCount} pending requests`} />
                      ) : null}
                    </button>
                  ))}
                </div>

                <div className="info-tab-panel" id="group-tab-panel" role="tabpanel" aria-labelledby={`group-tab-${shownTab}`}>
                {shownTab === "members" ? (
                  <>
                <div className="info-section">
                  <div className="info-label">Invite Code</div>
                  <div className="code-box">
                    <span className="code-val">{activeGroup.inviteCode}</span>
                    <button
                      className="copy-btn"
                      onClick={async () => {
                        try {
                          await navigator.clipboard?.writeText(
                            activeGroup.inviteCode,
                          );
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        } catch (err) {
                          console.error("Copy failed:", err);
                        }
                      }}
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="code-hint">
                    {activeGroup.privacy === "public"
                      ? "Share so someone can join instantly."
                      : "Share so someone can request to join."}
                  </p>
                </div>

                {activeGroup.canManage &&
                activeGroup.pendingJoinRequests.length > 0 ? (
                  <div className="info-section">
                    <div className="info-label flex justify-between">
                      <span>Pending requests</span>
                      <span>{activeGroup.pendingJoinRequestCount}</span>
                    </div>
                    {activeGroup.pendingJoinRequests.map((request) => (
                      <div
                        key={request.id}
                        className="mb-2 p-3 bg-[var(--raised)] border border-[var(--border)] rounded-[var(--r-sm)]"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <PhotoBadge
                            src={request.avatarUrl}
                            name={request.name}
                            username={request.username}
                            className="m-av owner"
                          />
                          <div className="m-info">
                            <div className="m-name">
                              {request.name ||
                                request.username ||
                                "Study member"}
                            </div>
                            <div className="m-role">
                              Requested {formatTime(request.createdAt)}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={actingOnRequestId === request.id}
                            onClick={() =>
                              void handleManageJoinRequest(
                                request.id,
                                "approve",
                              )
                            }
                            className="btn btn-primary flex-1"
                          >
                            <Check /> Approve
                          </button>
                          <button
                            type="button"
                            disabled={actingOnRequestId === request.id}
                            onClick={() =>
                              void handleManageJoinRequest(request.id, "reject")
                            }
                            className="btn flex-1 justify-center"
                          >
                            <X /> Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="info-section">
                  <div className="info-label flex justify-between">
                    <span>Members</span>
                    <span>{activeGroup.memberCount}</span>
                  </div>
                  {activeGroup.members.map((member) => {
                    const isActive = activeMemberIds.has(member.userId);

                    return (
                      <div key={member.userId} className="member-row">
                        <PhotoBadge
                          src={member.avatarUrl}
                          name={member.name}
                          username={member.username}
                          className={`m-av ${member.role === "owner" ? "owner" : ""}`}
                        />
                        <div className="m-info">
                          <div className="m-name">
                            {member.name || member.username || "Study member"}
                            {member.userId === activeGroup.currentUserId
                              ? " (you)"
                              : ""}
                          </div>
                          <div className="m-role m-role-status">
                            {member.role === "owner" ? "Owner" : "Member"}
                            <span
                              className={`member-status-dot ${isActive ? "active" : "offline"}`}
                            />
                          </div>
                        </div>
                        {activeGroup.canManage && member.role !== "owner" ? (
                          <button
                            type="button"
                            disabled={removingMemberId === member.userId}
                            onClick={() =>
                              void handleRemoveMember(member.userId)
                            }
                            className="remove-btn"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    );
                  })}

                </div>
                  </>
                ) : null}

                {shownTab === "files" ? (
                <div className="info-section shared-files-section">
                  <div className="info-label flex justify-between">
                    <span>Shared files</span>
                    {sharedFiles ? <span>{sharedFiles.length}</span> : null}
                  </div>
                  <SharedFilesList
                    files={sharedFiles}
                    loading={sharedFilesLoading}
                    failed={Boolean(sharedFilesError)}
                    onRetry={() => void mutateSharedFiles()}
                  />
                </div>
                ) : null}

                {shownTab === "settings" ? (
                  <>
                    <div className="info-section group-hero-actions">
                      <button
                        type="button"
                        className="btn"
                        disabled={savingPhoto}
                        onClick={() => photoInputRef.current?.click()}
                      >
                        <Camera />
                        {savingPhoto
                          ? "Saving…"
                          : activeGroup.photoUrl
                            ? "Change photo"
                            : "Add group photo"}
                      </button>
                      {activeGroup.photoUrl ? (
                        <button
                          type="button"
                          className="btn"
                          disabled={savingPhoto}
                          onClick={() => void handleRemoveGroupPhoto()}
                        >
                          Remove
                        </button>
                      ) : null}
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={handleGroupPhotoChange}
                      />
                    </div>

                <div className="info-section">
                  <div className="info-label">Group details</div>
                        <form
                          onSubmit={handleUpdateGroup}
                          className="settings-form"
                        >
                          <input
                            value={editTitle}
                            onChange={(event) =>
                              setEditTitle(event.target.value)
                            }
                            placeholder="Group name"
                          />
                          <textarea
                            value={editDescription}
                            onChange={(event) =>
                              setEditDescription(event.target.value)
                            }
                            rows={3}
                            placeholder="Group description"
                          />
                          <div className="flex gap-2">
                            <select
                              value={editPrivacy}
                              onChange={(event) =>
                                setEditPrivacy(
                                  event.target.value as "public" | "private",
                                )
                              }
                            >
                              <option value="public">Public group</option>
                              <option value="private">Private group</option>
                            </select>
                            <input
                              value={editMemberLimit}
                              onChange={(event) =>
                                setEditMemberLimit(
                                  event.target.value.replace(/[^\d]/g, ""),
                                )
                              }
                              placeholder="Limit"
                              className="w-[80px]"
                            />
                          </div>
                          <label className="flex items-center gap-2 text-[12px] text-[var(--ink-2)]">
                            <input
                              type="checkbox"
                              checked={refreshInviteCode}
                              onChange={(event) =>
                                setRefreshInviteCode(event.target.checked)
                              }
                            />
                            Refresh invite code
                          </label>
                          <button
                            type="submit"
                            disabled={savingGroup}
                            className="btn btn-primary justify-center w-full"
                          >
                            {savingGroup ? "Saving..." : "Save changes"}
                          </button>
                        </form>
                </div>
                  </>
                ) : null}
                </div>
              </>
            ) : (
              <div className="text-xs text-center text-[var(--ink-3)]">
                Group details will appear here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
