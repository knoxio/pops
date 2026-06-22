import type { Row } from '@tanstack/react-table';

export const dateRangeFilter = <TData>(row: TData, columnId: string, filterValue: unknown) => {
  const [start, end] = filterValue as [string, string];
  const cellValue = (row as Row<unknown>).getValue(columnId) as string;

  if (!start && !end) return true;
  if (!cellValue) return false;

  const date = new Date(cellValue);
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;

  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;

  return true;
};

export const numberRangeFilter = <TData>(row: TData, columnId: string, filterValue: unknown) => {
  const [min, max] = filterValue as [number, number];
  const cellValue = (row as Row<unknown>).getValue(columnId) as number;

  if (min === undefined && max === undefined) return true;
  if (cellValue === undefined || cellValue === null) return false;

  if (min !== undefined && cellValue < min) return false;
  if (max !== undefined && cellValue > max) return false;

  return true;
};

export const multiSelectFilter = <TData>(row: TData, columnId: string, filterValue: unknown) => {
  const values = filterValue as string[];
  if (!values || values.length === 0) return true;
  const cellValue = (row as Row<unknown>).getValue(columnId);
  return values.includes(String(cellValue));
};
