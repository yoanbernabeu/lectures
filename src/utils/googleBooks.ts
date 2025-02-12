declare global {
  interface Window {
    googleBooksStore?: {
      cache: Map<string, any>;
      addToCache: (id: string, data: any) => void;
      getFromCache: (id: string) => any;
    };
  }
}

const GOOGLE_BOOKS_API_URL = 'https://www.googleapis.com/books/v1/volumes';
const MAX_RETRIES = 10;
const RETRY_DELAY = 1000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchGoogleBooksData(id: string, retryCount = 0) {
  // Vérifier le cache
  if (typeof window !== 'undefined' && window.googleBooksStore?.getFromCache(id)) {
    return window.googleBooksStore.getFromCache(id);
  }

  try {
    await delay(100 * (retryCount + 1));
    const response = await fetch(`${GOOGLE_BOOKS_API_URL}/${id}`);
    
    if (!response.ok) {
      if (retryCount < MAX_RETRIES) {
        console.warn(`Retry ${retryCount + 1}/${MAX_RETRIES} for book ${id}`);
        return fetchGoogleBooksData(id, retryCount + 1);
      }
      
      console.warn(`Failed to fetch book ${id} after ${MAX_RETRIES} retries`);
      return null;
    }

    const data = await response.json();
    const result = {
      title: data.volumeInfo.title || '',
      authors: data.volumeInfo.authors as string[],
      description: data.volumeInfo.description,
      imageLinks: data.volumeInfo.imageLinks,
    };

    // Mettre en cache avec persistance
    if (typeof window !== 'undefined' && window.googleBooksStore) {
      window.googleBooksStore.addToCache(id, result);
    }
    return result;

  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.warn(`Retry ${retryCount + 1}/${MAX_RETRIES} for book ${id}`);
      return fetchGoogleBooksData(id, retryCount + 1);
    }
    
    console.warn(`Failed to fetch book ${id} after ${MAX_RETRIES} retries`);
    return null;
  }
} 