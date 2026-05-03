import type { RequestHandler } from 'express';
import * as assetService from '../services/asset.service';
import AppError from '../utils/AppError';

export const listCategories: RequestHandler = async (req, res, next) => {
  try {
    const categories = await assetService.listCategories(req.user.club_id as string);
    res.json(categories);
  } catch (err) {
    next(err);
  }
};

export const createCategory: RequestHandler = async (req, res, next) => {
  try {
    const category = await assetService.createCategory(req.user.club_id as string, req.body.name);
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
};

export const listAssets: RequestHandler = async (req, res, next) => {
  try {
    const result = await assetService.listAssets(req.user.club_id as string, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const createAsset: RequestHandler = async (req, res, next) => {
  try {
    const asset = await assetService.createAsset(req.user.club_id as string, req.user.id, req.body);
    res.status(201).json(asset);
  } catch (err) {
    next(err);
  }
};

export const getAsset: RequestHandler = async (req, res, next) => {
  try {
    const asset = await assetService.getAsset(req.params.id, req.user.club_id as string);
    res.json(asset);
  } catch (err) {
    next(err);
  }
};

export const updateAsset: RequestHandler = async (req, res, next) => {
  try {
    const asset = await assetService.updateAsset(req.params.id, req.user.club_id as string, req.body);
    res.json(asset);
  } catch (err) {
    next(err);
  }
};

export const deleteAsset: RequestHandler = async (req, res, next) => {
  try {
    await assetService.deleteAsset(req.params.id, req.user.club_id as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const uploadImage: RequestHandler = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No file provided', 400);
    const result = await assetService.uploadImage(
      req.params.id, req.user.club_id as string,
      req.file.buffer, req.file.mimetype, req.file.originalname
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const addBatch: RequestHandler = async (req, res, next) => {
  try {
    const result = await assetService.addBatch(
      req.params.id, req.user.club_id as string, req.user.id, req.body
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const updateBatch: RequestHandler = async (req, res, next) => {
  try {
    const result = await assetService.updateBatch(
      req.params.batchId, req.params.id, req.user.club_id as string, req.body
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getDepreciation: RequestHandler = async (req, res, next) => {
  try {
    const data = await assetService.getDepreciation(req.params.batchId, req.user.club_id as string);
    res.json(data);
  } catch (err) {
    next(err);
  }
};
