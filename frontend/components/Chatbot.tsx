import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Send, X, Sparkles, Check, Trash2,
  Plus, Edit, List, Loader2, AlertTriangle
} from 'lucide-react';
import { authClient } from '../lib/auth-client';
import { secureFetch } from '../lib/api';
import { AuthUser, ChatMessage, ToolCall, ChatResponse, ConversationSummary } from '../types';
import { deriveLatestAgentAction, describeToolCall, publishAgentActivity } from '../lib/agent-activity';

interface ChatbotProps {
  onTaskMutation: () => void;
  /** Controlled open state, so a dashboard quick action can open the drawer. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function Chatbot({ onTaskMutation, open, onOpenChange }: ChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [toolLogs, setToolLogs] = useState<Record<string, ToolCall[]>>({});
  // Issue #13: a saved conversation was reachable only from this browser's
  // localStorage. These conversations are fetched from the server, so a thread
  // started on another device is equally visible here.
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [showConversations, setShowConversations] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Initialize user session and load persisted history
  useEffect(() => {
    const initChat = async () => {
      const session = await authClient.getSession();
      if (session?.data?.user) {
        const currentUser = session.data.user;
        setUser(currentUser);

        // Load persisted conversation details from localStorage
        const storedConvId = localStorage.getItem(`evo_conv_id_${currentUser.id}`);
        const storedMessages = localStorage.getItem(`evo_chat_history_${currentUser.id}`);
        const storedToolLogs = localStorage.getItem(`evo_tool_logs_${currentUser.id}`);

        if (storedConvId) setConversationId(storedConvId);
        const parsedMessages: ChatMessage[] = storedMessages ? JSON.parse(storedMessages) : [];
        const parsedToolLogs: Record<string, ToolCall[]> = storedToolLogs ? JSON.parse(storedToolLogs) : {};
        if (storedMessages) setMessages(parsedMessages);
        if (storedToolLogs) setToolLogs(parsedToolLogs);

        // The restored conversation is the real one from this browser session —
        // publish its latest agent turn so the dashboard panel reflects it.
        publishAgentActivity(deriveLatestAgentAction(parsedMessages, parsedToolLogs));
      }
    };
    initChat();
  }, []);

  // 2. Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // 3a. Conversation switcher (issue #13)
  const loadConversations = async () => {
    if (!user) return;
    setLoadingConversations(true);
    try {
      const res = await secureFetch(`/api/${user.id}/conversations`);
      if (res.ok) {
        const data: { conversations: ConversationSummary[] } = await res.json();
        setConversations(data.conversations);
      }
    } catch (err) {
      console.error('Could not load conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  };

  const toggleConversations = () => {
    const next = !showConversations;
    setShowConversations(next);
    // Fetch on open rather than on every render. The list changes when a turn
    // happens, so refreshing it each time the panel appears is enough.
    if (next) void loadConversations();
  };

  // Open a saved conversation: load its history from the server rather than
  // assuming localStorage holds it. Without this, switching to a thread
  // started elsewhere would show an empty panel that silently appends to the
  // wrong conversation's id.
  const openConversation = async (id: string) => {
    if (!user) return;
    setShowConversations(false);
    try {
      const res = await secureFetch(`/api/${user.id}/conversations/${id}/messages`);
      if (!res.ok) {
        // Gone on the server — our id is stale. Drop it so the next message
        // starts clean rather than repeating a 404.
        setConversationId(null);
        setMessages([]);
        setToolLogs({});
        localStorage.removeItem(`evo_conv_id_${user.id}`);
        return;
      }
      const data: { conversation_id: string; messages: ChatMessage[] } = await res.json();
      setConversationId(data.conversation_id);
      setMessages(data.messages);
      setToolLogs({});
      localStorage.setItem(`evo_conv_id_${user.id}`, data.conversation_id);
      localStorage.setItem(`evo_chat_history_${user.id}`, JSON.stringify(data.messages));
      localStorage.removeItem(`evo_tool_logs_${user.id}`);
      publishAgentActivity(deriveLatestAgentAction(data.messages, {}));
    } catch (err) {
      console.error('Could not open conversation:', err);
    }
  };

  // 3. Clear Chat Session
  const clearChat = () => {
    if (!user) return;
    setMessages([]);
    setConversationId(null);
    setToolLogs({});
    setShowConversations(false);
    localStorage.removeItem(`evo_conv_id_${user.id}`);
    localStorage.removeItem(`evo_chat_history_${user.id}`);
    localStorage.removeItem(`evo_tool_logs_${user.id}`);
    publishAgentActivity(null);
  };

  // 4. Send Message to FastAPI Agent
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !user || isLoading) return;

    const userText = inputValue.trim();
    setInputValue('');
    setIsLoading(true);

    // Create user message object
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText,
      created_at: new Date().toISOString()
    };

    // Update state & persist locally
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    localStorage.setItem(`evo_chat_history_${user.id}`, JSON.stringify(updatedMessages));

    try {
      const res = await secureFetch(`/api/${user.id}/chat`, {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: conversationId || undefined,
          message: userText
        })
      });

      if (res.ok) {
        const data: ChatResponse = await res.json();

        // Set new conversation ID if it was created
        if (data.conversation_id) {
          setConversationId(data.conversation_id);
          localStorage.setItem(`evo_conv_id_${user.id}`, data.conversation_id);
        }

        // Create assistant message object
        const assistantMsgId = `assistant-${Date.now()}`;
        // Issue #4: the status code no longer distinguishes a failed turn from
        // a successful one, so the outcome has to be carried on the message.
        // Without it a `partial` turn — a task created, one action failed —
        // renders exactly like a clean success, and the user has no way to
        // know something did not happen.
        const failedTools = data.tool_calls
          .filter((c) => c.ok === false)
          .map((c) => c.tool);
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: data.response,
          created_at: new Date().toISOString(),
          // `completed` is the common case and design.md asks for silent
          // success, so it is left off rather than stored and ignored.
          ...(data.outcome && data.outcome !== 'completed'
            ? { outcome: data.outcome, failedTools }
            : {}),
        };

        // Record tools executed
        const newToolLogs = { ...toolLogs };
        if (data.tool_calls && data.tool_calls.length > 0) {
          newToolLogs[assistantMsgId] = data.tool_calls;
          setToolLogs(newToolLogs);
          localStorage.setItem(`evo_tool_logs_${user.id}`, JSON.stringify(newToolLogs));

          // Trigger dynamic list reload on task mutation!
          setTimeout(() => {
            onTaskMutation();
          }, 400);
        }

        // Save complete dialogue turn
        const finalMessages = [...updatedMessages, assistantMsg];
        setMessages(finalMessages);
        localStorage.setItem(`evo_chat_history_${user.id}`, JSON.stringify(finalMessages));

        // The turn that just happened is the new "latest agent action".
        publishAgentActivity(deriveLatestAgentAction(finalMessages, newToolLogs));

      } else {
        // Carry the status so the catch can tell *why* it failed.
        // `secureFetch` returns the Response rather than throwing, so this is
        // the only place the status is in scope.
        const failure = new Error(`Chat request failed with ${res.status}`) as Error & { status?: number };
        failure.status = res.status;
        throw failure;
      }
    } catch (err: unknown) {
      console.error('Chat error:', err);

      // A 404 means our stored conversation id no longer exists. Since #5 a
      // request with no id starts a *new* conversation rather than silently
      // resuming the latest one, so the server no longer heals a stale id on
      // our behalf — and reporting it as a network or API-key problem, which
      // is what the generic message below does, would send the user chasing
      // the wrong thing.
      const status = (err as { status?: number } | null)?.status;
      const isStaleConversation = status === 404;
      if (isStaleConversation) {
        setConversationId(null);
        localStorage.removeItem(`evo_conv_id_${user.id}`);
      }

      // Append a local error message
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: isStaleConversation
          ? "That conversation is no longer available, so I started fresh. Ask me again and we'll carry on from here."
          : "Sorry, I ran into an issue connecting to the AI brain. Please check your network and Gemini API key config.",
        created_at: new Date().toISOString()
      };
      const finalMessages = [...updatedMessages, errorMsg];
      setMessages(finalMessages);
      publishAgentActivity(deriveLatestAgentAction(finalMessages, toolLogs));
    } finally {
      setIsLoading(false);
    }
  };

  const getToolIcon = (toolName: string) => {
    switch (toolName) {
      case 'add_task': return <Plus className="h-3 w-3 text-success" />;
      case 'complete_task': return <Check className="h-3 w-3 text-success" />;
      case 'delete_task': return <Trash2 className="h-3 w-3 text-danger" />;
      case 'update_task': return <Edit className="h-3 w-3 text-warn" />;
      case 'list_tasks': return <List className="h-3 w-3 text-accent" />;
      default: return <Sparkles className="h-3 w-3 text-accent" />;
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[var(--z-modal)]">
      <AnimatePresence>
        {/* Floating Chat Bubble Button */}
        {!open && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            onClick={() => onOpenChange(true)}
            aria-label="Open AI assistant"
            className="btn-primary h-14 w-14 rounded-full p-0"
          >
            <MessageSquare className="h-6 w-6" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {/* Expandable Chat Drawer Container */}
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="fixed bottom-6 right-6 w-[360px] sm:w-[400px] max-w-[calc(100vw-3rem)] h-[560px] max-h-[calc(100dvh-6rem)] rounded-[var(--radius-card)] bg-paper border border-rule shadow-whisper flex flex-col overflow-hidden"
          >
            {/* Chat Drawer Header */}
            <div className="flex justify-between items-center px-4 py-3 border-b border-rule">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-accent-soft text-accent-strong rounded-[var(--radius-input)] flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="text-left leading-tight">
                  <h3 className="font-display font-semibold text-sm text-ink">EVO AI</h3>
                  <p className="text-[11px] text-muted">Edits your tasks as you talk.</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={toggleConversations}
                  aria-expanded={showConversations}
                  aria-label="Show saved conversations"
                  className="icon-btn"
                >
                  <MessageSquare className="h-4 w-4" />
                </button>
                {messages.length > 0 && (
                  <button
                    onClick={clearChat}
                    className="h-8 px-2.5 rounded-[var(--radius-input)] text-[11px] font-medium text-danger hover:bg-danger-soft transition-colors cursor-pointer"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={() => onOpenChange(false)}
                  aria-label="Close AI assistant"
                  className="icon-btn"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Saved conversations (issue #13). Replaces the message area
                while open — the drawer is only 400px wide, and a side panel
                would squeeze the transcript it shares space with. */}
            {showConversations && (
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                <div className="flex items-center justify-between px-1 pb-1">
                  <p className="text-[11px] font-medium text-muted">
                    Saved conversations
                  </p>
                  <button
                    onClick={clearChat}
                    className="h-7 px-2 rounded-[var(--radius-input)] text-[11px] font-medium text-muted hover:bg-paper-2 transition-colors cursor-pointer"
                  >
                    New chat
                  </button>
                </div>

                {loadingConversations ? (
                  <div className="flex items-center justify-center py-10 text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : conversations.length === 0 ? (
                  <p className="text-xs text-muted text-center py-10 px-4 leading-relaxed">
                    No conversations yet. Ask EVO something and it will appear
                    here.
                  </p>
                ) : (
                  conversations.map((conv) => {
                    const active = conv.id === conversationId;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => void openConversation(conv.id)}
                        aria-current={active}
                        className={`w-full text-left px-3 py-2.5 rounded-[var(--radius-input)] transition-colors cursor-pointer
                          ${active
                            ? 'bg-accent-soft text-ink'
                            : 'bg-paper-2 hover:bg-paper-3 border border-rule text-ink'}`}
                      >
                        <p className="text-xs leading-snug line-clamp-2">
                          {conv.preview ?? 'New conversation'}
                        </p>
                        <p className="text-[11px] text-muted mt-1">
                          {conv.message_count}{' '}
                          {conv.message_count === 1 ? 'message' : 'messages'}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {/* Chat Dialogue Messages scrolling area */}
            <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${showConversations ? 'hidden' : ''}`}>
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6">
                  <div className="w-12 h-12 bg-accent-soft text-accent-strong rounded-[var(--radius-card)] flex items-center justify-center">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-display font-semibold text-sm text-ink">Ask EVO AI</p>
                    <p className="text-xs text-muted leading-relaxed max-w-[240px]">
                      Create, complete, or delete tasks in plain language.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 w-full pt-1">
                    <button
                      onClick={() => setInputValue('Show my pending tasks')}
                      className="text-left text-xs bg-paper-2 hover:bg-paper-3 border border-rule px-3.5 py-2.5 rounded-[var(--radius-input)] text-ink transition-colors cursor-pointer"
                    >
                      “Show my pending tasks”
                    </button>
                    <button
                      onClick={() => setInputValue('Add a high priority task to study chemistry tonight')}
                      className="text-left text-xs bg-paper-2 hover:bg-paper-3 border border-rule px-3.5 py-2.5 rounded-[var(--radius-input)] text-ink transition-colors cursor-pointer"
                    >
                      “Add a high-priority task to study chemistry tonight”
                    </button>
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] px-3.5 py-2.5 rounded-[var(--radius-card)] text-sm leading-relaxed ${msg.role === 'user'
                        ? 'accent-fill rounded-br-sm'
                        : 'bg-paper-2 border border-rule text-ink rounded-bl-sm'
                        }`}
                    >
                      {msg.content}
                    </div>

                    {/* Render tool logs pills underneath response if any */}
                    {/* Issue #4: a turn that did not fully succeed says so.
                        design.md asks for silent success, so nothing is shown
                        for `completed` — only the two states a user would
                        otherwise misread as fine. `warn` for partial (some of
                        it happened), `danger` for failed (none of it did). */}
                    {msg.role === 'assistant' && msg.outcome && msg.outcome !== 'completed' && (
                      <div
                        role="status"
                        className={`mt-2 ml-1 flex items-start gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-input)] text-[11px] leading-relaxed
                          ${msg.outcome === 'failed'
                            ? 'bg-danger-soft text-danger'
                            : 'bg-warn-soft text-warn'}`}
                      >
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                        <span>
                          {msg.outcome === 'failed'
                            ? 'Nothing was changed — the assistant could not complete this turn.'
                            : 'Partly done — some actions did not complete.'}
                          {msg.failedTools && msg.failedTools.length > 0 && (
                            <> Failed: {msg.failedTools.join(', ')}.</>
                          )}
                        </span>
                      </div>
                    )}

                    {msg.role === 'assistant' && toolLogs[msg.id] && (
                      <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
                        {toolLogs[msg.id].map((toolCall, idx) => (
                          <span
                            key={idx}
                            className="chip"
                          >
                            {getToolIcon(toolCall.tool)}
                            {describeToolCall(toolCall.tool, toolCall.result)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Loader/Typing indicator */}
              {isLoading && (
                <div className="flex items-start">
                  <div className="bg-paper-2 border border-rule px-4 py-3 rounded-[var(--radius-card)] rounded-bl-sm flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 bg-accent rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 bg-accent rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 bg-accent rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Chat Drawer Input Bar */}
            <form
              onSubmit={handleSendMessage}
              className="p-3 border-t border-rule flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Ask me to do anything…"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={isLoading}
                aria-label="Message the assistant"
                className="input flex-1"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isLoading}
                aria-label="Send message"
                className="h-11 w-11 shrink-0 rounded-[var(--radius-input)] accent-fill flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
