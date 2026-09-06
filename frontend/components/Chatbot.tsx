import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Send, X, Sparkles, Check, Trash2,
  Plus, Edit, List, Loader2
} from 'lucide-react';
import { authClient } from '../lib/auth-client';
import { secureFetch } from '../lib/api';
import { AuthUser, ChatMessage, ToolCall, ChatResponse } from '../types';

interface ChatbotProps {
  onTaskMutation: () => void;
}

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function Chatbot({ onTaskMutation }: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [toolLogs, setToolLogs] = useState<Record<string, ToolCall[]>>({});

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
        if (storedMessages) setMessages(JSON.parse(storedMessages));
        if (storedToolLogs) setToolLogs(JSON.parse(storedToolLogs));
      }
    };
    initChat();
  }, []);

  // 2. Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // 3. Clear Chat Session
  const clearChat = () => {
    if (!user) return;
    setMessages([]);
    setConversationId(null);
    setToolLogs({});
    localStorage.removeItem(`evo_conv_id_${user.id}`);
    localStorage.removeItem(`evo_chat_history_${user.id}`);
    localStorage.removeItem(`evo_tool_logs_${user.id}`);
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
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: data.response,
          created_at: new Date().toISOString()
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

      } else {
        throw new Error('Failed to get response from assistant');
      }
    } catch (err: unknown) {
      console.error('Chat error:', err);
      // Append a local error message
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "Sorry, I ran into an issue connecting to the AI brain. Please check your network and Gemini API key config.",
        created_at: new Date().toISOString()
      };
      setMessages([...updatedMessages, errorMsg]);
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

  const getToolLabel = (toolName: string, result: Record<string, unknown>) => {
    const title = typeof result?.title === 'string' ? `"${result.title}"` : 'task';
    switch (toolName) {
      case 'add_task': return `Added task ${title}`;
      case 'complete_task': return `Completed task ${title}`;
      case 'delete_task': return `Deleted task ${title}`;
      case 'update_task': return `Updated task ${title}`;
      case 'list_tasks': return `Retrieved task lists`;
      default: return `Executed tool ${toolName}`;
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[var(--z-modal)]">
      <AnimatePresence>
        {/* Floating Chat Bubble Button */}
        {!isOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            onClick={() => setIsOpen(true)}
            aria-label="Open AI assistant"
            className="btn-primary h-14 w-14 rounded-full p-0"
          >
            <MessageSquare className="h-6 w-6" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {/* Expandable Chat Drawer Container */}
        {isOpen && (
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
                <div className="w-8 h-8 bg-accent-soft text-accent rounded-[var(--radius-input)] flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="text-left leading-tight">
                  <h3 className="font-display font-semibold text-sm text-ink">EVO AI</h3>
                  <p className="text-[11px] text-muted">Edits your tasks as you talk.</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={clearChat}
                    className="h-8 px-2.5 rounded-[var(--radius-input)] text-[11px] font-medium text-danger hover:bg-danger-soft transition-colors cursor-pointer"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  aria-label="Close AI assistant"
                  className="icon-btn"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Chat Dialogue Messages scrolling area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6">
                  <div className="w-12 h-12 bg-accent-soft text-accent rounded-[var(--radius-card)] flex items-center justify-center">
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
                        ? 'bg-accent text-accent-ink rounded-br-sm'
                        : 'bg-paper-2 border border-rule text-ink rounded-bl-sm'
                        }`}
                    >
                      {msg.content}
                    </div>

                    {/* Render tool logs pills underneath response if any */}
                    {msg.role === 'assistant' && toolLogs[msg.id] && (
                      <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
                        {toolLogs[msg.id].map((toolCall, idx) => (
                          <span
                            key={idx}
                            className="chip"
                          >
                            {getToolIcon(toolCall.tool)}
                            {getToolLabel(toolCall.tool, toolCall.result)}
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
                className="h-11 w-11 shrink-0 rounded-[var(--radius-input)] bg-accent text-accent-ink flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
