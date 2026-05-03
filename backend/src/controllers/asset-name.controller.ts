import type { RequestHandler } from 'express';
import * as assetNameService from '../services/asset-name.service';

export const listAssetNames: RequestHandler = async (req, res, next) => {
  try {
    const names = await assetNameService.listAssetNames(req.user.club_id as string);
    res.json(names);
  } catch (err) { next(err); }
};

export const createAssetName: RequestHandler = async (req, res, next) => {
  try {
    const name = await assetNameService.createAssetName(req.user.club_id as string, req.body.name);
    res.status(201).json(name);
  } catch (err) { next(err); }
};

export const updateAssetName: RequestHandler = async (req, res, next) => {
  try {
    const name = await assetNameService.updateAssetName(
      req.params.id, req.user.club_id as string, req.body.name
    );
    res.json(name);
  } catch (err) { next(err); }
};

export const deleteAssetName: RequestHandler = async (req, res, next) => {
  try {
    await assetNameService.deleteAssetName(req.params.id, req.user.club_id as string);
    res.status(204).send();
  } catch (err) { next(err); }
};
