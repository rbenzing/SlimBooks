// Generic TypeScript utility types for better development experience

// Type utilities for better TypeScript experience
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Maybe<T> = T | null | undefined;

// Generic utility types (these override built-in TypeScript types for consistency)
export type Partial<T> = {
  [P in keyof T]?: T[P];
};

export type Required<T> = {
  [P in keyof T]-?: T[P];
};

export type Pick<T, K extends keyof T> = {
  [P in K]: T[P];
};

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

// Record types for common patterns
export type StringRecord = Record<string, string>;
export type NumberRecord = Record<string, number>;
export type BooleanRecord = Record<string, boolean>;
export type UnknownRecord = Record<string, unknown>;

// Function types
export type VoidFunction = () => void;
export type AsyncVoidFunction = () => Promise<void>;
export type Callback<T> = (value: T) => void;
export type AsyncCallback<T> = (value: T) => Promise<void>;
export type EventHandler<T = Event> = (event: T) => void;

// Generic array and object types
export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;
export type ObjectValues<T> = T[keyof T];
export type ObjectKeys<T> = keyof T;

// Conditional types
export type NonNullable<T> = T extends null | undefined ? never : T;
export type Awaited<T> = T extends Promise<infer U> ? U : T;

// Brand types for type safety
export type Brand<T, B> = T & { readonly __brand: B };

// ID types
export type ID = Brand<number, 'ID'>;
export type UUID = Brand<string, 'UUID'>;

// Date and time types
export type ISOString = Brand<string, 'ISOString'>;
export type DateString = Brand<string, 'DateString'>;
export type TimeString = Brand<string, 'TimeString'>;

// Currency and numeric types
export type Currency = Brand<number, 'Currency'>;
export type Percentage = Brand<number, 'Percentage'>;
export type PositiveNumber = Brand<number, 'PositiveNumber'>;

// URL and file types
export type URLString = Brand<string, 'URL'>;
export type EmailString = Brand<string, 'Email'>;
export type PhoneString = Brand<string, 'Phone'>;
export type FileSize = Brand<number, 'FileSize'>;

// Invoice numbering types
export interface InvoiceNumberSettings {
  prefix: string;
}

// Date and time formatting types
export interface DateTimeSettings {
  dateFormat: string;
  timeFormat: string;
}

// Pagination settings
export interface PaginationSettings {
  defaultItemsPerPage: number;
  availablePageSizes: number[];
  maxItemsPerPage: number;
  showItemsPerPageSelector: boolean;
  showPageNumbers: boolean;
  maxPageNumbers: number;
}

// Date range filtering
export interface DateRangeFilterOption {
  value: string; // DateRangePeriod value, from '@/utils/data'
  label: string;
  getDateRange: () => { start: Date; end: Date };
}

