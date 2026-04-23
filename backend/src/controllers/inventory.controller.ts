import type { RequestHandler } from 'express';
import * as inventoryService from '../services/inventory.service';

export const listMovements: RequestHandler = async (req, res, next) => {
  try {
    const result = await inventoryService.listMovements(req.user.club_id as string, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const purchaseStock: RequestHandler = async (req, res, next) => {
  try {
    const asset = await inventoryService.purchaseStock(
      req.user.club_id as string, req.user.id, req.body.asset_id, req.body.quantity, req.body.notes
    );
    res.json(asset);
  } catch (err) {
    next(err);
  }
};

export const adjustStock: RequestHandler = async (req, res, next) => {
  try {
    const asset = await inventoryService.adjustStock(
      req.user.club_id as string, req.user.id, req.body.asset_id, req.body.quantity_delta, req.body.notes
    );
    res.json(asset);
  } catch (err) {
    next(err);
  }
};

export const retireAsset: RequestHandler = async (req, res, next) => {
  try {
    const asset = await inventoryService.retireAsset(
      req.user.club_id as string, req.user.id, req.body.asset_id, req.body.quantity, req.body.notes
    );
    res.json(asset);
  } catch (err) {
    next(err);
  }
};

export const completeMaintenance: RequestHandler = async (req, res, next) => {
  try {
    const asset = await inventoryService.completeMaintenance(
      req.user.club_id as string, req.user.id, req.body.asset_id, req.body.quantity_restored, req.body.notes
    );
    res.json(asset);
  } catch (err) {
    next(err);
  }
};

export const listStocktakes: RequestHandler = async (req, res, next) => {
  try {
    const sessions = await inventoryService.listStocktakes(req.user.club_id as string, req.query);
    res.json(sessions);
  } catch (err) {
    next(err);
  }
};

export const createStocktake: RequestHandler = async (req, res, next) => {
  try {
    const session = await inventoryService.createStocktake(req.user.club_id as string, req.user.id, req.body.notes);
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
};

export const getStocktake: RequestHandler = async (req, res, next) => {
  try {
    const session = await inventoryService.getStocktake(req.params.id, req.user.club_id as string);
    res.json(session);
  } catch (err) {
    next(err);
  }
};

export const updateStocktake: RequestHandler = async (req, res, next) => {
  try {
    const session = await inventoryService.updateStocktake(req.params.id, req.user.club_id as string, req.body);
    res.json(session);
  } catch (err) {
    next(err);
  }
};
