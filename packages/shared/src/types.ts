export interface ApiUser {
  id: string;
  email: string;
  username: string;
  displayName?: string | null;
  imageUrl?: string | null;
  createdAt: string;
}
