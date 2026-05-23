import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, Send, X, Sparkles, Check, Trash2, 
  Plus, Edit, List, AlertCircle, Loader2 
} from 'lucide-react';
import { authClient } from '../lib/auth-client';
import { secureFetch } from '../lib/api';
import { ChatMessage, ToolCall, ChatResponse } from '../types';

interface ChatbotProps {
  onTaskMutation: () => void;
}

export default function Chatbot({ onTaskMutation }: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
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
    } catch (err: any) {
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
      case 'add_task': return <Plus className="h-3 w-3 text-emerald-400" />;
      case 'complete_task': return <Check className="h-3 w-3 text-teal-400" />;
      case 'delete_task': return <Trash2 className="h-3 w-3 text-rose-400" />;
      case 'update_task': return <Edit className="h-3 w-3 text-amber-400" />;
      case 'list_tasks': return <List className="h-3 w-3 text-indigo-400" />;
      default: return <Sparkles className="h-3 w-3 text-indigo-400" />;
    }
  };

  const getToolLabel = (toolName: string, result: any) => {
    const title = result?.title ? `"${result.title}"` : 'task';
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
    <div className="fixed bottom-6 right-6 z-[100] font-sans">
      <AnimatePresence>
        {/* Floating Chat Bubble Button */}
        {!isOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="h-14 w-14 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30 border border-white/20 cursor-pointer relative active:scale-95 transition-shadow hover:shadow-indigo-500/50"
          >
            <MessageSquare className="h-6 w-6" />
            <span className="absolute -top-1 -right-1 h-3.5 w-3.5 bg-emerald-500 rounded-full border-2 border-slate-900 animate-pulse" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {/* Expandable Chat Drawer Container */}
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="w-[360px] sm:w-[400px] h-[550px] rounded-2xl glass border border-white/10 shadow-2xl flex flex-flow flex-col overflow-hidden bg-slate-950/95 backdrop-blur-xl relative"
          >
            {/* Ambient Inner Glow decoration */}
            <div className="absolute top-[-30px] right-[-30px] w-36 h-36 bg-indigo-500/25 blur-3xl rounded-full pointer-events-none" />

            {/* Chat Drawer Header */}
            <div className="flex justify-between items-center px-4 py-3.5 border-b border-white/5 bg-slate-900/50 relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 rounded-xl flex items-center justify-center shadow-sm shrink-0">
                  <Sparkles className="h-4 w-4" fill="currentColor" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                    EVO <span className="text-indigo-400 font-bold uppercase text-[9px] bg-indigo-500/10 px-1.5 py-0.5 rounded-md border border-indigo-500/15">AI Chat</span>
                  </h3>
                  <p className="text-[10px] text-emerald-400 font-bold tracking-wide">ONLINE • GEMINI AGENT</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button 
                    onClick={clearChat}
                    className="text-[10px] font-bold text-rose-500 hover:text-rose-400 uppercase bg-rose-500/10 border border-rose-500/10 hover:border-rose-500/25 px-2 py-1 rounded-lg transition-all cursor-pointer"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="h-7 w-7 rounded-lg text-white/40 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Chat Dialogue Messages scrolling area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 relative z-10 scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6 opacity-60">
                  <div className="h-12 w-12 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/15 flex items-center justify-center mb-1">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-wider text-white">Ask EVO AI Assistant</p>
                  <p className="text-xs text-white/40 leading-relaxed max-w-[240px]">
                    Create, list, mark complete, or delete your tasks using simple natural language.
                  </p>
                  <div className="flex flex-flow flex-col gap-2 w-full pt-2">
                    <button 
                      onClick={() => setInputValue('Show my pending tasks')}
                      className="text-left text-xs bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 px-3.5 py-2 rounded-xl text-indigo-300 transition-all font-medium cursor-pointer"
                    >
                      "Show my pending tasks"
                    </button>
                    <button 
                      onClick={() => setInputValue('Add a high priority task study chemistry tonight')}
                      className="text-left text-xs bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 px-3.5 py-2 rounded-xl text-indigo-300 transition-all font-medium cursor-pointer"
                    >
                      "Add a task to study chemistry tonight"
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
                      className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs font-medium leading-relaxed leading-normal ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-none shadow-md shadow-indigo-600/10 border border-indigo-500/20'
                          : 'bg-white/5 text-slate-200 border border-white/5 rounded-bl-none'
                      }`}
                    >
                      {msg.content}
                    </div>

                    {/* Render tool logs pills underneath response if any */}
                    {msg.role === 'assistant' && toolLogs[msg.id] && (
                      <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
                        {toolLogs[msg.id].map((toolCall, idx) => (
                          <div 
                            key={idx}
                            className="flex items-center gap-1.5 text-[9px] font-bold bg-white/5 text-white/50 border border-white/5 px-2 py-0.5 rounded-md shadow-sm shrink-0"
                          >
                            {getToolIcon(toolCall.tool)}
                            <span>{getToolLabel(toolCall.tool, toolCall.result)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Loader/Typing indicator */}
              {isLoading && (
                <div className="flex flex-col items-flow items-start">
                  <div className="bg-white/5 border border-white/5 px-4 py-3 rounded-2xl rounded-bl-none flex items-center gap-1">
                    <span className="h-1.5 w-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Chat Drawer Input Bar */}
            <form
              onSubmit={handleSendMessage}
              className="p-3 border-t border-white/5 bg-slate-950 flex items-center gap-2 relative z-10"
            >
              <input
                type="text"
                placeholder="Ask me to do anything..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={isLoading}
                className="flex-1 bg-white/5 border border-white/5 hover:border-white/10 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isLoading}
                className="h-9 w-9 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center justify-center shadow-md shadow-indigo-600/20 hover:shadow-indigo-500/30 border border-white/10 transition-all cursor-pointer active:scale-95 disabled:opacity-30 disabled:pointer-events-none shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
