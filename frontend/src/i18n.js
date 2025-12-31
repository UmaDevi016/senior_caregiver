import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import ta from './locales/ta.json';
import te from './locales/te.json';
import bn from './locales/bn.json';
import ar from './locales/ar.json';
import mr from './locales/mr.json';
import ml from './locales/ml.json';
import or from './locales/or.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      hi: { translation: hi },
      ta: { translation: ta },
      te: { translation: te },
      bn: { translation: bn },
      ar: { translation: ar },
      mr: { translation: mr },
      ml: { translation: ml },
      or: { translation: or },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
