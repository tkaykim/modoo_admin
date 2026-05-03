export type EditorMode = 'design' | 'order' | 'template';

export interface EditorModeConfig {
  mode: EditorMode;
  label: string;
  initiallyEditable: boolean;
  showToolbar: boolean;
  showPricing: boolean;
  showDownload: boolean;
  backUrl: string;
}

interface UseEditorModeParams {
  mode: EditorMode;
  returnUrl?: string;
}

export function useEditorMode({ mode, returnUrl }: UseEditorModeParams): EditorModeConfig {
  const backUrl = returnUrl || getDefaultBackUrl(mode);

  switch (mode) {
    case 'design':
      return {
        mode: 'design',
        label: '디자인 편집',
        initiallyEditable: true,
        showToolbar: true,
        showPricing: true,
        showDownload: false,
        backUrl,
      };
    case 'order':
      return {
        mode: 'order',
        label: '주문 디자인 보기',
        initiallyEditable: false,
        showToolbar: false,
        showPricing: false,
        showDownload: true,
        backUrl,
      };
    case 'template':
      return {
        mode: 'template',
        label: '템플릿 편집',
        initiallyEditable: true,
        showToolbar: true,
        showPricing: false,
        showDownload: false,
        backUrl,
      };
  }
}

function getDefaultBackUrl(mode: EditorMode): string {
  switch (mode) {
    case 'design':
      return '/designs';
    case 'order':
      return '/orders';
    case 'template':
      return '/products';
  }
}
