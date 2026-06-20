/**
 * `reports.*` sub-router — read-only dashboard, warranty list, insurance
 * report and value breakdowns. All GET, all JSON.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { InventoryItemSchema } from './rest-items.js';
import { QueryBool } from './rest-schemas.js';

const c = initContract();

const DashboardSummarySchema = z.object({
  itemCount: z.number(),
  totalReplacementValue: z.number(),
  totalResaleValue: z.number(),
  warrantiesExpiringSoon: z.number(),
  recentlyAdded: z.array(
    z.object({
      id: z.string(),
      itemName: z.string(),
      type: z.string().nullable(),
      assetId: z.string().nullable(),
      lastEditedTime: z.string(),
    })
  ),
});

const WarrantyItemSchema = InventoryItemSchema.extend({
  warrantyDocumentId: z.number().nullable(),
});

const ValueBreakdownEntrySchema = z.object({
  name: z.string(),
  totalValue: z.number(),
  itemCount: z.number(),
  key: z.string().nullable().optional(),
});

const InsuranceReportItemSchema = z.object({
  id: z.string(),
  itemName: z.string(),
  assetId: z.string().nullable(),
  brand: z.string().nullable(),
  type: z.string().nullable(),
  condition: z.string().nullable(),
  warrantyExpires: z.string().nullable(),
  replacementValue: z.number().nullable(),
  photoPath: z.string().nullable(),
  locationId: z.string().nullable(),
  locationName: z.string().nullable(),
  receiptDocumentIds: z.array(z.number()),
});

const InsuranceReportResultSchema = z.object({
  groups: z.array(
    z.object({
      locationId: z.string().nullable(),
      locationName: z.string(),
      items: z.array(InsuranceReportItemSchema),
    })
  ),
  totalItems: z.number(),
  totalValue: z.number(),
});

export const inventoryReportsContract = c.router({
  dashboard: {
    method: 'GET',
    path: '/reports/dashboard',
    responses: { 200: z.object({ data: DashboardSummarySchema }) },
    summary: 'Dashboard summary (counts, totals, warranty alerts, recent items)',
  },
  warranties: {
    method: 'GET',
    path: '/reports/warranties',
    responses: { 200: z.object({ data: z.array(WarrantyItemSchema) }) },
    summary: 'Items with a warranty expiry, sorted by expiry',
  },
  insuranceReport: {
    method: 'GET',
    path: '/reports/insurance',
    query: z.object({
      locationId: z.string().optional(),
      includeChildren: QueryBool.optional(),
      sortBy: z.enum(['value', 'name', 'type']).optional(),
    }),
    responses: { 200: z.object({ data: InsuranceReportResultSchema }) },
    summary: 'Insurance report: items grouped by location with totals',
  },
  valueByLocation: {
    method: 'GET',
    path: '/reports/value-by-location',
    responses: { 200: z.object({ data: z.array(ValueBreakdownEntrySchema) }) },
    summary: 'Replacement-value breakdown grouped by location',
  },
  valueByType: {
    method: 'GET',
    path: '/reports/value-by-type',
    responses: { 200: z.object({ data: z.array(ValueBreakdownEntrySchema) }) },
    summary: 'Replacement-value breakdown grouped by item type',
  },
});
