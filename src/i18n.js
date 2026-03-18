import { createI18n } from 'vue-i18n'

const messages = {
  en: {
    app: {
      title: 'It\'s just a Dark Craftworld',
      titleShort: 'Dark Craftworld',
    },
    library: {
      search: 'Search by title, author...',
      filters: {
        all: 'All',
        ebooks: 'Ebooks',
        audiobooks: 'Audiobooks',
        reading: 'Reading',
      },
      empty: 'No ebooks in your library.',
      noResults: 'No results for this filter.',
      retry: 'Retry',
    },
    reader: {
      library: 'Library',
      loading: 'Loading ebook...',
      loadError: "Couldn't load ebook: {error}",
      backToLibrary: 'Back to library',
      page: 'Page {current} / {total}',
      // Settings
      settings: 'Settings',
      darkMode: 'Dark mode',
      fontSize: 'Font size',
      fontFamily: 'Font',
      margins: 'Margins',
      mode: 'Mode',
      pages: 'Pages',
      scroll: 'Scroll',
      columns: 'Columns',
      onePage: '1 page',
      twoPages: '2 pages',
      // Font options
      fontDefault: 'Default',
      fontSerif: 'Serif',
      fontSans: 'Sans-serif',
      fontMono: 'Monospace',
      // TOC
      toc: 'Table of Contents',
      // Actions
      download: 'Download EPUB',
      markFinished: 'Mark as finished',
      deleteProgress: 'Delete progress',
      confirmDelete: 'Delete progress for this book?',
    },
    audio: {
      loading: 'Loading audiobook...',
      loadError: "Couldn't load audiobook: {error}",
      backToLibrary: 'Back to library',
      chapters: 'Chapters',
      download: 'Download MP3',
      speed: 'Speed',
      narrator: 'Narrated by {name}',
    },
    theme: {
      light: 'Light mode',
      dark: 'Dark mode',
    },
  },
  fr: {
    app: {
      title: 'It\'s just a Dark Craftworld',
      titleShort: 'Dark Craftworld',
    },
    library: {
      search: 'Rechercher un titre, un auteur...',
      filters: {
        all: 'Tous',
        ebooks: 'Ebooks',
        audiobooks: 'Audiobooks',
        reading: 'En cours',
      },
      empty: 'Aucun ebook dans ta bibliothèque.',
      noResults: 'Aucun résultat pour ce filtre.',
      retry: 'Réessayer',
    },
    reader: {
      library: 'Bibliothèque',
      loading: "Chargement de l'ebook...",
      loadError: "Impossible de charger l'ebook: {error}",
      backToLibrary: 'Retour à la bibliothèque',
      page: 'Page {current} / {total}',
      // Settings
      settings: 'Réglages',
      darkMode: 'Mode sombre',
      fontSize: 'Taille police',
      fontFamily: 'Police',
      margins: 'Marges',
      mode: 'Mode',
      pages: 'Pages',
      scroll: 'Défilement',
      columns: 'Colonnes',
      onePage: '1 page',
      twoPages: '2 pages',
      // Font options
      fontDefault: 'Par défaut',
      fontSerif: 'Serif',
      fontSans: 'Sans-serif',
      fontMono: 'Monospace',
      // TOC
      toc: 'Table des matières',
      // Actions
      download: "Télécharger l'EPUB",
      markFinished: 'Marquer comme terminé',
      deleteProgress: 'Supprimer la progression',
      confirmDelete: 'Supprimer la progression sur ce livre ?',
    },
    audio: {
      loading: "Chargement de l'audiobook...",
      loadError: "Impossible de charger l'audiobook: {error}",
      backToLibrary: 'Retour à la bibliothèque',
      chapters: 'Chapitres',
      download: 'Télécharger le MP3',
      speed: 'Vitesse',
      narrator: 'Lu par {name}',
    },
    theme: {
      light: 'Mode clair',
      dark: 'Mode sombre',
    },
  },
}

function getDefaultLocale() {
  const saved = localStorage.getItem('bl-locale')
  if (saved) return saved
  const nav = navigator.language || 'en'
  return nav.startsWith('fr') ? 'fr' : 'en'
}

const i18n = createI18n({
  legacy: false,
  locale: getDefaultLocale(),
  fallbackLocale: 'en',
  messages,
})

export default i18n
