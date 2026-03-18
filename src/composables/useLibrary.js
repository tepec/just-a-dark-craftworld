import { ref, onMounted } from 'vue'
import { fetchLibrary, fetchBookDetails } from '../services/api.js'

export function useLibrary() {
  const books = ref([])
  const loading = ref(true)
  const error = ref(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      // Step 1: get the list of purchased productIds
      const purchases = await fetchLibrary()
      const productIds = purchases.map(p => p.productId)

      // Step 2: fetch all book details in a single POST call
      const details = await fetchBookDetails(productIds)

      // Merge purchase dates into the details
      const purchaseMap = Object.fromEntries(purchases.map(p => [p.productId, p.purchaseDate]))
      books.value = details.map(book => ({
        ...book,
        purchaseDate: purchaseMap[book.productId],
      }))
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  onMounted(load)

  return { books, loading, error, reload: load }
}
