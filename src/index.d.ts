export type AutoIncSettings = {
  // If this is to be run on a migration for existing records. Only set this on migration processes.
  migrate: boolean,
  // The model to configure the plugin for.
  model?: string | null,
  // The field the plugin should track.
  field: string,
  // The field by which to group documents, allowing for each grouping to be incremented separately.
  groupingField: string,
  // The number the count should start at.
  startAt: number,
  // The number by which to increment the count each time.
  incrementBy: number,
  // Should we create a unique index for the field,
  unique: boolean,
  // function that modifies the output of the counter.
  outputFilter?: (count: number) => number,
};

export type AutoIncOptions = string | AutoIncSettings;

// Initialize plugin by creating counter collection in database.
export function initialize(connection: any): void;

// Declare a function to get the next counter for the model/schema.
export function nextCount(settings: AutoIncSettings, groupingFieldValue?: string): Promise<number>;

// Declare a function to reset counter at the start value - increment value.
export function resetCount(settings: AutoIncSettings, groupingFieldValue?: string): Promise<number>;

// The function to use when invoking the plugin on a custom schema.
export function autoIncrement(schema: any, options: AutoIncOptions): void;
