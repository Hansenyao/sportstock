import type { RequestHandler } from 'express';
import * as teamService from '../services/team.service';

export const listTeams: RequestHandler = async (req, res, next) => {
  try {
    const teams = await teamService.listTeams(req.user.club_id as string);
    res.json(teams);
  } catch (err) {
    next(err);
  }
};

export const getTeam: RequestHandler = async (req, res, next) => {
  try {
    const team = await teamService.getTeam(req.params.id, req.user.club_id as string);
    res.json(team);
  } catch (err) {
    next(err);
  }
};

export const createTeam: RequestHandler = async (req, res, next) => {
  try {
    const team = await teamService.createTeam(req.user.club_id as string, req.body);
    res.status(201).json(team);
  } catch (err) {
    next(err);
  }
};

export const updateTeam: RequestHandler = async (req, res, next) => {
  try {
    const team = await teamService.updateTeam(req.params.id, req.user.club_id as string, req.body);
    res.json(team);
  } catch (err) {
    next(err);
  }
};

export const deleteTeam: RequestHandler = async (req, res, next) => {
  try {
    await teamService.deleteTeam(req.params.id, req.user.club_id as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const addMember: RequestHandler = async (req, res, next) => {
  try {
    const member = await teamService.addMember(
      req.params.id,
      req.user.club_id as string,
      req.body.user_id,
      req.body.team_role
    );
    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
};

export const updateMember: RequestHandler = async (req, res, next) => {
  try {
    const member = await teamService.updateMember(
      req.params.id,
      req.user.club_id as string,
      req.params.userId,
      req.body.team_role
    );
    res.json(member);
  } catch (err) {
    next(err);
  }
};

export const removeMember: RequestHandler = async (req, res, next) => {
  try {
    await teamService.removeMember(req.params.id, req.user.club_id as string, req.params.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
