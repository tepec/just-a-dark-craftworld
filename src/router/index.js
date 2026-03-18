import { createRouter, createWebHistory } from 'vue-router'
import LibraryView from '../views/LibraryView.vue'
import ReaderView from '../views/ReaderView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'library', component: LibraryView },
    { path: '/read/:id', name: 'reader', component: ReaderView },
  ],
})

export default router
