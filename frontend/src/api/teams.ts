import client from './client';

export type TeamRole = 'head_coach' | 'assistant_coach' | 'team_manager';
export type Gender = 'Boys' | 'Girls' | 'Mixed';

export interface TeamMember {
  id: string;
  user_id: string;
  team_id: string;
  team_role: TeamRole;
  name: string;
  email: string;
  phone?: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  club_id: string;
  name: string;
  gender: Gender;
  age_group: string;
  member_count: number;
  members?: TeamMember[];
  created_at: string;
  updated_at: string;
}

export interface UserTeamMembership {
  team_id: string;
  team_role: TeamRole;
  team_name: string;
  gender: Gender;
  age_group: string;
}

export const listTeams = () =>
  client.get<Team[]>('/teams');

export const getTeam = (id: string) =>
  client.get<Team>(`/teams/${id}`);

export const createTeam = (data: { name: string; gender: Gender; age_group: string }) =>
  client.post<Team>('/teams', data);

export const updateTeam = (id: string, data: { name?: string; gender?: Gender; age_group?: string }) =>
  client.put<Team>(`/teams/${id}`, data);

export const deleteTeam = (id: string) =>
  client.delete(`/teams/${id}`);

export const addMember = (teamId: string, data: { user_id: string; team_role: TeamRole }) =>
  client.post<TeamMember>(`/teams/${teamId}/members`, data);

export const updateMember = (teamId: string, userId: string, data: { team_role: TeamRole }) =>
  client.put<TeamMember>(`/teams/${teamId}/members/${userId}`, data);

export const removeMember = (teamId: string, userId: string) =>
  client.delete(`/teams/${teamId}/members/${userId}`);
