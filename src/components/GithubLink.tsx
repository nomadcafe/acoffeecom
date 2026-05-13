import { useI18n } from '../context/I18nContext';
import styles from './GithubLink.module.css';

/**
 * Small icon link to the project's GitHub repo, mounted next to the
 * sign-in / account cluster in every page header. Open Source is part
 * of the product's pitch (also surfaced in the home eyebrow); this gives
 * curious visitors a one-click path to the source without having to
 * scroll back to the hero.
 */
export function GithubLink() {
  const { t } = useI18n();
  const label = t('header.githubAria');
  return (
    <a
      className={styles.link}
      href="https://github.com/nomadcafe/acoffeecom"
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
    >
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        width="20"
        height="20"
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M12 0.5C5.65 0.5 0.5 5.65 0.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-1.99c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.89-.39s1.97.13 2.89.39c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.27 5.68.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.8.56C20.21 21.39 23.5 17.07 23.5 12 23.5 5.65 18.35 0.5 12 0.5z"
        />
      </svg>
    </a>
  );
}
