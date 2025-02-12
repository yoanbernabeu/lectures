const GOOGLE_BOOKS_API_URL = 'https://www.googleapis.com/books/v1/volumes';

export async function fetchGoogleBooksData(googleBooksId: string) {
  try {
    const response = await fetch(`${GOOGLE_BOOKS_API_URL}/${googleBooksId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch book data');
    }
    const data = await response.json();
    return {
      title: data.volumeInfo.title || '',
      authors: data.volumeInfo.authors as string[],
      description: data.volumeInfo.description,
      imageLinks: data.volumeInfo.imageLinks,
    };
  } catch (error) {
    console.error(`Error fetching data for book ${googleBooksId}:`, error);
    return undefined;
  }
} 