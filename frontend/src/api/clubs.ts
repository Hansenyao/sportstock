import client from './client';

export interface Club {
  id: string;
  name: string;
  sport_type: string;
  address?: string | null;
  contact_email: string;
  logo_url?: string | null;
  created_at: string;
}

export const getMyClub = () =>
  client.get<Club>('/clubs/me');

export const updateMyClub = (data: Partial<Pick<Club, 'name' | 'sport_type' | 'address' | 'contact_email'>>) =>
  client.put<Club>('/clubs/me', data);
