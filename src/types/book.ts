export type BookStatus = 'reading' | 'finished' | 'to-read';

export interface Book {
  id: string;
  googleBooksId: string;
  status: BookStatus;
  genres?: string[];
  progress?: number;
  startDate?: string;
  endDate?: string;
  rating: number | null;
  comment: string | null;
  abandoned?: boolean;
} 