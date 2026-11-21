import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { APP_NAME } from '@/config/app';
import en from './en.json';
import pl from './pl.json';

export const LANGUAGES = ['pl', 'en'] as const;

const saved = localStorage.getItem('lang');

await i18n.use(initReactI18next).init({
  resources: { pl: { translation: pl }, en: { translation: en } },
  lng: LANGUAGES.find((l) => l === saved) ?? 'pl',
  fallbackLng: 'pl',
  interpolation: { escapeValue: false, defaultVariables: { appName: APP_NAME } },
});

document.documentElement.lang = i18n.language;
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  localStorage.setItem('lang', lng);
});

export default i18n;
