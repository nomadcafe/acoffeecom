import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from '../i18n/messages';
import type { Locale } from '../i18n/messages';
import { track } from '../utils/analytics';
import styles from './ErrorBoundary.module.css';

// Standalone strings (no i18n hook): the boundary must keep working even if
// I18nProvider itself is what threw.
const FALLBACK: Record<Locale, { title: string; body: string; reload: string }> = {
  en: {
    title: 'Something went wrong',
    body: 'The app hit an unexpected error. Reloading usually fixes it.',
    reload: 'Reload',
  },
  ja: {
    title: '問題が発生しました',
    body: '予期しないエラーが発生しました。再読み込みでほとんどの場合は解消します。',
    reload: '再読み込み',
  },
  zh: {
    title: '出错了',
    body: '应用遇到了意料之外的错误，刷新页面通常就能解决。',
    reload: '刷新页面',
  },
};

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
      return stored as Locale;
    }
  } catch {
    // ignore (private mode, quota, SSR, etc.)
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language?.toLowerCase() : '';
  if (nav?.startsWith('ja')) return 'ja';
  if (nav?.startsWith('zh')) return 'zh';
  return 'en';
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info);
    track('app_crash', {
      message: error.message,
      stack: (error.stack ?? '').slice(0, 500),
      component: info.componentStack?.split('\n').slice(1, 6).join(' › ').trim(),
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const strings = FALLBACK[detectLocale()];
    const detail =
      import.meta.env.DEV && this.state.error.message
        ? this.state.error.message
        : null;
    return (
      <div className={styles.shell} role="alert">
        <div className={styles.card}>
          <div className={styles.glyph} aria-hidden="true">☕</div>
          <h1 className={styles.title}>{strings.title}</h1>
          <p className={styles.body}>{strings.body}</p>
          <button type="button" className={styles.reload} onClick={this.handleReload}>
            {strings.reload}
          </button>
          {detail ? <pre className={styles.detail}>{detail}</pre> : null}
        </div>
      </div>
    );
  }
}
