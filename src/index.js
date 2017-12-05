// @flow

import mongoose, {
  type MongooseConnection,
  type MongooseSchema,
  type MongooseDocument,
} from 'mongoose';

export type AutoIncSettings = {|
  migrate: boolean, // If this is to be run on a migration for existing records. Only set this on migration processes.
  model: ?string, // The model to configure the plugin for.
  field: string, // The field the plugin should track.
  groupingField: string, // The field by which to group documents, allowing for each grouping to be incremented separately.
  startAt: number, // The number the count should start at.
  incrementBy: number, // The number by which to increment the count each time.
  unique: boolean, // Should we create a unique index for the field,
  outputFilter?: (count: number) => number, // function that modifies the output of the counter.
|};
export type AutoIncOptions = string | $Shape<AutoIncSettings>;

let IdentityCounter;

const counterSchema = new mongoose.Schema({
  model: { type: String, required: true },
  field: { type: String, required: true },
  groupingField: { type: String, default: '' },
  count: { type: Number, default: 0 },
});

counterSchema.index(
  {
    field: 1,
    groupingField: 1,
    model: 1,
  },
  {
    unique: true,
  }
);

// Initialize plugin by creating counter collection in database.
export function initialize(connection: MongooseConnection): void {
  try {
    IdentityCounter = connection.model('IdentityCounter');
  } catch (ex) {
    if (ex.name === 'MissingSchemaError') {
      // Create model using new schema.
      IdentityCounter = connection.model('IdentityCounter', counterSchema);
    } else {
      throw ex;
    }
  }
}

async function save(settings: AutoIncSettings, doc: MongooseDocument, next: Function) {
  try {
    let counter = await IdentityCounter.findOne({
      model: settings.model,
      field: settings.field,
      groupingField: doc.get(settings.groupingField) || '',
    }).exec();

    if (!counter) {
      // If no counter exists then create one and save it.
      counter = new IdentityCounter({
        model: settings.model,
        field: settings.field,
        groupingField: doc.get(settings.groupingField) || '',
        count: settings.startAt - settings.incrementBy,
      });
      counter = await counter.save();
    }

    if (typeof doc.get(settings.field) === 'number') {
      // check that a number has already been provided, and update the counter
      // to that number if it is greater than the current count
      await IdentityCounter.findOneAndUpdate(
        {
          model: settings.model,
          field: settings.field,
          groupingField: doc.get(settings.groupingField) || '',
          count: { $lt: doc.get(settings.field) },
        },
        {
          count: doc.get(settings.field),
        }
      ).exec();
    } else {
      // Find the counter collection entry for this model and field and update it.
      let { count } = await IdentityCounter.findOneAndUpdate(
        {
          model: settings.model,
          field: settings.field,
          groupingField: doc.get(settings.groupingField) || '',
        },
        {
          // Increment the count by `incrementBy`.
          $inc: { count: settings.incrementBy },
        },
        {
          // new:true specifies that the callback should get the counter AFTER it is updated (incremented).
          new: true,
        }
      ).exec();

      // if an output filter was provided, apply it.
      if (typeof settings.outputFilter === 'function') {
        count = settings.outputFilter(count);
      }

      // If there are no errors then go ahead and set the document's field to the current count.
      doc.set(settings.field, count);

      // $FlowFixMe
      doc.__maiRanOnce = true; // eslint-disable-line
    }

    next();
  } catch (err) {
    if (err.name === 'MongoError' && err.code === 11000) {
      setTimeout(() => save(settings, doc, next), 5);
    } else {
      next(err);
    }
  }
}

// Declare a function to get the next counter for the model/schema.
export async function nextCount(
  settings: AutoIncSettings,
  groupingFieldValue?: string
): Promise<number> {
  const counter = await IdentityCounter.findOne({
    model: settings.model,
    field: settings.field,
    groupingField: groupingFieldValue || '',
  }).exec();

  return counter === null ? settings.startAt : counter.count + settings.incrementBy;
}

// Declare a function to reset counter at the start value - increment value.
export async function resetCount(
  settings: AutoIncSettings,
  groupingFieldValue?: string
): Promise<number> {
  await IdentityCounter.findOneAndUpdate(
    { model: settings.model, field: settings.field, groupingField: groupingFieldValue || '' },
    { count: settings.startAt - settings.incrementBy },
    { new: true } // new: true specifies that the callback should get the updated counter.
  ).exec();

  return settings.startAt;
}

// The function to use when invoking the plugin on a custom schema.
export function autoIncrement(schema: MongooseSchema<MongooseDocument>, options: AutoIncOptions) {
  const compoundIndex = {};

  // Default settings and plugin scope variables.
  let settings: AutoIncSettings = {
    migrate: false, // If this is to be run on a migration for existing records. Only set this on migration processes.
    model: null, // The model to configure the plugin for.
    field: '_id', // The field the plugin should track.
    groupingField: '', // The field by which to group documents, allowing for each grouping to be incremented separately.
    startAt: 0, // The number the count should start at.
    incrementBy: 1, // The number by which to increment the count each time.
    unique: true, // Should we create a unique index for the field,
    outputFilter: undefined, // function that modifies the output of the counter.
  };

  // If we don't have reference to the counterSchema or the IdentityCounter model
  // then the plugin was most likely not initialized properly so throw an error.
  if (!counterSchema || !IdentityCounter) {
    throw new Error('mongoose-auto-increment has not been initialized');
  }

  switch (typeof options) {
    // If string, the user chose to pass in just the model name.
    case 'string':
      settings.model = options;
      break;
    // If object, the user passed in a hash of options.
    case 'object':
      settings = ({ ...settings, ...options }: any);
      break;
    default:
  }

  if (typeof settings.model !== 'string') {
    throw new Error('model must be set');
  }

  if (settings.field === '_id') {
    if (settings.groupingField.length) {
      throw new Error('Cannot use a grouping field with _id, choose a different field name.');
    }
  }

  if (!schema.path(settings.field) || settings.field === '_id') {
    schema.path(settings.field, Number);
  }

  if (settings.groupingField.length) {
    // If a groupingField is specified, create a compound unique index.
    compoundIndex[settings.field] = 1;
    compoundIndex[settings.groupingField] = 1;
    schema.index(compoundIndex, { unique: settings.unique });
  } else if (settings.field !== '_id') {
    // Otherwise, add the unique index directly to the custom field.
    schema.path(settings.field).index({ unique: settings.unique });
  }

  // Add nextCount as both a method on documents and a static on the schema for convenience.
  schema.method('nextCount', (groupingFieldValue?: string) =>
    nextCount(settings, groupingFieldValue)
  );
  // $FlowFixMe
  schema.static('nextCount', (groupingFieldValue?: string) =>
    nextCount(settings, groupingFieldValue)
  );

  // Add resetCount as both a method on documents and a static on the schema for convenience.
  schema.method('resetCount', (groupingFieldValue?: string) =>
    resetCount(settings, groupingFieldValue)
  );
  // $FlowFixMe
  schema.static('resetCount', (groupingFieldValue?: string) =>
    resetCount(settings, groupingFieldValue)
  );

  // Every time documents in this schema are saved, run this logic.
  schema.pre('validate', async function preValidate(next: Function) {
    // Get reference to the document being saved.
    const doc = this;
    const ranOnce = doc.__maiRanOnce === true;

    // Only do this if it is a new document & the field doesn't have
    // a value set (see http://mongoosejs.com/docs/api.html#document_Document-isNew)
    if ((doc.isNew && ranOnce === false) || settings.migrate) {
      save(settings, doc, next);
    } else {
      // If the document does not have the field we're interested in or that field isn't a number AND the user did
      // not specify that we should increment on updates, then just continue the save without any increment logic.
      next();
    }
  });
}
