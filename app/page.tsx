"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useChat } from "@ai-sdk/react";
import { ArrowUp, Loader2, Plus, Square } from "lucide-react";
import { MessageWall } from "@/components/messages/message-wall";
import { ChatHeader } from "@/app/parts/chat-header";
import { ChatHeaderBlock } from "@/app/parts/chat-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UIMessage } from "ai";
import { useEffect, useState, useRef, ChangeEvent } from "react";
import {
  AI_NAME,
  CLEAR_CHAT_TEXT,
  OWNER_NAME,
} from "@/config";
import Image from "next/image";
import Link from "next/link";

const formSchema = z.object({
  message: z
    .string()
    .min(1, "Message cannot be empty.")
    .max(2000, "Message must be at most 2000 characters."),
});

const STORAGE_KEY = "chat-messages";

// 🔵 Mode categories for dropdowns
const MODE_CATEGORIES = [
  {
    id: "guesstimates",
    title: "Guesstimates",
    description: "Practice interview-style market sizing & estimation.",
    options: [
      {
        label: "New generic guesstimate",
        prompt:
          "Let's practice a guesstimate. Give me a fresh interview-style guesstimate question.",
      },
     
      {
  label: "Industry-specific guesstimate",
  prompt:
    "Let's do an industry-specific guesstimate. First, ask me which industry I want to practice (for example: FMCG, telecom, e-commerce, banking, healthcare, aviation, etc.). If I say I have no preference, or I say 'anything is fine', then you should pick a reasonable industry yourself and give me a consulting-style guesstimate question in that industry. Run it like a real interview.",
},

      {
        label: "Help me structure a guesstimate",
        prompt:
          "I will share a guesstimate question. Help me build a clear, MECE structure for it.",
      },
      {
        label: "Review my guesstimate attempt",
        prompt:
          "I will paste my guesstimate solution. Please review it and give feedback plus an alternative approach.",
      },
    ],
  },
  {
    id: "case-prep",
    title: "Case Prep",
    description: "Simulate cases like a real consulting interviewer.",
    options: [
      {
        label: "Profitability case",
        prompt:
          "Let's do a profitability case. Act like an interviewer and give only limited information at each step.",
      },
      {
        label: "Market entry case",
        prompt:
          "Give me a market entry case in an India context and run it like a real case interview.",
      },
      {
        label: "Revise case frameworks",
        prompt:
          "Help me revise key case frameworks: profitability, market entry, growth, and capacity/operations.",
      },
      {
        label: "Review my case structure",
        prompt:
          "I will paste my case structure. Please review it and suggest improvements like a consulting interviewer.",
      },
    ],
  },
  {
    id: "company-prep",
    title: "Company Prep",
    description: "Research firms & structure ‘Why this firm / why you’.",
    options: [
      {
        label: "Full company research brief",
        prompt:
          "Help me prepare for a company. Ask me the company name, role, and my background, then give a structured research brief (about the firm, business lines, values, latest news) and answer skeletons.",
      },
      {
        label: "Why this firm – structure",
        prompt:
          "Help me structure a strong ‘Why this firm’ answer using company information and my profile.",
      },
      {
        label: "Review my ‘Why this firm’ answer",
        prompt:
          "I will paste my current answer for ‘Why this firm’. Please review it, point out gaps, and suggest a sharper version.",
      },
      {
        label: "Questions to ask the interviewer",
        prompt:
          "Based on the company and role I share, suggest 5–7 smart, non-generic questions I can ask the interviewer.",
      },
    ],
  },
];

type StorageData = {
  messages: UIMessage[];
  durations: Record<string, number>;
};

const loadMessagesFromStorage = (): {
  messages: UIMessage[];
  durations: Record<string, number>;
} => {
  if (typeof window === "undefined") return { messages: [], durations: {} };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { messages: [], durations: {} };

    const parsed = JSON.parse(stored);
    return {
      messages: parsed.messages || [],
      durations: parsed.durations || {},
    };
  } catch (error) {
    console.error("Failed to load messages from localStorage:", error);
    return { messages: [], durations: {} };
  }
};

const saveMessagesToStorage = (
  messages: UIMessage[],
  durations: Record<string, number>
) => {
  if (typeof window === "undefined") return;
  try {
    const data: StorageData = { messages, durations };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save messages to localStorage:", error);
  }
};

export default function Chat() {
  const [isClient, setIsClient] = useState(false);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [openMode, setOpenMode] = useState<string | null>(null);
  
    const [resumeSummary, setResumeSummary] = useState<string | null>(null);
  const [resumeStatus, setResumeStatus] = useState<
    "idle" | "uploading" | "ready" | "error"
  >("idle");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleResumeButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleResumeChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setResumeStatus("uploading");

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload-resume", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      const data = await res.json();
      setResumeSummary(data.summary || null);
      setResumeStatus("ready");
      toast.success("Resume uploaded and summarized!");
    } catch (err) {
      console.error(err);
      setResumeStatus("error");
      toast.error("Could not process resume. Please try again.");
    } finally {
      // allow re-upload of the same file
      if (event.target) {
        event.target.value = "";
      }
    }
  };

  const stored =
    typeof window !== "undefined"
      ? loadMessagesFromStorage()
      : { messages: [], durations: {} };
  const [initialMessages] = useState<UIMessage[]>(stored.messages);

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    messages: initialMessages,
  });

  useEffect(() => {
    setIsClient(true);
    setDurations(stored.durations);
    setMessages(stored.messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isClient) {
      saveMessagesToStorage(messages, durations);
    }
  }, [durations, messages, isClient]);

  const handleDurationChange = (key: string, duration: number) => {
    setDurations((prevDurations) => {
      const newDurations = { ...prevDurations };
      newDurations[key] = duration;
      return newDurations;
    });
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      message: "",
    },
  });

  function onSubmit(data: z.infer<typeof formSchema>) {
    sendMessage({ text: data.message });
    form.reset();
  }

  function clearChat() {
    const newMessages: UIMessage[] = [];
    const newDurations = {};
    setMessages(newMessages);
    setDurations(newDurations);
    saveMessagesToStorage(newMessages, newDurations);
    toast.success("Chat cleared");
  }

  return (
    <div className="flex h-screen items-center justify-center font-sans dark:bg-black">
      <main className="w-full dark:bg-black h-screen relative">
        <div className="fixed top-0 left-0 right-0 z-50 bg-linear-to-b from-background via-background/50 to-transparent dark:bg-black overflow-visible pb-16">
          <div className="relative overflow-visible">
            <ChatHeader>
              <ChatHeaderBlock />
              <ChatHeaderBlock className="justify-center items-center">
                <Avatar className="size-8 ring-1 ring-primary">
                  <AvatarImage src="/consulto-logo-1.png" />
                  <AvatarFallback>
                    <Image src="/consulto-logo-1.png" alt="Logo" width={36} height={36} />
                  </AvatarFallback>
                </Avatar>
                <p className="tracking-tight">Chat with {AI_NAME}</p>
              </ChatHeaderBlock>
              <ChatHeaderBlock className="justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  onClick={clearChat}
                >
                  <Plus className="size-4" />
                  {CLEAR_CHAT_TEXT}
                </Button>
              </ChatHeaderBlock>
            </ChatHeader>
          </div>
        </div>

        <div className="h-screen overflow-y-auto px-5 py-4 w-full pt-[88px] pb-[150px]">
          <div className="flex flex-col items-center justify-end min-h-full">
                {isClient && (

              <div className="max-w-3xl w-full mb-4">

                <p className="text-sm text-muted-foreground mb-2">
  Hi! I'm {AI_NAME}, your personal consulting interview prep partner.
</p>

                <p className="text-xs text-muted-foreground mb-2">
                  You can type anything in the box below, or use these shortcuts
                  to get started:
                </p>
                <div className="space-y-3">
                  {MODE_CATEGORIES.map((mode) => (
                    <div
                      key={mode.id}
                      className="rounded-xl border border-blue-300 bg-blue-50 shadow-sm"
                    >
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                        onClick={() =>
                          setOpenMode((prev) =>
                            prev === mode.id ? null : mode.id
                          )
                        }
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-blue-900">
                            {mode.title}
                          </span>
                          <span className="text-[11px] text-blue-800">
                            {mode.description}
                          </span>
                        </div>
                        <span className="text-xs text-blue-800">
                          {openMode === mode.id ? "▲" : "▼"}
                        </span>
                      </button>

                      {openMode === mode.id && (
                        <div className="flex flex-wrap gap-2 border-t border-blue-200 px-3 pb-3 pt-2">
                          {mode.options.map((opt) => (
                            <Button
                              key={opt.label}
                              type="button"
                              variant="outline"
                              className="rounded-full border-blue-500 text-xs text-blue-700 hover:bg-blue-100"
                              onClick={() => {
                                form.setValue("message", opt.prompt);
                                form.handleSubmit(onSubmit)();
                              }}
                            >
                              {opt.label}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isClient ? (
              <>
                <MessageWall
                  messages={messages}
                  status={status}
                  durations={durations}
                  onDurationChange={handleDurationChange}
                />
                {status === "submitted" && (
                  <div className="flex justify-start max-w-3xl w-full">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </>
            ) : (
              <div className="flex justify-center max-w-2xl w-full">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-50 bg-linear-to-t from-background via-background/50 to-transparent dark:bg-black overflow-visible pt-13">
          <div className="w-full px-5 pt-5 pb-1 items-center flex justify-center relative overflow-visible">
            <div className="message-fade-overlay" />
            <div className="max-w-3xl w-full">

   {/* hidden file input */}
   <input
     ref={fileInputRef}
     type="file"
     accept=".pdf,.doc,.docx"
     className="hidden"
     onChange={handleResumeChange}
   />
              
              <form id="chat-form" onSubmit={form.handleSubmit(onSubmit)}>
                <FieldGroup>
                  <Controller
                    name="message"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel
                          htmlFor="chat-form-message"
                          className="sr-only"
                        >
                          Message
                        </FieldLabel>
                        <div className="relative h-13">
                          <Input
                            {...field}
                            id="chat-form-message"
                            className="h-15 pr-15 pl-5 bg-card rounded-[20px]"
                            placeholder="Type your message here..."
                            disabled={status === "streaming"}
                            aria-invalid={fieldState.invalid}
                            autoComplete="off"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                form.handleSubmit(onSubmit)();
                              }
                            }}
                          />
                          {(status == "ready" || status == "error") && (
                            <Button
                              className="absolute right-3 top-3 rounded-full"
                              type="submit"
                              disabled={!field.value.trim()}
                              size="icon"
                            >
                              <ArrowUp className="size-4" />
                            </Button>
                          )}
                          {(status == "streaming" || status == "submitted") && (
                            <Button
                              className="absolute right-2 top-2 rounded-full"
                              size="icon"
                              onClick={() => {
                                stop();
                              }}
                            >
                              <Square className="size-4" />
                            </Button>
                          )}
                        </div>
                      </Field>
                    )}
                  />
                </FieldGroup>
              </form>
            </div>
          </div>
          <div className="w-full px-5 py-3 items-center flex justify-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} {OWNER_NAME}
            &nbsp;
            <Link href="/terms" className="underline">
              Terms of Use
            </Link>
            &nbsp;Powered by&nbsp;
            <Link href="https://ringel.ai/" className="underline">
              Ringel.AI
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
