import { Schema } from 'mongoose';

export type AutoIncSettings = {
  // If this is to be run on a migration for existing records. Only set this on migration processes.
  migrate?: boolean,
  // The model to configure the plugin for.
  model: string,
  // The field the plugin should track.
  field?: string,
  // The field by which to group documents, allowing for each grouping to be incremented separately.
  groupingField?: string,
  // The number the count should start at.
  startAt?: number,
  // The number by which to increment the count each time.
  incrementBy?: number,
  // Should we create a unique index for the field,
  unique?: boolean,
  // function that modifies the output of the counter.
  outputFilter?: (count: number) => number,
};

export type AutoIncOptions = AutoIncSettings | Object | string;

/**
 * The function to use when invoking the plugin on a custom schema.
 */
declare function autoIncrement(schema: Schema, options?: AutoIncOptions): void;

// Alias for autoIncrement
export function plugin(schema: Schema, options: AutoIncOptions): void;
