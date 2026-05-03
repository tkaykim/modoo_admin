'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, X, MessageSquare, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import type { EditorChatMessage } from '@/types/types';
import { formatKstDateTimeMedium } from '@/lib/kst';

interface DesignChatPanelProps {
  orderItemId: string;
  productTitle?: string;
  designTitle?: string;
  onClose?: () => void;
  compact?: boolean;
}

const roleLabel: Record<string, string> = {
  admin: '관리자',
  factory: '공장',
  customer: '고객',
};

const roleBgColor: Record<string, string> = {
  admin: 'bg-blue-100 text-blue-700',
  factory: 'bg-purple-100 text-purple-700',
  customer: 'bg-green-100 text-green-700',
};

export default function DesignChatPanel({
  orderItemId,
  productTitle,
  designTitle,
  onClose,
  compact = false,
}: DesignChatPanelProps) {
  const [messages, setMessages] = useState<EditorChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/orders/messages?orderItemId=${orderItemId}`);
      if (!res.ok) return;
      const { data } = await res.json();
      setMessages(data || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [orderItemId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`editor-chat-${orderItemId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'editor_chat_messages',
          filter: `order_item_id=eq.${orderItemId}`,
        },
        () => {
          fetchMessages();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderItemId, fetchMessages]);

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch('/api/admin/orders/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderItemId,
          content: newMessage.trim(),
        }),
      });

      if (res.ok) {
        const { data } = await res.json();
        setMessages((prev) => [...prev, data]);
        setNewMessage('');
      }
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (dateStr: string) => formatKstDateTimeMedium(dateStr);

  return (
    <div className={`flex flex-col ${compact ? 'h-full' : 'h-[500px]'} bg-white border border-gray-200 rounded-lg overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-4 h-4 text-blue-600 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">디자인 소통</h3>
            {(productTitle || designTitle) && (
              <p className="text-xs text-gray-500 truncate">
                {productTitle}{designTitle ? ` · ${designTitle}` : ''}
              </p>
            )}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="w-8 h-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">아직 메시지가 없습니다</p>
            <p className="text-xs text-gray-300 mt-1">디자인 관련 소통을 시작해보세요</p>
          </div>
        ) : (
          messages.map((msg) => {
            const senderRole = msg.sender?.role || 'customer';
            const isCustomer = senderRole === 'customer';

            return (
              <div key={msg.id} className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${roleBgColor[senderRole] || 'bg-gray-100 text-gray-600'}`}>
                    {roleLabel[senderRole] || senderRole}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {msg.sender?.name || '알 수 없음'}
                  </span>
                </div>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                    isCustomer
                      ? 'bg-gray-100 text-gray-900 rounded-tl-sm'
                      : 'bg-blue-600 text-white rounded-tr-sm'
                  }`}
                >
                  {msg.content}
                </div>
                {msg.attachment_urls && msg.attachment_urls.length > 0 && (
                  <div className={`flex flex-wrap gap-1 mt-1 ${isCustomer ? '' : 'justify-end'}`}>
                    {msg.attachment_urls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={url}
                          alt={`첨부 ${i + 1}`}
                          className="w-16 h-16 object-cover rounded border border-gray-200"
                        />
                      </a>
                    ))}
                  </div>
                )}
                <span className="text-[10px] text-gray-400 mt-0.5">
                  {formatTime(msg.created_at)}
                </span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 px-3 py-2 bg-white shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요..."
            rows={1}
            className="flex-1 resize-none border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ maxHeight: '80px' }}
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
