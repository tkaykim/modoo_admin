'use client';

import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Youtube } from '@tiptap/extension-youtube';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { useEffect, useRef, useState, useCallback, type ChangeEvent } from 'react';

// style/class/id 속성을 모든 노드에서 보존하는 extension
const PreserveAttributes = Extension.create({
  name: 'preserveAttributes',
  addGlobalAttributes() {
    const nodeTypes = [
      'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem',
      'blockquote', 'codeBlock', 'table', 'tableRow', 'tableCell',
      'tableHeader', 'image', 'horizontalRule',
    ];
    return nodeTypes.map((type) => ({
      types: [type],
      attributes: {
        style: {
          default: null,
          parseHTML: (el: Element) => el.getAttribute('style') || null,
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs.style ? { style: attrs.style } : {},
        },
        class: {
          default: null,
          parseHTML: (el: Element) => el.getAttribute('class') || null,
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs.class ? { class: attrs.class } : {},
        },
        id: {
          default: null,
          parseHTML: (el: Element) => el.getAttribute('id') || null,
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs.id ? { id: attrs.id } : {},
        },
      },
    }));
  },
});
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Minus,
  AlignLeft, AlignCenter, AlignRight,
  Link as LinkIcon, Image as ImageIcon, Youtube as YoutubeIcon,
  Table as TableIcon, Code, Undo, Redo,
  Code2, Highlighter,
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onImageUpload?: (file: File) => Promise<string>;
  placeholder?: string;
  minHeight?: string;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded text-sm transition-colors ${
        active
          ? 'bg-gray-900 text-white'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5 self-center" />;
}

export default function RichTextEditor({
  value,
  onChange,
  onImageUpload,
  placeholder = '내용을 입력하세요...',
  minHeight = '300px',
}: RichTextEditorProps) {
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [sourceHtml, setSourceHtml] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      PreserveAttributes,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-blue-600 underline' } }),
      Image.configure({ HTMLAttributes: { class: 'max-w-full h-auto rounded' } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Youtube.configure({ width: 640, height: 360, HTMLAttributes: { class: 'w-full rounded', style: 'width:100%;max-width:100%' } }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // 외부 value 변경 시 에디터에 반영 (에디터 직접 수정과 충돌 방지)
  useEffect(() => {
    if (!editor) return;
    if (isSourceMode) return;
    const current = editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor, isSourceMode]);

  // 소스 모드 진입 시 현재 HTML을 textarea에 반영
  const enterSourceMode = useCallback(() => {
    if (!editor) return;
    setSourceHtml(editor.getHTML());
    setIsSourceMode(true);
  }, [editor]);

  // 소스 모드 종료 시 textarea의 HTML을 에디터에 반영
  const exitSourceMode = useCallback(() => {
    if (!editor) return;
    editor.commands.setContent(sourceHtml, { emitUpdate: false });
    onChange(sourceHtml);
    setIsSourceMode(false);
  }, [editor, sourceHtml, onChange]);

  const handleImageUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor || !onImageUpload) return;
    e.target.value = '';
    setUploadingImage(true);
    try {
      const url = await onImageUpload(file);
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch {
      alert('이미지 업로드에 실패했습니다.');
    } finally {
      setUploadingImage(false);
    }
  }, [editor, onImageUpload]);

  const handleInsertLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href ?? '';
    const url = window.prompt('링크 URL을 입력하세요:', prev);
    if (url === null) return;
    if (!url) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
    }
  }, [editor]);

  const handleInsertYoutube = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('YouTube URL을 입력하세요:');
    if (!url) return;
    editor.chain().focus().setYoutubeVideo({ src: url }).run();
  }, [editor]);

  const handleInsertTable = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden bg-white">
      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
        {/* 실행취소/다시실행 */}
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="실행취소">
          <Undo className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="다시실행">
          <Redo className="w-4 h-4" />
        </ToolbarButton>
        <Divider />

        {/* 제목 */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="제목 1">
          <Heading1 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="제목 2">
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="제목 3">
          <Heading3 className="w-4 h-4" />
        </ToolbarButton>
        <Divider />

        {/* 텍스트 서식 */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="굵게">
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="기울임">
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="밑줄">
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="취소선">
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="인라인 코드">
          <Code className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="형광펜">
          <Highlighter className="w-4 h-4" />
        </ToolbarButton>
        <Divider />

        {/* 정렬 */}
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="왼쪽 정렬">
          <AlignLeft className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="가운데 정렬">
          <AlignCenter className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="오른쪽 정렬">
          <AlignRight className="w-4 h-4" />
        </ToolbarButton>
        <Divider />

        {/* 목록 */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="글머리 목록">
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="번호 목록">
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="인용구">
          <Quote className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="구분선">
          <Minus className="w-4 h-4" />
        </ToolbarButton>
        <Divider />

        {/* 미디어/삽입 */}
        <ToolbarButton onClick={handleInsertLink} active={editor.isActive('link')} title="링크 삽입">
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>
        {onImageUpload && (
          <ToolbarButton
            onClick={() => fileInputRef.current?.click()}
            title={uploadingImage ? '업로드 중...' : '이미지 삽입'}
            disabled={uploadingImage}
          >
            <ImageIcon className="w-4 h-4" />
          </ToolbarButton>
        )}
        <ToolbarButton onClick={handleInsertYoutube} title="YouTube 영상 삽입">
          <YoutubeIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleInsertTable} title="표 삽입">
          <TableIcon className="w-4 h-4" />
        </ToolbarButton>
        <Divider />

        {/* HTML 소스 토글 */}
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); isSourceMode ? exitSourceMode() : enterSourceMode(); }}
          title={isSourceMode ? 'WYSIWYG 모드로 전환' : 'HTML 소스 편집'}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
            isSourceMode
              ? 'bg-orange-500 text-white'
              : 'text-gray-600 hover:bg-gray-100 border border-gray-300'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          {isSourceMode ? 'WYSIWYG' : 'HTML'}
        </button>

        {/* 소스 모드일 때 미리보기 토글 */}
        {isSourceMode && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setShowPreview(v => !v); }}
            title={showPreview ? '미리보기 숨기기' : '미리보기 표시'}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors ${
              showPreview
                ? 'bg-blue-500 text-white border-blue-500'
                : 'text-gray-600 hover:bg-gray-100 border-gray-300'
            }`}
          >
            미리보기
          </button>
        )}
      </div>

      {/* 에디터 본문 */}
      {isSourceMode ? (
        <div className={`flex ${showPreview ? 'divide-x divide-gray-700' : ''}`}>
          <div className={showPreview ? 'w-1/2' : 'w-full'}>
            <div className="flex items-center justify-between px-3 py-1 bg-gray-800 text-xs text-gray-400">
              <span>HTML 소스 — AI 생성 HTML을 여기에 붙여넣으세요</span>
              <span className="text-yellow-400">⚠ &lt;style&gt; 태그는 소스 모드에서만 지원됩니다</span>
            </div>
            <textarea
              value={sourceHtml}
              onChange={(e) => setSourceHtml(e.target.value)}
              className="w-full p-3 font-mono text-sm bg-gray-950 text-green-400 resize-y outline-none"
              style={{ minHeight }}
              placeholder="HTML 소스를 직접 입력하세요..."
              spellCheck={false}
            />
          </div>
          {showPreview && (
            <div className="w-1/2 flex flex-col">
              <div className="px-3 py-1 bg-gray-100 border-b border-gray-200 text-xs text-gray-500">
                미리보기 (실제 렌더링)
              </div>
              <div
                className="rich-content p-4 overflow-auto bg-white"
                style={{ minHeight }}
                dangerouslySetInnerHTML={{ __html: sourceHtml }}
              />
            </div>
          )}
        </div>
      ) : (
        <EditorContent
          editor={editor}
          className="rich-editor-content p-3"
          style={{ minHeight }}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* 표 조작 툴바 (표 안에 커서가 있을 때만 표시) */}
      {editor.isActive('table') && !isSourceMode && (
        <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 bg-blue-50 border-t border-blue-200">
          <span className="text-xs text-blue-600 font-medium mr-1">표 편집:</span>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addColumnBefore().run(); }} className="px-2 py-0.5 text-xs bg-white border border-blue-200 rounded hover:bg-blue-100">열 앞 추가</button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addColumnAfter().run(); }} className="px-2 py-0.5 text-xs bg-white border border-blue-200 rounded hover:bg-blue-100">열 뒤 추가</button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().deleteColumn().run(); }} className="px-2 py-0.5 text-xs bg-white border border-red-200 rounded text-red-600 hover:bg-red-50">열 삭제</button>
          <div className="w-px h-4 bg-blue-200 mx-0.5" />
          <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addRowBefore().run(); }} className="px-2 py-0.5 text-xs bg-white border border-blue-200 rounded hover:bg-blue-100">행 앞 추가</button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addRowAfter().run(); }} className="px-2 py-0.5 text-xs bg-white border border-blue-200 rounded hover:bg-blue-100">행 뒤 추가</button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().deleteRow().run(); }} className="px-2 py-0.5 text-xs bg-white border border-red-200 rounded text-red-600 hover:bg-red-50">행 삭제</button>
          <div className="w-px h-4 bg-blue-200 mx-0.5" />
          <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().deleteTable().run(); }} className="px-2 py-0.5 text-xs bg-white border border-red-300 rounded text-red-700 hover:bg-red-50">표 삭제</button>
        </div>
      )}

      <style>{`
        .rich-editor-content .ProseMirror h1 { font-size: 1.75rem; font-weight: 700; margin: 1rem 0 0.5rem; }
        .rich-editor-content .ProseMirror h2 { font-size: 1.375rem; font-weight: 700; margin: 0.875rem 0 0.5rem; }
        .rich-editor-content .ProseMirror h3 { font-size: 1.125rem; font-weight: 600; margin: 0.75rem 0 0.375rem; }
        .rich-editor-content .ProseMirror p { margin: 0.375rem 0; line-height: 1.7; }
        .rich-editor-content .ProseMirror p.is-editor-empty:first-child::before { color: #adb5bd; content: attr(data-placeholder); float: left; height: 0; pointer-events: none; }
        .rich-editor-content .ProseMirror ul { list-style: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
        .rich-editor-content .ProseMirror ol { list-style: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
        .rich-editor-content .ProseMirror li { margin: 0.25rem 0; }
        .rich-editor-content .ProseMirror blockquote { border-left: 3px solid #d1d5db; padding-left: 1rem; color: #6b7280; margin: 0.75rem 0; font-style: italic; }
        .rich-editor-content .ProseMirror hr { border: none; border-top: 2px solid #e5e7eb; margin: 1rem 0; }
        .rich-editor-content .ProseMirror code { background: #f3f4f6; padding: 0.125rem 0.375rem; border-radius: 4px; font-family: monospace; font-size: 0.875em; }
        .rich-editor-content .ProseMirror img { max-width: 100%; height: auto; border-radius: 6px; margin: 0.5rem 0; }
        .rich-editor-content .ProseMirror table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; }
        .rich-editor-content .ProseMirror table td, .rich-editor-content .ProseMirror table th { border: 1px solid #d1d5db; padding: 0.5rem 0.75rem; min-width: 60px; }
        .rich-editor-content .ProseMirror table th { background: #f9fafb; font-weight: 600; }
        .rich-editor-content .ProseMirror table .selectedCell { background: #dbeafe; }
        .rich-editor-content .ProseMirror .tableWrapper { overflow-x: auto; }
        .rich-editor-content .ProseMirror a { color: #2563eb; text-decoration: underline; }
        .rich-editor-content .ProseMirror .youtube-wrapper { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 6px; margin: 0.75rem 0; }
        .rich-editor-content .ProseMirror iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
      `}</style>
    </div>
  );
}
