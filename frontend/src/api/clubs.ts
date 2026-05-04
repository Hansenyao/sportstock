import client from './client';

export interface Club {
  id: string;
  name: string;
  sport_type: string;
  address?: string | null;
  contact_email: string;
  logo_url?: string | null;
  low_stock_threshold?: number;
  retirement_alert_mode?: 'months' | 'percent';
  retirement_alert_value?: number;
  created_at: string;
}

export const getMyClub = () =>
  client.get<Club>('/clubs/me');

export const updateMyClub = (
  data: Partial<Pick<
    Club,
    | 'name' | 'sport_type' | 'address' | 'contact_email'
    | 'low_stock_threshold' | 'retirement_alert_mode' | 'retirement_alert_value'
  >>
) => client.put<Club>('/clubs/me', data);
