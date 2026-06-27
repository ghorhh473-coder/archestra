"use client";

import { useChat } from "@ai-sdk/react";
import { ArrowLeft, Bot, Send, Sparkles, User, AlertCircle, Key } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useInternalAgents } from "@/lib/agent.query";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFetchUserTokenValue } from "@/lib/user-token.query";

function A2AChatContent() {
  const searchParams = useSearchParams();
  const initialAgentId = searchParams.get("agentId");

  const { data: internalAgents } = useInternalAgents({ enabled: true });
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(initialAgentId);
  const [tokenValue, setTokenValue] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const fetchTokenMutation = useFetchUserTokenValue();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const effectiveAgentId = selectedAgentId ?? internalAgents?.[0]?.id ?? null;
  const selectedAgent = internalAgents?.find((a) => a.id === effectiveAgentId);

  // Fetch token value on mount
  useEffect(() => {
    fetchTokenMutation.mutate(undefined, {
      onSuccess: (data) => {
        if (data?.value) {
          setTokenValue(data.value);
        } else {
          setTokenError("No token found. Please generate a token in Settings.");
        }
      },
      onError: (err) => {
        setTokenError(err instanceof Error ? err.message : String(err));
      },
    });
  }, []);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error: chatError } = useChat({
    api: effectiveAgentId ? `/api/a2a-v2/${effectiveAgentId}/chat` : "",
    headers: tokenValue
      ? {
          Authorization: `Bearer ${tokenValue}`,
        }
      : {},
  });

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/agents/triggers/a2a" passHref>
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold font-sans tracking-tight bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent flex items-center gap-2">
            A2A Stream Chat Console <Sparkles className="h-6 w-6 text-violet-500 animate-pulse" />
          </h1>
          <p className="text-muted-foreground">
            Experimental UI to interact with internal agents over A2A streaming protocols.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Settings Panel */}
        <Card className="md:col-span-1 shadow-md bg-card/60 backdrop-blur-sm border-muted/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Select Agent</Label>
              <Select
                value={effectiveAgentId ?? ""}
                onValueChange={setSelectedAgentId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an agent">
                    {selectedAgent && (
                      <div className="flex items-center gap-2 min-w-0">
                        <Bot className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate text-xs">{selectedAgent.name}</span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {internalAgents?.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Bot className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate text-xs">{agent.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold flex items-center gap-1">
                <Key className="h-3 w-3" /> A2A Auth Token
              </Label>
              {fetchTokenMutation.isPending ? (
                <div className="h-8 rounded bg-muted animate-pulse" />
              ) : tokenValue ? (
                <div className="p-2 bg-muted/50 rounded border border-muted text-[10px] font-mono break-all line-clamp-2 select-all">
                  Bearer {tokenValue.substring(0, 8)}...
                </div>
              ) : (
                <div className="text-[10px] text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {tokenError || "No Token Loaded"}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Chat Console */}
        <Card className="md:col-span-3 h-[600px] flex flex-col shadow-xl bg-card/60 backdrop-blur-sm border-muted/50 overflow-hidden">
          <CardHeader className="border-b border-muted/50 pb-3 flex flex-row items-center gap-3">
            <Bot className="h-6 w-6 text-primary shrink-0" />
            <div>
              <CardTitle className="text-base font-semibold">{selectedAgent?.name || "Agent Console"}</CardTitle>
              <CardDescription className="text-xs line-clamp-1">{selectedAgent?.description || "Select an agent to begin streaming conversation."}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-6">
                <Bot className="h-12 w-12 text-muted/50 mb-2 animate-bounce" />
                <p className="font-semibold text-sm">Start a conversation with {selectedAgent?.name || "Agent"}</p>
                <p className="text-xs max-w-xs mt-1 text-muted-foreground/80">
                  Messages are sent using the A2A Gateway and response streams are rendered in real-time.
                </p>
              </div>
            ) : (
              messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div
                    key={message.id}
                    className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                  >
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 border ${
                        isUser
                          ? "bg-primary border-primary text-primary-foreground shadow-sm"
                          : "bg-muted/80 border-muted-foreground/20 text-foreground"
                      }`}
                    >
                      {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm transition-all duration-200 ${
                        isUser
                          ? "bg-primary text-primary-foreground rounded-tr-none hover:shadow"
                          : "bg-muted/40 hover:bg-muted/50 rounded-tl-none border border-muted/30"
                      }`}
                    >
                      <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
                    </div>
                  </div>
                );
              })
            )}

            {isLoading && (
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-muted/85 border border-muted-foreground/20 flex items-center justify-center shrink-0 animate-pulse">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="max-w-[75%] bg-muted/30 rounded-2xl rounded-tl-none px-4 py-2.5 border border-muted/20 animate-pulse flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce delay-0" />
                    <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce delay-150" />
                    <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce delay-300" />
                  </div>
                  Thinking...
                </div>
              </div>
            )}

            {chatError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Error streaming chat: {chatError.message}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </CardContent>
          <CardFooter className="border-t border-muted/50 p-3 bg-muted/20">
            <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
              <Input
                placeholder={`Message ${selectedAgent?.name || "agent"}...`}
                value={input}
                onChange={handleInputChange}
                className="flex-1 bg-background/80"
                disabled={isLoading || !effectiveAgentId}
              />
              <Button type="submit" size="icon" disabled={isLoading || !input.trim() || !effectiveAgentId}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default function A2AChatPage() {
  return (
    <Suspense fallback={<div>Loading chat console...</div>}>
      <A2AChatContent />
    </Suspense>
  );
}
